import { Extension } from "@tiptap/core";
import { exitCode, lift, setBlockType } from "@tiptap/pm/commands";
import type { Node as PMNode } from "@tiptap/pm/model";
import { liftListItem, sinkListItem, splitListItem } from "@tiptap/pm/schema-list";
import { NodeSelection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { isInTable, TableMap } from "@tiptap/pm/tables";
import { blockAt, duplicateBlock, moveBlockByOne } from "./blocks";
import { headingLevelDown, stepOverBacktick, unwrapCode } from "./syntaxMarks";

/** The last text line inside `node` (itself when it is one), with its position. */
function lastTextblock(node: PMNode, pos: number): { node: PMNode; pos: number } | null {
  if (node.isTextblock) return { node, pos };
  if (node.isAtom || !node.lastChild) return null;
  return lastTextblock(node.lastChild, pos + node.nodeSize - 1 - node.lastChild.nodeSize);
}

/**
 * Tab in a top-level paragraph, like Notion: under a list it becomes an item
 * nested in the last one, otherwise a bullet item (Markdown has no indented
 * text: 4 spaces before a paragraph make it code).
 */
function indentLine(state: EditorState): Transaction | null {
  const { $from } = state.selection;
  const line = $from.parent;
  const { list, listItem } = state.schema.nodes;
  if ($from.depth !== 1 || line.type.name !== "paragraph") return null;
  const index = $from.index(0);
  const above = index > 0 ? state.doc.child(index - 1) : null;
  const lineStart = $from.before(1);
  if (above?.type !== list) {
    const range = state.doc.resolve(lineStart + 1).blockRange(state.doc.resolve(lineStart + line.nodeSize - 1))!;
    const tr = state.tr.wrap(range, [{ type: list, attrs: { ordered: false, bullet: "-" } }, { type: listItem }]);
    return tr.setSelection(TextSelection.create(tr.doc, $from.pos + 2));
  }
  // The line joins the list as its last item, then sinks under the one before.
  const insertAt = lineStart - 1;
  const tr = state.tr.delete(lineStart, lineStart + line.nodeSize).insert(insertAt, listItem.create(null, line));
  tr.setSelection(TextSelection.create(tr.doc, insertAt + 2 + $from.parentOffset));
  let sunk: Transaction | null = null;
  sinkListItem(listItem)(state.apply(tr), (t) => (sunk = t));
  if (!sunk) return tr;
  const nested: Transaction = sunk;
  nested.steps.forEach((step) => tr.step(step));
  return tr.setSelection(TextSelection.create(tr.doc, nested.selection.from));
}

/**
 * Backspace at the start of a top-level line whose previous block is a
 * container or an atom (ProseMirror would pull the line into the list or
 * quote as a new item, or delete the atom):
 * - list, quote, callout: the line's text joins the end of the last line in it
 *   (an empty line is removed), the cursor at the junction;
 * - table: the cursor goes to the end of the last cell (an empty line is removed);
 * - atom (divider, HTML, math…): an empty line is removed, otherwise the block
 *   is selected, a second Backspace deleting it.
 * Null for the other cases, left to the default behaviour.
 */
function backspaceIntoAbove(state: EditorState): Transaction | null {
  const { $from } = state.selection;
  const index = $from.index(0);
  const above = state.doc.child(index - 1);
  const line = $from.parent;
  const lineStart = $from.before(1);
  const aboveStart = lineStart - above.nodeSize;
  const empty = line.content.size === 0;
  const tr = state.tr;
  if (above.isAtom) {
    if (empty) return null;
    return tr.setSelection(NodeSelection.create(state.doc, aboveStart));
  }
  const table = above.type.spec.tableRole === "table";
  if (!table && !["list", "blockquote", "callout"].includes(above.type.name)) return null;
  const target = lastTextblock(above, aboveStart);
  if (!target || target.node.type.spec.code) return null;
  const end = target.pos + target.node.nodeSize - 1;
  if (empty || !table) tr.delete(lineStart, $from.after(1));
  if (!empty && !table) tr.insert(end, line.content);
  return tr.setSelection(TextSelection.create(tr.doc, end));
}

/**
 * Block-level keyboard behaviour modelled on Notion: Enter and Backspace
 * convert or leave blocks instead of only splitting and joining text.
 */
export const BlockKeymap = Extension.create({
  name: "blockKeymap",
  priority: 200,

  addKeyboardShortcuts() {
    const editor = this.editor;
    const dispatch = (tr: Parameters<typeof editor.view.dispatch>[0]) => editor.view.dispatch(tr.scrollIntoView());
    const types = () => editor.schema.nodes;

    const toggleTask = (): boolean => {
      const { $from } = editor.state.selection;
      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);
        if (node.type !== types().listItem) continue;
        if (node.attrs.checked === null) return false;
        const checked = !node.attrs.checked;
        dispatch(editor.state.tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, checked, checkChar: checked ? "x" : " " }));
        return true;
      }
      return false;
    };

    const setHeading = (level: number) => () =>
      level === 0
        ? setBlockType(types().paragraph)(editor.state, dispatch)
        : setBlockType(types().heading, { level })(editor.state, dispatch);

    /** The table and cell around the cursor. */
    const currentCell = () => {
      const { $from } = editor.state.selection;
      let depth = $from.depth;
      while (depth > 0 && !["cell", "header_cell"].includes($from.node(depth).type.spec.tableRole)) depth--;
      if (depth < 2) return null;
      const tableDepth = depth - 2;
      const table = $from.node(tableDepth);
      const tableStart = $from.start(tableDepth);
      const map = TableMap.get(table);
      return { map, tableStart, rect: map.findCell($from.before(depth) - tableStart) };
    };

    /** Puts the cursor at the end of the cell starting at `cellOffset` (relative to the table start). */
    const cursorInCell = (tableStart: number, cellOffset: number) => {
      const cell = editor.state.doc.nodeAt(tableStart + cellOffset);
      if (!cell) return false;
      const end = tableStart + cellOffset + cell.nodeSize - 2;
      dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(end), -1)));
      return true;
    };

    /** Tab / Shift-Tab: next or previous cell, cursor at the end of its text; a row is added after the last cell. */
    const siblingCell = (direction: 1 | -1): boolean => {
      const found = currentCell();
      if (!found) return false;
      const { map, tableStart, rect } = found;
      const index = rect.top * map.width + rect.left + direction;
      if (index < 0) return true;
      if (index >= map.map.length) {
        if (!editor.commands.addRowAfter()) return false;
        const again = currentCell()!;
        return cursorInCell(again.tableStart, again.map.map[(again.rect.top + 1) * again.map.width]);
      }
      return cursorInCell(tableStart, map.map[index]);
    };

    /** Enter in a table cell moves to the cell below, adding a row at the bottom. */
    const cellBelow = (): boolean => {
      const found = currentCell();
      if (!found) return false;
      const { map, tableStart, rect } = found;
      if (rect.bottom >= map.height) {
        if (!editor.commands.addRowAfter()) return false;
        return cellBelow();
      }
      const below = map.map[rect.bottom * map.width + rect.left];
      dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(tableStart + below + 1))));
      return true;
    };

    const moveByOne = (direction: -1 | 1): boolean => {
      const tr = moveBlockByOne(editor.state, direction);
      if (tr) dispatch(tr);
      return true;
    };

    return {
      Enter: () => {
        const { state } = editor;
        if (isInTable(state)) return cellBelow();
        const { $from, empty } = state.selection;
        const parent = $from.parent;
        const container = $from.depth >= 2 ? $from.node(-1) : null;

        // Callout title: the text after the cursor starts the callout body.
        if (parent.type === types().calloutTitle) {
          const tr = state.tr;
          const rest = parent.content.cut($from.parentOffset);
          const after = $from.after();
          tr.delete($from.pos, $from.end());
          const at = tr.mapping.map(after);
          tr.insert(at, types().paragraph.create(null, rest));
          tr.setSelection(TextSelection.create(tr.doc, at + 1));
          dispatch(tr);
          return true;
        }

        // List items: split, the new item being an unchecked task if this one is a task.
        // An empty item leaves the list (handled by splitListItem).
        if (container?.type === types().listItem) {
          const attrs = { ...container.attrs, checked: container.attrs.checked === null ? null : false, checkChar: container.attrs.checked === null ? null : " " };
          return splitListItem(types().listItem, attrs)(state, dispatch);
        }

        // Empty last paragraph of a quote or callout: leave the container.
        const isQuote = container?.type === types().blockquote || container?.type === types().callout;
        if (empty && isQuote && parent.type === types().paragraph && parent.content.size === 0 && $from.index(-1) === container!.childCount - 1) {
          const minChildren = container!.type === types().callout ? 2 : 1;
          if (container!.childCount > minChildren) {
            const tr = state.tr;
            const containerEnd = $from.after(-1);
            tr.delete($from.before(), $from.after());
            const at = tr.mapping.map(containerEnd);
            tr.insert(at, types().paragraph.create());
            tr.setSelection(TextSelection.create(tr.doc, at + 1));
            dispatch(tr);
            return true;
          }
        }

        // Code block: Enter after two empty lines leaves the block.
        if (parent.type === types().codeBlock && $from.parentOffset === parent.content.size && parent.textContent.endsWith("\n\n")) {
          dispatch(state.tr.delete($from.pos - 2, $from.pos));
          return exitCode(editor.state, dispatch);
        }
        return false;
      },

      Backspace: () => {
        const { state } = editor;
        const unwrapped = unwrapCode(state, "Backspace") ?? headingLevelDown(state);
        if (unwrapped) {
          dispatch(unwrapped);
          return true;
        }
        const { $from, empty } = state.selection;
        if (!empty || $from.parentOffset !== 0) return false;
        const parent = $from.parent;
        const container = $from.depth >= 2 ? $from.node(-1) : null;

        if (parent.type === types().codeBlock && parent.content.size === 0) return setBlockType(types().paragraph)(state, dispatch);
        if (container?.type === types().listItem && $from.index(-1) === 0) return liftListItem(types().listItem)(state, dispatch);
        if (container?.type === types().blockquote && $from.index(-1) === 0) return lift(state, dispatch);

        // Empty first line of the note: nothing to join with, so it is removed.
        if ($from.depth === 1 && $from.index(0) === 0 && parent.type === types().paragraph && parent.content.size === 0 && state.doc.childCount > 1) {
          const tr = state.tr.delete($from.before(), $from.after());
          tr.setSelection(TextSelection.near(tr.doc.resolve(0)));
          dispatch(tr);
          return true;
        }

        // Start of a line under a list, quote, callout, table or atom block:
        // go up to the end of the line above, like Notion (see `backspaceIntoAbove`).
        if ($from.depth === 1 && $from.index(0) > 0 && parent.isTextblock && parent.type !== types().codeBlock) {
          const tr = backspaceIntoAbove(state);
          if (tr) {
            dispatch(tr);
            return true;
          }
        }

        // Start of a callout title: the callout becomes plain blocks.
        if (parent.type === types().calloutTitle && container) {
          const children: PMNode[] = [types().paragraph.create(null, parent.content)];
          container.forEach((child, _offset, index) => {
            if (index > 0) children.push(child);
          });
          const start = $from.before(-1);
          const tr = state.tr.replaceWith(start, $from.after(-1), children);
          tr.setSelection(TextSelection.create(tr.doc, start + 1));
          dispatch(tr);
          return true;
        }
        return false;
      },

      Delete: () => {
        const tr = unwrapCode(editor.state, "Delete");
        if (tr) dispatch(tr);
        return !!tr;
      },
      ArrowRight: () => {
        const tr = stepOverBacktick(editor.state, 1);
        if (tr) editor.view.dispatch(tr);
        return !!tr;
      },
      ArrowLeft: () => {
        const tr = stepOverBacktick(editor.state, -1);
        if (tr) editor.view.dispatch(tr);
        return !!tr;
      },

      Tab: () => {
        if (isInTable(editor.state)) return siblingCell(1);
        const { $from } = editor.state.selection;
        if ($from.parent.type === types().codeBlock) {
          dispatch(editor.state.tr.insertText("\t"));
          return true;
        }
        const indented = indentLine(editor.state);
        if (indented) dispatch(indented);
        else sinkListItem(types().listItem)(editor.state, dispatch);
        return true; // keep the focus in the editor
      },
      "Shift-Tab": () => {
        if (isInTable(editor.state)) return siblingCell(-1);
        liftListItem(types().listItem)(editor.state, dispatch);
        return true;
      },
      "Mod-Enter": () => {
        if (editor.state.selection.$from.parent.type === types().codeBlock) return exitCode(editor.state, dispatch);
        return toggleTask();
      },
      "Mod-Shift-ArrowUp": () => moveByOne(-1),
      "Mod-Shift-ArrowDown": () => moveByOne(1),
      // As in VS Code and Obsidian.
      "Alt-ArrowUp": () => moveByOne(-1),
      "Alt-ArrowDown": () => moveByOne(1),
      "Mod-d": () => {
        const block = blockAt(editor.state.doc, editor.state.selection.from);
        if (block) dispatch(duplicateBlock(editor.state, block));
        return true;
      },
      "Mod-Alt-0": setHeading(0),
      "Mod-Alt-1": setHeading(1),
      "Mod-Alt-2": setHeading(2),
      "Mod-Alt-3": setHeading(3),
    };
  },
});
