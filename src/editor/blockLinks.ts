import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { BLOCK_ID, newBlockId, type NoteHeading } from "../markdown/sections";
import { changedRanges } from "./tags";

/**
 * The headings and blocks of the note open in the editor, for links to them
 * (`[[#Titre]]`, `[[Note#^id]]`): read from the document, not the file, which
 * may be behind. A block is a paragraph, or the first paragraph of a list
 * item, where Obsidian writes its identifier (` ^id` at the end of the line).
 */

export interface DocBlock {
  /** Position right before the paragraph that holds the identifier. */
  pos: number;
  text: string;
  id: string | null;
}

export function docHeadings(doc: PMNode): NoteHeading[] {
  const headings: NoteHeading[] = [];
  doc.descendants((node) => {
    if (node.type.name === "heading") headings.push({ level: node.attrs.level as number, text: node.textContent });
    return node.type.name !== "heading" && node.type.name !== "codeBlock";
  });
  return headings;
}

export function docBlocks(doc: PMNode): DocBlock[] {
  const blocks: DocBlock[] = [];
  doc.descendants((node, pos, parent) => {
    if (node.type.name === "paragraph" && (parent === doc || (parent?.type.name === "listItem" && parent.firstChild === node))) {
      const text = node.textContent.replace(BLOCK_ID, "").trim();
      if (text) blocks.push({ pos, text, id: BLOCK_ID.exec(node.textContent)?.[1] ?? null });
      return false;
    }
    return parent === doc ? node.type.name === "list" : node.type.name === "list" || node.type.name === "listItem";
  });
  return blocks;
}

/** The block's identifier, added at the end of its paragraph (one undo step) when it has none. */
export function ensureBlockId(editor: Editor, block: DocBlock): string {
  if (block.id) return block.id;
  const id = newBlockId(docBlocks(editor.state.doc).flatMap((b) => (b.id ? [b.id] : [])));
  const paragraph = editor.state.doc.nodeAt(block.pos);
  if (!paragraph) return id;
  editor.view.dispatch(editor.state.tr.insertText(` ^${id}`, block.pos + paragraph.nodeSize - 1));
  return id;
}

/** The block holding `pos`: a paragraph, or a list item's first paragraph. */
export function blockAtPos(doc: PMNode, pos: number): DocBlock | null {
  return (
    docBlocks(doc).find((b) => {
      const node = doc.nodeAt(b.pos);
      return node !== null && pos >= b.pos && pos <= b.pos + node.nodeSize;
    }) ?? null
  );
}

/** Decorations of the block identifiers of the paragraphs between `from` and `to`. */
function blockIdDecorations(doc: PMNode, from: number, to: number): Decoration[] {
  const decorations: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos, parent) => {
    if (!node.isTextblock) return node.type.name === "list" || node.type.name === "listItem" || node === doc;
    const holder = node.type.name === "paragraph" && (parent === doc || (parent?.type.name === "listItem" && parent.firstChild === node));
    const match = holder ? BLOCK_ID.exec(node.textContent) : null;
    if (match) {
      const end = pos + node.nodeSize - 1;
      decorations.push(Decoration.inline(end - match[0].trimEnd().length + 1, end, { class: "block-id" }));
    }
    return false;
  });
  return decorations;
}

const blockIdKey = new PluginKey<DecorationSet>("blockIds");

/**
 * The block identifiers (` ^id` ending a paragraph) shown in grey: they are a
 * link's anchor, not text. Recomputed only for the blocks a change touches.
 */
export function blockIdPlugin(): Plugin {
  return new Plugin<DecorationSet>({
    key: blockIdKey,
    state: {
      init: (_config, state) => DecorationSet.create(state.doc, blockIdDecorations(state.doc, 0, state.doc.content.size)),
      apply(tr, set) {
        if (!tr.docChanged) return set;
        let next = set.map(tr.mapping, tr.doc);
        for (const [from, to] of changedRanges(tr)) {
          const start = Math.max(0, Math.min(from, tr.doc.content.size));
          const end = Math.max(start, Math.min(to, tr.doc.content.size));
          // Whole text blocks around the change.
          const $start = tr.doc.resolve(start);
          const $end = tr.doc.resolve(end);
          const blockFrom = $start.parent.isTextblock ? $start.before() : start;
          const blockTo = $end.parent.isTextblock ? $end.after() : end;
          next = next.remove(next.find(blockFrom, blockTo)).add(tr.doc, blockIdDecorations(tr.doc, blockFrom, blockTo));
        }
        return next;
      },
    },
    props: {
      decorations: (state) => blockIdKey.getState(state),
    },
  });
}
