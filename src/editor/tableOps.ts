import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { CellSelection } from "@tiptap/pm/tables";
import { TextSelection } from "@tiptap/pm/state";

/**
 * Row and column operations used by the table handles. Markdown tables are
 * plain grids (no merged cells) whose first row is the header: whatever moves,
 * the first row is rebuilt with header cells and the others with body cells.
 */

export interface TableRef {
  pos: number;
  node: PMNode;
}

export function tableAt(editor: Editor, pos: number): TableRef | null {
  const node = editor.state.doc.nodeAt(pos);
  return node?.type.name === "table" ? { pos, node } : null;
}

/** Position of the cell at (row, col). */
export function cellPos(table: TableRef, row: number, col: number): number {
  let pos = table.pos + 1;
  for (let r = 0; r < row; r++) pos += table.node.child(r).nodeSize;
  pos += 1;
  const cells = table.node.child(row);
  for (let c = 0; c < col; c++) pos += cells.child(c).nodeSize;
  return pos;
}

function grid(table: PMNode): PMNode[][] {
  const rows: PMNode[][] = [];
  table.forEach((row) => {
    const cells: PMNode[] = [];
    row.forEach((cell) => cells.push(cell));
    rows.push(cells);
  });
  return rows;
}

/** Replaces the table with `rows`, fixing cell types so the first row stays the header. */
function rebuild(editor: Editor, table: TableRef, rows: PMNode[][], focus?: { row: number; col: number }) {
  const { schema } = editor.state;
  const newRows = rows.map((cells, r) =>
    schema.nodes.tableRow.create(
      null,
      cells.map((cell) => (r === 0 ? schema.nodes.tableHeader : schema.nodes.tableCell).create(cell.attrs, cell.content, cell.marks)),
    ),
  );
  const tr = editor.state.tr.replaceWith(table.pos, table.pos + table.node.nodeSize, table.node.type.create(table.node.attrs, newRows, table.node.marks));
  if (focus) {
    const rebuilt = { pos: table.pos, node: tr.doc.nodeAt(table.pos)! };
    tr.setSelection(TextSelection.near(tr.doc.resolve(cellPos(rebuilt, focus.row, focus.col) + 1)));
  }
  editor.view.dispatch(tr);
}

function emptyCell(editor: Editor, align: unknown = null): PMNode {
  return editor.state.schema.nodes.tableCell.create({ align }, editor.state.schema.nodes.paragraph.create());
}

export function insertRow(editor: Editor, table: TableRef, at: number) {
  const rows = grid(table.node);
  const model = rows[Math.min(at, rows.length - 1)] ?? rows[0];
  // A new first row pushes the old header down: it becomes the new header.
  rows.splice(Math.max(at, 0), 0, model.map((cell) => emptyCell(editor, cell.attrs.align)));
  rebuild(editor, table, rows, { row: Math.max(at, 0), col: 0 });
}

export function insertColumn(editor: Editor, table: TableRef, at: number) {
  const rows = grid(table.node).map((cells) => {
    const copy = [...cells];
    copy.splice(at, 0, emptyCell(editor));
    return copy;
  });
  rebuild(editor, table, rows, { row: 0, col: at });
}

export function deleteRow(editor: Editor, table: TableRef, row: number) {
  const rows = grid(table.node);
  if (rows.length <= 1) return deleteTable(editor, table);
  rows.splice(row, 1);
  rebuild(editor, table, rows, { row: Math.min(row, rows.length - 1), col: 0 });
}

export function deleteColumn(editor: Editor, table: TableRef, col: number) {
  const rows = grid(table.node);
  if ((rows[0]?.length ?? 0) <= 1) return deleteTable(editor, table);
  rebuild(editor, table, rows.map((cells) => cells.filter((_, c) => c !== col)), { row: 0, col: Math.max(0, col - 1) });
}

export function moveRow(editor: Editor, table: TableRef, from: number, to: number) {
  const rows = grid(table.node);
  if (to < 0 || to >= rows.length || from === to) return;
  const [moved] = rows.splice(from, 1);
  rows.splice(to, 0, moved);
  rebuild(editor, table, rows, { row: to, col: 0 });
}

export function moveColumn(editor: Editor, table: TableRef, from: number, to: number) {
  const rows = grid(table.node);
  if (to < 0 || to >= (rows[0]?.length ?? 0) || from === to) return;
  rebuild(
    editor,
    table,
    rows.map((cells) => {
      const copy = [...cells];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    }),
    { row: 0, col: to },
  );
}

/** Alignment belongs to the whole column in Markdown. */
export function alignColumn(editor: Editor, table: TableRef, col: number, align: "left" | "center" | "right" | null) {
  rebuild(
    editor,
    table,
    grid(table.node).map((cells) => cells.map((cell, c) => (c === col ? cell.type.create({ ...cell.attrs, align }, cell.content, cell.marks) : cell))),
  );
}

export function deleteTable(editor: Editor, table: TableRef) {
  const { schema } = editor.state;
  const tr = editor.state.tr.replaceWith(table.pos, table.pos + table.node.nodeSize, schema.nodes.paragraph.create());
  tr.setSelection(TextSelection.near(tr.doc.resolve(table.pos + 1)));
  editor.view.dispatch(tr);
}

/** Highlights a whole row or column (while its menu is open). */
export function selectLine(editor: Editor, table: TableRef, kind: "row" | "col", index: number) {
  const $cell = editor.state.doc.resolve(cellPos(table, kind === "row" ? index : 0, kind === "col" ? index : 0));
  editor.view.dispatch(editor.state.tr.setSelection(kind === "row" ? CellSelection.rowSelection($cell) : CellSelection.colSelection($cell)));
}
