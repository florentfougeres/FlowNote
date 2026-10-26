import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { headingLinkText, noteBlocks, noteHeadings, type NoteHeading } from "../markdown/sections";
import { basename, dirname, linkTextFor, newNoteFolder, noteTitle, relativePath, resolveLink, sanitizeName, uniquePath } from "../vault/links";
import { docBlocks, docHeadings, ensureBlockId } from "./blockLinks";
import type { BridgeRef, VaultBridge } from "./bridge";
import { isImage } from "./bridge";
import { dismissPlugin, isDismissed, menuRenderer, MenuStore, normalizeText, type MenuItem } from "./menu";

/**
 * `[[` autocompletes notes (by title or alias), `![[` every file of the vault.
 * After a note, `#` lists its headings and `#^` its blocks (`[[#` those of the
 * note itself). The inserted link uses Obsidian's shortest unambiguous form,
 * or a Markdown link when the vault is configured without wikilinks.
 */

export interface LinkItem extends MenuItem {
  path: string | null;
  /** Name of the note to create when `path` is null. */
  create?: string;
  /** The alias the note was found by, written as the link's text. */
  alias?: string;
  /** A heading of the note (`#Titre`). */
  heading?: string;
  /** A block of the note (`#^id`): an identifier is added to it first when it has none. */
  block?: { line: number; pos: number | null; id: string | null };
}

const dismissedKey = new PluginKey<number | null>("wikilinkDismissed");
const MAX_ITEMS = 30;

