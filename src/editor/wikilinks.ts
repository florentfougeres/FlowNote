import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { basename, dirname, linkTextFor, newNoteFolder, noteTitle, relativePath, sanitizeName, uniquePath } from "../vault/links";
import type { BridgeRef, VaultBridge } from "./bridge";
import { isImage } from "./bridge";
import { dismissPlugin, isDismissed, menuRenderer, MenuStore, normalizeText, type MenuItem } from "./menu";

/**
 * `[[` autocompletes notes, `![[` autocompletes every file of the vault. The
 * inserted link uses Obsidian's shortest unambiguous form, or a Markdown link
 * when the vault is configured without wikilinks.
 */

export interface LinkItem extends MenuItem {
  path: string | null;
  /** Name of the note to create when `path` is null. */
  create?: string;
}

const dismissedKey = new PluginKey<number | null>("wikilinkDismissed");
const MAX_ITEMS = 30;

export function linkItems(query: string, files: string[], embed: boolean): LinkItem[] {
  const q = normalizeText(query.split("|")[0].trim());
  const candidates = embed ? files : files.filter((f) => f.endsWith(".md"));
  const scored = candidates
    .map((path) => {
      const name = normalizeText(embed ? basename(path) : noteTitle(path));
      const full = normalizeText(path);
      const score = q === "" ? 1 : name.startsWith(q) ? 4 : name.includes(q) ? 3 : full.includes(q) ? 2 : 0;
      return { path, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path, "fr"))
    .slice(0, MAX_ITEMS);
  const items: LinkItem[] = scored.map(({ path }) => ({
    key: path,
    path,
    title: path.endsWith(".md") ? noteTitle(path) : basename(path),
    description: dirname(path) || "Racine du vault",
    icon: path.endsWith(".md") ? "📄" : isImage(path) ? "🖼" : "📎",
  }));
  const name = sanitizeName(query.split("|")[0]);
  const exists = candidates.some((f) => normalizeText(noteTitle(f)) === normalizeText(name));
  if (!embed && name && !exists) items.push({ key: "__create", path: null, create: name, title: `Créer « ${name} »`, description: "Nouvelle note", icon: "＋" });
  return items;
}

/** Inserts a link to `path` in place of `range` (the typed `[[query`). */
function insertLink(editor: Editor, bridge: VaultBridge, range: Range, path: string, embed: boolean, alias: string | null) {
  const { schema } = editor;
  if (bridge.config.useMarkdownLinks) {
    const href = encodeURI(relativePath(bridge.notePath, path));
    const label = alias ?? (path.endsWith(".md") ? noteTitle(path) : basename(path));
    const content = embed
      ? schema.nodes.image.create({ src: href, alt: label, raw: `![${label}](${href})` })
      : schema.text(label, [schema.marks.link.create({ href, title: null, kind: "inline" })]);
    editor.chain().focus().insertContentAt(range, content.toJSON()).run();
    return;
  }
  const node = schema.nodes.wikilink.create({ target: linkTextFor(path, bridge.files), alias, embed });
  editor.chain().focus().insertContentAt(range, node.toJSON()).run();
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
        items: ({ query, editor: e }) => {
          const { selection } = e.state;
          const from = selection.from - query.length - 2;
          const embed = e.state.doc.textBetween(Math.max(0, from - 1), Math.max(0, from)) === "!";
          return linkItems(query.replace(/\]+$/, ""), bridge.current.files, embed);
        },
        command: ({ editor: e, range, props }) => {
          const embed = isEmbed(range);
          const full = embed ? { from: range.from - 1, to: range.to } : range;
          // Swallow a "]]" already present after the cursor.
          if (e.state.doc.textBetween(full.to, Math.min(full.to + 2, e.state.doc.content.size)) === "]]") full.to += 2;
          const query = e.state.doc.textBetween(range.from + 2, range.to);
          const alias = query.includes("|") ? query.slice(query.indexOf("|") + 1).trim() || null : null;
          const current = bridge.current;
          if (props.path) return insertLink(e, current, full, props.path, embed, alias);
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
