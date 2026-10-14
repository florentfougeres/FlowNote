import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { parseFragment } from "../markdown/parse";
import type { TableData } from "./runtime";

/**
 * "Figer": a table output written in Markdown right under its cell, between
 * two HTML comments (rendered as a normal table by Obsidian, kept as text by
 * marimo). The frozen block is the one immediately after the cell (no id:
 * marimo would drop unknown cell attributes when saving).
 *
 *   ```python {.marimo}
 *   df
 *   ```
 *
 *   <!-- flownote:frozen -->
 *
 *   | a | b |
 *   | --- | --- |
 *   | 1 | 2 |
 *
 *   *Tableau tronqué : 50 lignes sur 1 234.*
 *
 *   <!-- /flownote:frozen -->
 */

export const FROZEN_OPEN = "<!-- flownote:frozen -->";
export const FROZEN_CLOSE = "<!-- /flownote:frozen -->";

const isMarker = (node: PMNode | null | undefined, marker: string) => node?.type.name === "rawBlock" && String(node.attrs.source).trim() === marker;
export const isFrozenOpen = (source: string) => source.trim() === FROZEN_OPEN;
export const isFrozenClose = (source: string) => source.trim() === FROZEN_CLOSE;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

/** The Markdown block written for a table (at most `limit` rows, then a line with the total). */
export function frozenMarkdown(table: TableData, limit: number): string {
  const names = table.columns.map((c) => cellText(c.name) || " ");
  const rows = table.rows.slice(0, limit);
  const lines = [`| ${names.join(" | ")} |`, `| ${names.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${names.map((_, i) => cellText(row[i])).join(" | ")} |`)];
  const parts = [FROZEN_OPEN, lines.join("\n")];
  if (table.total > rows.length) {
    parts.push(`*Tableau tronqué : ${rows.length.toLocaleString("fr-FR")} ligne${rows.length > 1 ? "s" : ""} sur ${table.total.toLocaleString("fr-FR")}.*`);
  }
  parts.push(FROZEN_CLOSE);
  return parts.join("\n\n");
}

/** Range of the frozen block right after the cell at `cellPos` (top-level cells), if any. */
export function frozenRange(doc: PMNode, cellPos: number): { from: number; to: number } | null {
  const cell = doc.nodeAt(cellPos);
  if (!cell) return null;
  const $pos = doc.resolve(cellPos);
  const parent = $pos.parent;
  let index = $pos.index();
  if (!isMarker(parent.maybeChild(index + 1), FROZEN_OPEN)) return null;
  const from = cellPos + cell.nodeSize;
  let to = from;
  for (index += 1; index < parent.childCount; index++) {
    const child = parent.child(index);
    to += child.nodeSize;
    if (isMarker(child, FROZEN_CLOSE)) return { from, to };
  }
  return null; // opening marker without its end: left alone
}

/** Writes (or replaces) the frozen table under the cell; `markdown` null removes it ("Défiger"). */
export function setFrozen(editor: Editor, cellPos: number, markdown: string | null) {
  const { state } = editor;
  const cell = state.doc.nodeAt(cellPos);
  if (!cell) return;
  const existing = frozenRange(state.doc, cellPos);
  const tr = state.tr;
  if (markdown === null) {
    if (existing) tr.delete(existing.from, existing.to);
  } else {
    const nodes = parseFragment(markdown).map((json) => state.schema.nodeFromJSON(json));
    if (existing) tr.replaceWith(existing.from, existing.to, nodes);
    else tr.insert(cellPos + cell.nodeSize, nodes);
  }
  if (tr.docChanged) editor.view.dispatch(tr);
}
