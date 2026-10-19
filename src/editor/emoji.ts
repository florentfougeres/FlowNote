import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import Suggestion from "@tiptap/suggestion";
import { dismissPlugin, isDismissed, menuRenderer, MenuStore, normalizeText, type MenuItem } from "./menu";

/**
 * Emoji, as in Notion: typing `:cal` suggests 📆. The note keeps the
 * shortcode (`:calendar:`), and the editor displays every known shortcode as
 * its emoji, revealing the code while the cursor is on it. Names are searched
 * in English (shortcodes) and French.
 */

export interface EmojiEntry {
  emoji: string;
  label: string;
  tags: string[];
  codes: string[];
  /** Emojibase group (0 smileys … 9 flags). */
  group?: number;
}

export interface EmojiItem extends MenuItem {
  emoji: string;
}

let index: EmojiEntry[] | null = null;
let loading: Promise<EmojiEntry[]> | null = null;
const byCode = new Map<string, string>();

type Shortcodes = Record<string, string | string[]>;

/** Loads the emoji data (lazily: it is only needed once the user types ":"). */
export function loadEmojis(): Promise<EmojiEntry[]> {
  if (index) return Promise.resolve(index);
  loading ??= Promise.all([
    import("emojibase-data/fr/compact.json"),
    import("emojibase-data/en/shortcodes/github.json"),
    import("emojibase-data/en/shortcodes/emojibase.json"),
  ]).then(([fr, github, emojibase]) => {
    const codesOf = (hex: string) =>
      [...new Set([(github.default as Shortcodes)[hex], (emojibase.default as Shortcodes)[hex]].flat().filter((c): c is string => typeof c === "string"))];
    const entries: EmojiEntry[] = [];
    for (const e of fr.default as { hexcode: string; label: string; tags?: string[]; unicode: string; group?: number }[]) {
      if (e.group === 2) continue; // skin tone and hair components
      const codes = codesOf(e.hexcode);
      for (const code of codes) if (!byCode.has(code)) byCode.set(code, e.unicode);
      entries.push({ emoji: e.unicode, label: e.label, tags: e.tags ?? [], codes, group: e.group });
    }
    index = entries;
    return entries;
  });
  return loading;
}

export function emojiForCode(code: string): string | undefined {
  return byCode.get(code.toLowerCase());
}

