import type { Mark, Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { mkdocsSyntax } from "../markdown/flavor";
import { IS_MAC } from "../keys";

/**
 * MkDocs Material's inline syntax, shown as it renders on the site; the text
 * itself is untouched (decorations only):
 *
 * - `++ctrl+alt+del++` keys, `^^inserted^^`, `~sub~`, `^sup^` (pymdownx);
 * - `:material-…:`, `:fontawesome-…:`, `:octicons-…:`, `:simple-…:` icons;
 * - Jinja (`{{ … }}`, `{% … %}`) as discreet chips;
 * - attribute lists (`{: .class }`) faded, a link followed by `.md-button`
 *   drawn as a button;
 * - abbreviations (`*[HTML]: …`): definitions faded, the words explained on hover.
 *
 * Like Obsidian's live preview, the Markdown markers show again while the
 * cursor is in the construct.
 */

interface Token {
  from: number;
  to: number;
  /** Style of the whole construct. */
  className: string;
  /** Marker ranges, hidden unless the cursor is in the construct. */
  markers?: [number, number][];
  /** Replaced by a widget unless the cursor is in the construct. */
  widget?: () => HTMLElement;
  /** Marks of the replaced text, kept around the widget (an icon inside a link stays in it). */
  marks?: readonly Mark[];
  title?: string;
}

const KEYS = /\+\+([^\s+](?:[^+\n]*?)(?:\+[^+\n]+?)*)\+\+/g;
const INSERT = /\^\^(?!\s)([^^\n]+?)\^\^/g;
const SUB = /(?<!~)~(?![~\s])([^~\s]+?)~(?!~)/g;
const SUP = /(?<!\^)\^(?![\^\s])([^^\s]+?)\^(?!\^)/g;
const ICON = /:((?:material|fontawesome-(?:brands|solid|regular)|octicons|simple)-[a-z0-9-]+):/g;
const JINJA = /\{\{[^\n]*?\}\}|\{%[^\n]*?%\}|\{#[^\n]*?#\}/g;
const ATTRS = /\{:?[ \t]*(?:[.#][\w-]+|[\w-]+=(?:"[^"\n]*"|[^\s}]+))(?:[ \t]+(?:[.#][\w-]+|[\w-]+=(?:"[^"\n]*"|[^\s}]+)))*[ \t]*\}/g;
const ABBREVIATION = /^\*\[([^\]\n]+)\]:[ \t]*(.*)$/;

const KEY_NAMES: Record<string, string> = {
  ctrl: IS_MAC ? "⌃" : "Ctrl",
  control: IS_MAC ? "⌃" : "Ctrl",
  alt: IS_MAC ? "⌥" : "Alt",
  option: "⌥",
  shift: IS_MAC ? "⇧" : "Maj",
  cmd: "⌘",
  command: "⌘",
  meta: IS_MAC ? "⌘" : "Meta",
  windows: "⊞",
  enter: "Entrée",
  return: "Entrée",
  tab: "Tab",
  esc: "Échap",
  escape: "Échap",
  space: "Espace",
  backspace: "⌫",
  del: "Suppr",
  delete: "Suppr",
  up: "↑",
  "arrow-up": "↑",
  down: "↓",
  "arrow-down": "↓",
  left: "←",
  "arrow-left": "←",
  right: "→",
  "arrow-right": "→",
  "page-up": "Pg↑",
  "page-down": "Pg↓",
  home: "Début",
  end: "Fin",
  "caps-lock": "Verr. maj",
};

function keyLabel(key: string): string {
  const name = key.trim().toLowerCase();
  if (KEY_NAMES[name]) return KEY_NAMES[name];
  if (name.startsWith('"') && name.endsWith('"')) return key.trim().slice(1, -1);
  return name.length === 1 ? name.toUpperCase() : name.charAt(0).toUpperCase() + name.slice(1);
}

function keysWidget(keys: string): () => HTMLElement {
  return () => {
    const span = document.createElement("span");
    span.className = "mk-keys";
    keys.split("+").forEach((key, i) => {
      if (i > 0) span.append("+");
      const kbd = document.createElement("kbd");
      kbd.textContent = keyLabel(key);
      span.append(kbd);
    });
    return span;
  };
}

// ---------------------------------------------------------------------------
// Icons, from the Iconify sets bundled with the app (loaded on first use)

interface IconSet {
  width?: number;
  height?: number;
  icons: Record<string, { body: string; width?: number; height?: number }>;
  aliases?: Record<string, { parent: string }>;
}

type SetModule = { default: unknown };
const SET_LOADERS: Record<string, () => Promise<SetModule>> = {
  material: () => import("@iconify-json/mdi/icons.json"),
  "fontawesome-brands": () => import("@iconify-json/fa6-brands/icons.json"),
  "fontawesome-solid": () => import("@iconify-json/fa6-solid/icons.json"),
  "fontawesome-regular": () => import("@iconify-json/fa6-regular/icons.json"),
  octicons: () => import("@iconify-json/octicon/icons.json"),
  simple: () => import("@iconify-json/simple-icons/icons.json"),
};
const sets = new Map<string, Promise<IconSet | null>>();

function loadSet(prefix: string): Promise<IconSet | null> {
  let set = sets.get(prefix);
  if (!set) {
    set = SET_LOADERS[prefix]()
      .then((m) => m.default as IconSet)
      .catch(() => null);
    sets.set(prefix, set);
  }
  return set;
}

/** `material-web` → ["material", "web"]; `fontawesome-brands-github` → ["fontawesome-brands", "github"]. */
function splitIcon(name: string): [string, string] {
  const prefix = Object.keys(SET_LOADERS).find((p) => name.startsWith(`${p}-`))!;
  return [prefix, name.slice(prefix.length + 1)];
}

/** SVG of a MkDocs Material icon name (`material-web`…), or null when unknown. */
export async function iconSvg(name: string): Promise<string | null> {
  const [prefix, icon] = splitIcon(name);
  const set = await loadSet(prefix);
  if (!set) return null;
  const found = set.icons[icon] ?? set.icons[set.aliases?.[icon]?.parent ?? ""];
  if (!found) return null;
  const width = found.width ?? set.width ?? 16;
  const height = found.height ?? set.height ?? 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">${found.body}</svg>`;
}

function iconWidget(name: string): () => HTMLElement {
  return () => {
    const span = document.createElement("span");
    span.className = "mk-icon";
    span.title = `:${name}:`;
    void iconSvg(name).then((svg) => {
      if (svg) span.innerHTML = svg;
      else {
        span.textContent = `:${name}:`;
        span.classList.add("missing");
      }
    });
    return span;
  };
}

// ---------------------------------------------------------------------------

function textTokens(text: string, at: number, marks: readonly Mark[], abbreviations: Map<string, string>, abbreviationPattern: RegExp | null): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(KEYS)) {
    const from = at + m.index!;
    tokens.push({ from, to: from + m[0].length, className: "mk-keys-source", widget: keysWidget(m[1]), marks });
  }
  for (const [pattern, className, size] of [
    [INSERT, "mk-ins", 2],
    [SUB, "mk-sub", 1],
    [SUP, "mk-sup", 1],
  ] as const) {
    for (const m of text.matchAll(pattern)) {
      const from = at + m.index!;
      const to = from + m[0].length;
      tokens.push({ from, to, className, markers: [[from, from + size], [to - size, to]] });
    }
  }
  for (const m of text.matchAll(ICON)) {
    const from = at + m.index!;
    tokens.push({ from, to: from + m[0].length, className: "mk-icon-source", widget: iconWidget(m[1]), marks });
  }
  for (const m of text.matchAll(JINJA)) {
    const from = at + m.index!;
    tokens.push({ from, to: from + m[0].length, className: "mk-jinja" });
  }
  for (const m of text.matchAll(ATTRS)) {
    const from = at + m.index!;
    tokens.push({ from, to: from + m[0].length, className: "mk-attrs" });
  }
  if (abbreviationPattern) {
    for (const m of text.matchAll(abbreviationPattern)) {
      const from = at + m.index!;
      tokens.push({ from, to: from + m[0].length, className: "mk-abbr", title: abbreviations.get(m[0]) });
    }
  }
  // Overlapping constructs (`^` inside Jinja…): the outermost, earliest one wins.
  tokens.sort((a, b) => a.from - b.from || b.to - a.to);
  const kept: Token[] = [];
  for (const token of tokens) if (!kept.some((k) => token.from < k.to && k.from < token.to)) kept.push(token);
  return kept;
}

function abbreviationsOf(doc: PMNode): Map<string, string> {
  const found = new Map<string, string>();
  doc.forEach((node) => {
    if (node.type.name !== "paragraph") return;
    for (const line of node.textContent.split("\n")) {
      const m = ABBREVIATION.exec(line);
      if (m) found.set(m[1], m[2]);
    }
  });
  return found;
}

interface Scan {
  tokens: Token[];
  definitions: [number, number][];
}

function scan(doc: PMNode): Scan {
  const tokens: Token[] = [];
  const definitions: [number, number][] = [];
  const abbreviations = abbreviationsOf(doc);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const abbreviationPattern = abbreviations.size > 0 ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${[...abbreviations.keys()].map(escape).join("|")})(?![\\p{L}\\p{N}_])`, "gu") : null;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    if (node.type.name === "paragraph" && node.textContent.split("\n").every((l) => ABBREVIATION.test(l))) {
      definitions.push([pos, pos + node.nodeSize]);
      return false;
    }
    let previousLink: { from: number; to: number } | null = null;
    node.forEach((child, offset) => {
      const at = pos + 1 + offset;
      const marks = child.marks.map((m) => m.type.name);
      if (!child.isText || marks.includes("code")) {
        previousLink = null;
        return;
      }
      const found = textTokens(child.text!, at, child.marks, abbreviations, marks.includes("link") ? null : abbreviationPattern);
      // `[text](url){: .md-button }`: the link is drawn as a button.
      const button = found.find((t) => t.className === "mk-attrs" && t.from === at && /\.md-button\b/.test(child.text!.slice(0, t.to - at)));
      if (button && previousLink) {
        const primary = /\.md-button--primary\b/.test(child.text!.slice(0, button.to - at));
        tokens.push({ ...previousLink, className: primary ? "mk-button primary" : "mk-button" });
      }
      tokens.push(...found);
      previousLink = marks.includes("link") ? { from: at, to: at + child.nodeSize } : null;
    });
    return false;
  });
  return { tokens, definitions };
}

function decorations(state: EditorState, scanned: Scan): DecorationSet {
  const { from: selFrom, to: selTo } = state.selection;
  const decos: Decoration[] = [];
  for (const [from, to] of scanned.definitions) decos.push(Decoration.node(from, to, { class: "mk-abbr-definition" }));
  for (const token of scanned.tokens) {
    const editing = selFrom <= token.to && selTo >= token.from;
    if (token.widget && !editing) {
      decos.push(Decoration.widget(token.from, token.widget, { side: 1, marks: token.marks, key: `${token.className}:${state.doc.textBetween(token.from, token.to)}` }));
      decos.push(Decoration.inline(token.from, token.to, { class: "mk-hidden" }));
      continue;
    }
    decos.push(Decoration.inline(token.from, token.to, token.title ? { class: token.className, title: token.title } : { class: token.className }));
    if (token.markers && !editing) for (const [a, b] of token.markers) decos.push(Decoration.inline(a, b, { class: "mk-hidden" }));
  }
  return DecorationSet.create(state.doc, decos);
}

const key = new PluginKey<Scan | null>("mkdocsInline");

export function mkdocsInlinePlugin(): Plugin {
  return new Plugin({
    key,
    state: {
      init: (_config, state) => (mkdocsSyntax() ? scan(state.doc) : null),
      apply: (tr, value, _old, state) => (!mkdocsSyntax() ? null : tr.docChanged || !value ? scan(state.doc) : value),
    },
    props: {
      decorations(state) {
        const scanned = key.getState(state);
        return scanned ? decorations(state, scanned) : DecorationSet.empty;
      },
    },
  });
}
