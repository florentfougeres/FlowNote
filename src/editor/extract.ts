import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { VaultBridge } from "./bridge";
import type { BlockRef } from "./blocks";
import { markdownForClipboard } from "./clipboard";
import { sectionOf } from "./sections";
import { dirname, linkTextFor, sanitizeName, uniquePath } from "../vault/links";

/**
 * Extracting part of a note into a new one, as Obsidian's note composer does:
 * the text goes to a note created next to this one, a `[[link]]` to it takes
 * its place. A heading's section leaves its heading, with the link under it.
 */

export interface ExtractRange {
  from: number;
  to: number;
  /** The name offered for the new note. */
  name: string;
}

/** A name from the text: its first heading, or its first line, shortened. */
function nameFrom(doc: PMNode, from: number, to: number): string {
  let heading = "";
  doc.nodesBetween(from, to, (node) => {
    if (heading) return false;
    if (node.type.name === "heading") heading = node.textContent;
    return !heading;
  });
  const line = (heading || doc.textBetween(from, to, "\n", " ")).split("\n").find((l) => l.trim()) ?? "";
  const name = sanitizeName(line);
  return name.length > 60 ? name.slice(0, 60).replace(/\s+\S*$/, "") : name;
}

/** The selected text. */
export function selectionRange(doc: PMNode, from: number, to: number): ExtractRange | null {
  return from < to ? { from, to, name: nameFrom(doc, from, to) } : null;
}

/** A block of the handle's menu; for a heading, the blocks of its section under it. */
export function blockRange(doc: PMNode, block: BlockRef): ExtractRange | null {
  const section = block.node.type.name === "heading" ? sectionOf(doc, block.pos) : null;
  if (section) {
    const from = block.pos + block.node.nodeSize;
    return from < section.end ? { from, to: section.end, name: sanitizeName(block.node.textContent) } : null;
  }
  return { from: block.pos, to: block.pos + block.node.nodeSize, name: nameFrom(doc, block.pos, block.pos + block.node.nodeSize) };
}

/**
 * Asks for the new note's name, creates it with the range's Markdown and puts
 * a link in place of the range. Nothing changes if the name is not given, or
 * if the note was edited meanwhile.
 */
export async function extractToNote(editor: Editor, bridge: VaultBridge, range: ExtractRange): Promise<void> {
  const before = editor.state.doc;
  const markdown = markdownForClipboard(before.slice(range.from, range.to));
  if (!markdown.trim()) return;
  const name = await bridge.askName("Extraire vers une nouvelle note", range.name || "Sans titre");
  const clean = name && sanitizeName(name);
  if (!clean || editor.isDestroyed || !editor.state.doc.eq(before)) return;
  const path = uniquePath(dirname(bridge.notePath), `${clean}.md`, bridge.files);
  await bridge.createFile(path, `${markdown}\n`);
  if (editor.isDestroyed || !editor.state.doc.eq(before)) {
    bridge.notify?.(`Note créée, la sélection est restée en place : ${path}`);
    return;
  }
  const { schema } = editor.state;
  const link = schema.nodes.wikilink.create({ target: linkTextFor(path, bridge.files.includes(path) ? bridge.files : [...bridge.files, path]), alias: null, embed: false });
  editor.view.dispatch(editor.state.tr.replaceRangeWith(range.from, range.to, link).scrollIntoView());
  editor.view.focus();
  bridge.notify?.(`Extrait vers « ${clean} »`);
}
