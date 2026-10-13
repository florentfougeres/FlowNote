import type { Editor, Range } from "@tiptap/core";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { canJoin } from "@tiptap/pm/transform";

/**
 * Block operations shared by the block handle, the block menu, the slash menu
 * and keyboard shortcuts. A "block" is a list item (at any depth) or a block at
 * the top level of the document: those are the units Notion lets you move.
 *
 * Moves are a single transaction (one undo step). A moved top-level block is
 * re-inserted as the very same node object, so it is written back verbatim.
 */

export interface BlockRef {
  /** Position right before the block. */
  pos: number;
  node: PMNode;
}

export type DropSide = "above" | "below" | "nest";

/** The innermost movable block containing `pos`. */
export function blockAt(doc: PMNode, pos: number): BlockRef | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth >= 1; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === "listItem" || depth === 1) return { pos: $pos.before(depth), node };
  }
  const after = $pos.nodeAfter;
  return after ? { pos: $pos.pos, node: after } : null;
}

/** Every movable block of the document, in document order. */
export function movableBlocks(doc: PMNode): BlockRef[] {
  const blocks: BlockRef[] = [];
  doc.descendants((node, pos, parent) => {
    if (parent === doc || node.type.name === "listItem") blocks.push({ pos, node });
    return parent === doc ? node.type.name === "list" : node.type.name === "list" || node.type.name === "listItem";
  });
  return blocks;
}

function listAttrs(list: PMNode): Record<string, unknown> {
  return { ...list.attrs, spread: false };
}

/** A list item moved to another list loses the layout it had in its old list. */
function relocatedItem(item: PMNode): PMNode {
  return item.type.create({ ...item.attrs, gapBefore: null, markerIndent: "" }, item.content);
}

/** Joins two adjacent lists of the same kind at `pos` (the boundary between them). */
function joinListsAt(tr: Transaction, pos: number) {
  const $pos = tr.doc.resolve(pos);
  const before = $pos.nodeBefore;
  const after = $pos.nodeAfter;
  if (
    before &&
    after &&
    before.type.name === "list" &&
    after.type.name === "list" &&
    before.attrs.ordered === after.attrs.ordered &&
    before.attrs.bullet === after.attrs.bullet &&
    canJoin(tr.doc, pos)
  ) {
    tr.join(pos);
  }
}

export function moveBlock(state: EditorState, source: BlockRef, target: BlockRef, side: DropSide): Transaction | null {
  const { list, listItem } = state.schema.nodes;
  const sourceEnd = source.pos + source.node.nodeSize;
  if (target.pos >= source.pos && target.pos < sourceEnd) return null;
  if (side === "nest" && target.node.type !== listItem) return null;

  const $source = state.doc.resolve(source.pos);
  const sourceList = $source.parent;
  const isItem = source.node.type === listItem;

  // An item that is alone in its list takes the list with it.
  let deleteFrom = source.pos;
  let deleteTo = sourceEnd;
  if (isItem && sourceList.childCount === 1) {
    deleteFrom = $source.before();
    deleteTo = $source.after();
  }

  let at: number;
  let content: PMNode | Fragment;
  if (side === "nest") {
    const item = target.node;
    const contentEnd = target.pos + item.nodeSize - 1;
    if (isItem && item.lastChild?.type === list) {
      at = contentEnd - 1;
      content = relocatedItem(source.node);
    } else if (isItem) {
      at = contentEnd;
      content = list.create(listAttrs(sourceList), relocatedItem(source.node));
    } else {
      at = contentEnd;
      content = source.node;
    }
  } else {
    at = side === "above" ? target.pos : target.pos + target.node.nodeSize;
    const targetParent = state.doc.resolve(target.pos).parent;
    if (targetParent.type === list) {
      if (isItem) content = relocatedItem(source.node);
      else if (source.node.type === list) content = source.node.content;
      else content = listItem.create({ checked: target.node.attrs.checked === null ? null : false, checkChar: target.node.attrs.checked === null ? null : " " }, source.node);
    } else {
      content = isItem ? list.create(listAttrs(sourceList), relocatedItem(source.node)) : source.node;
    }
  }

  const tr = state.tr;
  tr.delete(deleteFrom, deleteTo);
  const insertAt = tr.mapping.map(at);
  tr.insert(insertAt, content);
  const size = content instanceof Fragment ? content.size : content.nodeSize;
  if (!(content instanceof Fragment) && content.type === list) {
    joinListsAt(tr, insertAt + size);
    joinListsAt(tr, insertAt);
  }
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(insertAt + 1, tr.doc.content.size))));
  return tr.scrollIntoView();
}

/** Moves the block holding the cursor before its previous sibling or after its next one. */
export function moveBlockByOne(state: EditorState, direction: -1 | 1): Transaction | null {
  const block = blockAt(state.doc, state.selection.from);
  if (!block) return null;
  const $block = state.doc.resolve(block.pos);
  const index = $block.index();
  const parent = $block.parent;
  const siblingIndex = index + direction;
  if (siblingIndex < 0 || siblingIndex >= parent.childCount) return null;
  let siblingPos = $block.posAtIndex(siblingIndex);
  const sibling = parent.child(siblingIndex);
  if (direction > 0) siblingPos = block.pos + block.node.nodeSize;
  const tr = moveBlock(state, block, { pos: siblingPos, node: sibling }, direction < 0 ? "above" : "below");
  if (!tr) return null;
  // Keep the cursor where it was inside the moved block.
  const offset = state.selection.from - block.pos;
  const newPos = direction < 0 ? siblingPos : siblingPos + sibling.nodeSize - block.node.nodeSize;
  return tr.setSelection(Selection.near(tr.doc.resolve(Math.min(newPos + offset, tr.doc.content.size))));
}