export function linkItems(query: string, files: string[], embed: boolean, aliases: Map<string, string[]> = new Map()): LinkItem[] {
  const q = normalizeText(query.split("|")[0].trim());
  const candidates = embed ? files : files.filter((f) => f.endsWith(".md"));
  const rank = (name: string, full = "") => {
    const n = normalizeText(name);
    return q === "" ? 1 : n.startsWith(q) ? 4 : n.includes(q) ? 3 : full && normalizeText(full).includes(q) ? 2 : 0;
  };
  const scored = candidates
    .map((path) => {
      const score = rank(embed ? basename(path) : noteTitle(path), path);
      // An alias counts when it matches better than the note's name.
      const alias = q === "" || embed ? undefined : (aliases.get(path) ?? []).find((a) => rank(a) > score);
      return { path, alias, score: alias ? rank(alias) : score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path, "fr"))
    .slice(0, MAX_ITEMS);
  const items: LinkItem[] = scored.map(({ path, alias }) => ({
    key: alias ? `${path}|${alias}` : path,
    path,
    alias,
    title: alias ?? (path.endsWith(".md") ? noteTitle(path) : basename(path)),
    description: alias ? `${noteTitle(path)} · ${dirname(path) || "Racine du vault"}` : dirname(path) || "Racine du vault",
    icon: alias ? "↪" : path.endsWith(".md") ? "📄" : isImage(path) ? "🖼" : "📎",
  }));
  const name = sanitizeName(query.split("|")[0]);
  const same = (n: string) => normalizeText(n) === normalizeText(name);
  const exists = candidates.some((f) => same(noteTitle(f)) || (aliases.get(f) ?? []).some(same));
  if (!embed && name && !exists) items.push({ key: "__create", path: null, create: name, title: `Créer « ${name} »`, description: "Nouvelle note", icon: "＋" });
  return items;
}

/** The headings (`#…`) or blocks (`#^…`) of the note at `path` matching `sub`, the text after the `#`. */
export function anchorItems(sub: string, path: string, headings: NoteHeading[], blocks: { line: number; pos: number | null; text: string; id: string | null }[]): LinkItem[] {
  const short = (text: string) => (text.length > 80 ? `${text.slice(0, 79)}…` : text);
  if (sub.startsWith("^")) {
    const q = normalizeText(sub.slice(1));
    return blocks
      .filter((b) => normalizeText(b.text).includes(q) || (b.id !== null && normalizeText(b.id).startsWith(q)))
      .slice(0, MAX_ITEMS)
      .map((b) => ({ key: `^${b.line}:${b.pos}`, path, block: { line: b.line, pos: b.pos, id: b.id }, title: short(b.text), description: b.id ? `^${b.id}` : "Bloc", icon: "¶" }));
  }
  const parts = sub.split("#");
  const q = normalizeText(parts[parts.length - 1]);
  return headings
    .filter((h) => headingLinkText(h.text) && normalizeText(h.text).includes(q))
    .slice(0, MAX_ITEMS)
    .map((h, i) => ({ key: `#${i}:${h.text}`, path, heading: headingLinkText(h.text), title: h.text, description: `Titre ${h.level}`, icon: "#" }));
}

/** Inserts a link to `path` (and `subpath`, `#Titre` or `#^id`) in place of `range` (the typed `[[query`). */
function insertLink(editor: Editor, bridge: VaultBridge, range: Range, path: string, embed: boolean, alias: string | null, subpath = "") {
  const { schema } = editor;
  const self = subpath !== "" && path === bridge.notePath && !embed;
  if (bridge.config.useMarkdownLinks) {
    const href = (self ? "" : encodeURI(relativePath(bridge.notePath, path))) + (subpath ? `#${encodeURI(subpath.slice(1))}` : "");
    const label = alias ?? (path.endsWith(".md") ? noteTitle(path) : basename(path)) + (subpath ? ` › ${subpath.slice(1).replace(/^\^/, "")}` : "");
    const content = embed
      ? schema.nodes.image.create({ src: href, alt: label, raw: `![${label}](${href})` })
      : schema.text(label, [schema.marks.link.create({ href, title: null, kind: "inline" })]);
    editor.chain().focus().insertContentAt(range, content.toJSON()).run();
    return;
  }
  const target = (self ? "" : linkTextFor(path, bridge.files)) + subpath;
  const node = schema.nodes.wikilink.create({ target, alias, embed });
  editor.chain().focus().insertContentAt(range, node.toJSON()).run();
}

/** The typed query split at its `#`: the note part (null without `#`) and what follows. */
function splitQuery(query: string): { note: string | null; sub: string } {
  const link = query.split("|")[0];
  const hash = link.indexOf("#");
  return hash < 0 ? { note: null, sub: "" } : { note: link.slice(0, hash).trim(), sub: link.slice(hash + 1) };
}

/** Headings and blocks of the note: from the editor for the open note, from its file for another one. */
async function anchors(editor: Editor, bridge: VaultBridge, path: string): Promise<{ headings: NoteHeading[]; blocks: { line: number; pos: number | null; text: string; id: string | null }[] }> {
  if (path === bridge.notePath) {
    return { headings: docHeadings(editor.state.doc), blocks: docBlocks(editor.state.doc).map((b) => ({ ...b, line: -1, pos: b.pos })) };
  }
  const text = bridge.readNote ? await bridge.readNote(path).catch(() => "") : "";
  return { headings: noteHeadings(text), blocks: noteBlocks(text).map((b) => ({ ...b, pos: null })) };
}

/** Links to a block, giving it an identifier first when it has none (in the editor for the open note, in its file otherwise). */
async function linkBlock(editor: Editor, bridge: VaultBridge, range: Range, path: string, block: NonNullable<LinkItem["block"]>, embed: boolean, alias: string | null) {
  let id = block.id;
  let at = range;
  if (!id && block.pos !== null) {
    const length = editor.state.doc.content.size;
    id = ensureBlockId(editor, { pos: block.pos, text: "", id: null });
    // The identifier went before the typed link: the link moved as much.
    if (block.pos < range.from) {
      const shift = editor.state.doc.content.size - length;
      at = { from: range.from + shift, to: range.to + shift };
    }
  } else if (!id && bridge.addBlockId) {
    try {
      id = await bridge.addBlockId(path, block.line);
    } catch (error) {
      bridge.notify?.(String(error));
      return;
    }
  }
  if (id) insertLink(editor, bridge, at, path, embed, alias, `#^${id}`);
}

export const WikilinkSuggest = Extension.create<{ store: MenuStore<LinkItem>; bridge: BridgeRef }>({
  name: "wikilinkSuggest",
  priority: 300,

  addOptions() {
    return { store: new MenuStore<LinkItem>(), bridge: { current: undefined as unknown as VaultBridge } };
  },

  addProseMirrorPlugins() {
    const { editor } = this;
    const { store, bridge } = this.options;
    const isEmbed = (range: Range) => editor.state.doc.textBetween(Math.max(0, range.from - 1), range.from) === "!";

    return [
      dismissPlugin(dismissedKey),
      Suggestion<LinkItem, LinkItem>({
        editor,
        pluginKey: new PluginKey("wikilinkSuggestion"),
        char: "[[",
        allowSpaces: true,
        allowedPrefixes: null,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return !$from.parent.type.spec.code && !isDismissed(dismissedKey, state, range.from);
        },
        items: async ({ query, editor: e }) => {
          const { selection } = e.state;
          const from = selection.from - query.length - 2;
          const embed = e.state.doc.textBetween(Math.max(0, from - 1), Math.max(0, from)) === "!";
          const current = bridge.current;
          const typed = query.replace(/\]+$/, "");
          const { note, sub } = splitQuery(typed);
          if (note !== null) {
            const path = note === "" ? current.notePath : resolveLink(note, current.files, current.notePath);
            if (!path?.endsWith(".md")) return [];
            const { headings, blocks } = await anchors(e, current, path);
            return anchorItems(sub, path, headings, blocks);
          }
          return linkItems(typed, current.files, embed, embed ? undefined : await current.noteAliases?.().catch(() => undefined));
        },
        command: ({ editor: e, range, props }) => {
          const embed = isEmbed(range);
          const full = embed ? { from: range.from - 1, to: range.to } : range;
          // Swallow a "]]" already present after the cursor.
          if (e.state.doc.textBetween(full.to, Math.min(full.to + 2, e.state.doc.content.size)) === "]]") full.to += 2;
          const query = e.state.doc.textBetween(range.from + 2, range.to);
          const alias = query.includes("|") ? query.slice(query.indexOf("|") + 1).trim() || null : null;
          const current = bridge.current;
          if (props.heading && props.path) return insertLink(e, current, full, props.path, embed, alias, `#${props.heading}`);
          if (props.block && props.path) return void linkBlock(e, current, full, props.path, props.block, embed, alias);
          if (props.path) return insertLink(e, current, full, props.path, embed, props.alias ?? alias);
          // Create the note (location from Obsidian settings), then link it.
          const path = uniquePath(newNoteFolder(current.notePath, current.config), `${props.create}.md`, current.files);
          void current.createFile(path, "").then(() => insertLink(e, current, full, path, false, alias));
        },
        render: menuRenderer({
          store,
          heading: "Lier une note",
          close: (range) => editor.view.dispatch(editor.state.tr.setMeta(dismissedKey, range.from)),
        }),
      }),
    ];
  },
});
