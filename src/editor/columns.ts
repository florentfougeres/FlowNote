import type { Node as PMNode, ResolvedPos, Schema } from "@tiptap/pm/model";
import { Plugin, Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

/**
 * Columns of blocks, written as the multi-column callouts of Obsidian's
 * popular CSS snippets: a `> [!multi-column]` callout holding one callout per
 * column, `>> [!blank]` for a plain one. Without the snippet, Obsidian shows
 * the columns as callouts stacked inside a callout, still readable.
 */

export const COLUMNS = "multi-column";
export const BLANK = "blank";

export const isColumns = (node: PMNode | null | undefined) => node?.type.name === "callout" && String(node.attrs.calloutType).toLowerCase() === COLUMNS;

const blankColumn = (schema: Schema, content?: PMNode["content"]) =>
  schema.nodes.callout.create({ calloutType: BLANK, compact: true, tightNest: true }, [schema.nodes.calloutTitle.create(), schema.nodes.paragraph.create(null, content)]);

/** Two plain columns, `content` in the first. */
export function columnsNode(schema: Schema, content?: PMNode["content"]): PMNode {
  return schema.nodes.callout.create({ calloutType: COLUMNS, tightNest: true }, [schema.nodes.calloutTitle.create(), blankColumn(schema, content), blankColumn(schema)]);
}

/** Adds a plain column at the end of the columns at `pos`, the cursor in it. */
export function addColumn(state: EditorState, pos: number): Transaction | null {
  const columns = state.doc.nodeAt(pos);
  if (!isColumns(columns)) return null;
  const at = pos + columns!.nodeSize - 1;
  const tr = state.tr.insert(at, blankColumn(state.schema));
  // Inside the new column: past its opening, its empty title and the paragraph's opening.
  return tr.setSelection(TextSelection.create(tr.doc, at + 4));
}

/** Removes the column at `pos`; the last one left gives its blocks back to the note. */
export function removeColumn(state: EditorState, pos: number): Transaction | null {
  const $pos = state.doc.resolve(pos);
  const column = state.doc.nodeAt(pos);
  if (!column || $pos.depth === 0 || !isColumns($pos.parent)) return null;
  const columnsPos = $pos.before();
  // The first column follows the hidden title: the cursor goes to the next one, else to the end of the previous one.
  const first = $pos.index() === 1;
  const tr = state.tr.delete(pos, pos + column.nodeSize);
  const left = tr.doc.nodeAt(columnsPos)!;
  const remaining: PMNode[] = [];
  left.forEach((child) => {
    if (child.type.name === "callout") remaining.push(child);
  });
  if (remaining.length <= 1) {
    // One column left: its blocks (a titled column keeps its callout).
    const only = remaining[0];
    const unwrapped: PMNode[] = [];
    if (!only) unwrapped.push(state.schema.nodes.paragraph.create());
    else if (String(only.attrs.calloutType).toLowerCase() === BLANK && only.firstChild?.content.size === 0) only.forEach((child, _, i) => void (i > 0 && unwrapped.push(child)));
    else unwrapped.push(only);
    tr.replaceWith(columnsPos, columnsPos + left.nodeSize, unwrapped);
    return tr.setSelection(TextSelection.near(tr.doc.resolve(columnsPos), 1)).scrollIntoView();
  }
  return tr.setSelection(TextSelection.near(tr.doc.resolve(pos), first ? 1 : -1)).scrollIntoView();
}

/** A title the columns hide: the empty one of `[!multi-column]`, or of a `[!blank]` column. */
function inHiddenTitle($from: ResolvedPos): boolean {
  if ($from.parent.type.name !== "calloutTitle" || $from.parent.content.size > 0 || $from.depth < 2) return false;
  const callout = $from.node(-1);
  return isColumns(callout) || (String(callout.attrs.calloutType).toLowerCase() === BLANK && isColumns($from.node(-2)));
}

/**
 * The cursor never stays in a hidden title (arrows, clicks): it goes on to the
 * column's text, or out of the columns when going up.
 */
export function hiddenTitlePlugin(): Plugin {
  return new Plugin({
    appendTransaction(trs, old, state) {
      if (!trs.some((tr) => tr.selectionSet || tr.docChanged) || !state.selection.empty || !inHiddenTitle(state.selection.$from)) return null;
      const backward = state.selection.from < old.selection.from;
      const tr = state.tr;
      let selection: Selection | null = state.selection;
      for (let i = 0; i < 4 && selection && inHiddenTitle(selection.$from); i++) {
        const $from: ResolvedPos = selection.$from;
        const column = $from.node(-1);
        if (!backward && column.childCount === 1) {
          // A column with nothing in it but its title: an empty paragraph to write in (written back as nothing).
          tr.insert($from.after(), state.schema.nodes.paragraph.create());
          return tr.setSelection(TextSelection.create(tr.doc, $from.after() + 1));
        }
        selection = backward
          ? (Selection.findFrom(tr.doc.resolve($from.before(-1)), -1, true) ?? Selection.findFrom(tr.doc.resolve($from.after()), 1, true))
          : Selection.findFrom(tr.doc.resolve($from.after()), 1, true);
      }
      return selection && selection !== state.selection ? tr.setSelection(selection) : null;
    },
  });
}