export function duplicateBlock(state: EditorState, block: BlockRef): Transaction {
  const copy = block.node.type.create(block.node.attrs, block.node.content, block.node.marks);
  const at = block.pos + block.node.nodeSize;
  const tr = state.tr.insert(at, copy);
  return tr.setSelection(Selection.near(tr.doc.resolve(at + 1))).scrollIntoView();
}

export function deleteBlock(state: EditorState, block: BlockRef): Transaction {
  const $block = state.doc.resolve(block.pos);
  const tr = state.tr;
  if (block.node.type.name === "listItem" && $block.parent.childCount === 1) {
    tr.delete($block.before(), $block.after());
  } else if (state.doc.childCount === 1 && $block.depth === 0) {
    tr.replaceWith(0, state.doc.content.size, state.schema.nodes.paragraph.create());
  } else {
    tr.delete(block.pos, block.pos + block.node.nodeSize);
  }
  if (tr.doc.childCount === 0) tr.insert(0, state.schema.nodes.paragraph.create());
  return tr.setSelection(Selection.near(tr.doc.resolve(Math.min(block.pos, tr.doc.content.size)))).scrollIntoView();
}

export type BlockKind =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet"
  | "ordered"
  | "task"
  | "toggle"
  | "quote"
  | "callout"
  | "code"
  | "divider";

/**
 * Turns the text block holding the cursor into another kind of block, after
 * removing `range` (the typed `/query` when called from the slash menu).
 * Runs as one transaction.
 */
export function turnInto(editor: Editor, kind: BlockKind, range?: Range, calloutType = "note"): boolean {
  const chain = editor.chain().focus();
  if (range) chain.deleteRange(range);
  switch (kind) {
    case "paragraph":
      return chain.clearNodes().run();
    case "heading1":
    case "heading2":
    case "heading3":
      return chain.clearNodes().setNode("heading", { level: Number(kind.slice(-1)) }).run();
    case "bullet":
      return chain.clearNodes().wrapInList("list", { ordered: false, bullet: "-" }).run();
    case "ordered":
      return chain.clearNodes().wrapInList("list", { ordered: true, start: 1, bullet: "." }).run();
    case "task":
      return chain.clearNodes().wrapInList("list", { ordered: false, bullet: "-" }).updateAttributes("listItem", { checked: false, checkChar: " " }).run();
    case "quote":
      return chain.clearNodes().wrapIn("blockquote").run();
    case "code":
      return chain.clearNodes().setNode("codeBlock", { fence: "```", language: "" }).run();
    case "callout":
    case "toggle":
      return chain
        .clearNodes()
        .command(({ tr, state }) => {
          const { callout, calloutTitle, paragraph } = state.schema.nodes;
          const $from = tr.selection.$from;
          const text = $from.parent.content;
          const start = $from.before();
          // A toggle's text becomes its (always visible) title; a callout's text becomes its body.
          const node =
            kind === "toggle"
              ? callout.create({ calloutType, fold: "-" }, [calloutTitle.create(null, text), paragraph.create()])
              : callout.create({ calloutType, fold: "" }, [calloutTitle.create(), paragraph.create(null, text)]);
          tr.replaceWith(start, $from.after(), node);
          const caret = kind === "toggle" ? start + 2 + text.size : start + 2 + 2 + text.size;
          tr.setSelection(TextSelection.create(tr.doc, caret));
          return true;
        })
        .run();
    case "divider":
      return chain
        .command(({ tr, state }) => {
          const { horizontalRule, paragraph } = state.schema.nodes;
          const $from = tr.selection.$from;
          const empty = $from.parent.content.size === 0;
          const start = $from.before();
          if (empty) {
            tr.replaceWith(start, $from.after(), [horizontalRule.create(), paragraph.create()]);
            tr.setSelection(TextSelection.create(tr.doc, start + 2));
          } else {
            tr.insert($from.after(), horizontalRule.create());
          }
          return true;
        })
        .run();
  }
}

/** Inserts a block of raw Markdown (table, math) in place of the current empty paragraph. */
export function insertRawBlock(editor: Editor, source: string, kind: string, range?: Range): boolean {
  const chain = editor.chain().focus();
  if (range) chain.deleteRange(range);
  return chain
    .command(({ tr, state }) => {
      const { rawBlock, paragraph } = state.schema.nodes;
      const $from = tr.selection.$from;
      const raw = rawBlock.create({ source, kind });
      if ($from.parent.content.size === 0) {
        const start = $from.before();
        tr.replaceWith(start, $from.after(), [raw, paragraph.create()]);
        tr.setSelection(TextSelection.create(tr.doc, start + raw.nodeSize + 1));
      } else {
        tr.insert($from.after(), raw);
      }
      return true;
    })
    .run();
}
