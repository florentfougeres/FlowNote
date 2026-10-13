import { Extension, InputRule } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { dismissPlugin, isDismissed, menuRenderer, MenuStore, normalizeText, type MenuItem } from "./menu";

/**
 * Emoji, as in Notion: typing `:cal` suggests 📆, `:calendar:` is converted
 * directly. The note stores the Unicode character, which Obsidian displays
 * without any plugin. Names are searched in English (shortcodes) and French.
 */

export interface EmojiEntry {
  emoji: string;
  label: string;
  tags: string[];
  codes: string[];
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
      entries.push({ emoji: e.unicode, label: e.label, tags: e.tags ?? [], codes });
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

  // `:calendar:` typed in full becomes the emoji.
  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|[\s(]):([a-z0-9_+-]{2,}):$/,
        handler: ({ state, range, match }) => {
          const emoji = emojiForCode(match[1]);
          if (!emoji) return null;
          const from = range.to - match[1].length - 2 + 1;
          state.tr.insertText(emoji, Math.max(range.from, from), range.to);
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { editor } = this;
    const { store } = this.options;
    return [
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
          return found.map((e) => ({ key: e.emoji, emoji: e.emoji, icon: e.emoji, title: e.codes[0] ? `:${e.codes[0]}:` : e.label, description: e.label }));
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