export function searchEmojis(query: string, entries: EmojiEntry[], limit = 24): EmojiEntry[] {
  const q = normalizeText(query);
  if (!q) return [];
  const scored: { entry: EmojiEntry; score: number; order: number }[] = [];
  entries.forEach((entry, order) => {
    const label = normalizeText(entry.label);
    let score = 0;
    if (entry.codes.includes(q)) score = 6;
    else if (entry.codes.some((c) => c.startsWith(q))) score = 5;
    else if (label.startsWith(q)) score = 4;
    else if (entry.tags.some((t) => normalizeText(t).startsWith(q))) score = 3;
    else if (label.split(/\s+/).some((w) => w.startsWith(q))) score = 2;
    else if (label.includes(q) || entry.codes.some((c) => c.includes(q))) score = 1;
    if (score > 0) scored.push({ entry, score, order });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.entry.label.length - b.entry.label.length || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.entry);
}

const dismissedKey = new PluginKey<number | null>("emojiDismissed");

export const EmojiSuggest = Extension.create<{ store: MenuStore<EmojiItem> }>({
  name: "emojiSuggest",
  priority: 300,

  addOptions() {
    return { store: new MenuStore<EmojiItem>() };
  },

  onCreate() {
    void loadEmojis();
  },

  addProseMirrorPlugins() {
    const { editor } = this;
    const { store } = this.options;
    return [
      shortcodePlugin(),
      dismissPlugin(dismissedKey),
      Suggestion<EmojiItem, EmojiItem>({
        editor,
        pluginKey: new PluginKey("emojiSuggestion"),
        char: ":",
        allowedPrefixes: [" ", "(", " "],
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code && !isDismissed(dismissedKey, state, range.from),
        // Two letters at least: "Note : texte" and "12:30" never open the menu.
        items: async ({ query }) => {
          if (query.length < 2 || query.includes(":")) return [];
          const found = searchEmojis(query, await loadEmojis());
          return found.map((e) => {
            const code = e.codes.find((c) => emojiForCode(c) === e.emoji);
            // The shortcode goes in the note; the character only when there is none.
            return { key: e.emoji, emoji: code ? `:${code}:` : e.emoji, icon: e.emoji, title: code ? `:${code}:` : e.label, description: e.label };
          });
        },
        command: ({ editor: e, range, props }) => {
          e.chain().focus().insertContentAt(range, props.emoji).run();
        },
        render: menuRenderer({
          store,
          heading: "Emoji",
          close: (range) => editor.view.dispatch(editor.state.tr.setMeta(dismissedKey, range.from)),
        }),
      }),
    ];
  },
});

/* ---- Shortcodes displayed as emoji ---- */

const SHORTCODE = /(?<![\w:]):([a-z0-9_+-]+):(?!:)/gi;

interface Shortcode {
  from: number;
  to: number;
  emoji: string;
}

const shortcodeCache = new WeakMap<PMNode, { from: number; to: number; emoji: string }[]>();

/** Known shortcodes of one text block (code excluded), relative to the block's content. */
function blockShortcodes(block: PMNode): { from: number; to: number; emoji: string }[] {
  let found = shortcodeCache.get(block);
  if (found) return found;
  found = [];
  let offset = 0;
  block.forEach((child) => {
    if (child.isText && !child.marks.some((m) => m.type.name === "code" || m.type.spec.code)) {
      for (const match of child.text!.matchAll(SHORTCODE)) {
        const emoji = emojiForCode(match[1]);
        if (emoji) found!.push({ from: offset + match.index, to: offset + match.index + match[0].length, emoji });
      }
    }
    offset += child.nodeSize;
  });
  shortcodeCache.set(block, found);
  return found;
}

export function findShortcodes(doc: PMNode): Shortcode[] {
  const all: Shortcode[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (!node.type.spec.code) for (const s of blockShortcodes(node)) all.push({ from: pos + 1 + s.from, to: pos + 1 + s.to, emoji: s.emoji });
    return false;
  });
  return all;
}

const shortcodeKey = new PluginKey<Shortcode[]>("emojiShortcodes");

function emojiWidget(emoji: string) {
  return () => {
    const span = document.createElement("span");
    span.className = "emoji-shortcode";
    span.textContent = emoji;
    return span;
  };
}

function shortcodePlugin(): Plugin {
  return new Plugin<Shortcode[]>({
    key: shortcodeKey,
    state: {
      init: (_config, state) => (index ? findShortcodes(state.doc) : []),
      apply: (tr, value, _old, state) => (tr.docChanged || tr.getMeta(shortcodeKey) ? (index ? findShortcodes(state.doc) : []) : value),
    },
    view(view) {
      // The emoji data loads lazily: display the shortcodes once it is there.
      if (!index) void loadEmojis().then(() => !view.isDestroyed && view.dispatch(view.state.tr.setMeta(shortcodeKey, true).setMeta("addToHistory", false)));
      return {};
    },
    props: {
      decorations(state: EditorState) {
        const codes = shortcodeKey.getState(state) ?? [];
        if (codes.length === 0) return null;
        const { from, to } = state.selection;
        const decorations: Decoration[] = [];
        for (const code of codes) {
          // The code being edited stays visible as text.
          if (from <= code.to && to >= code.from) continue;
          decorations.push(Decoration.widget(code.from, emojiWidget(code.emoji), { side: -1, key: `emoji-${code.emoji}`, ignoreSelection: true }));
          decorations.push(Decoration.inline(code.from, code.to, { class: "emoji-shortcode-source" }));
        }
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}
