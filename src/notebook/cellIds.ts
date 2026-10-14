import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { BridgeRef } from "../editor/bridge";
import { cellInfo, isCellInfo } from "./format";
import type { CellRequest } from "./runtime";

/**
 * Stable ids for the cells of a notebook while it is open: outputs are keyed
 * by them. Ids follow the cells through edits (positions are mapped), and are
 * never written in the document. A pasted or moved cell gets a new id.
 */

interface CellIds {
  /** Position of each cell node → its id. */
  byPos: Map<number, string>;
}

export const cellIdsKey = new PluginKey<CellIds>("notebookCellIds");

let counter = 0;
const newId = () => `c${Date.now().toString(36)}${(counter++).toString(36)}`;

export const isCell = (node: PMNode) => node.type.name === "codeBlock" && isCellInfo(String(node.attrs.language ?? ""), String(node.attrs.meta ?? ""));

function assign(doc: PMNode, previous: Map<number, string>): Map<number, string> {
  const byPos = new Map<number, string>();
  const used = new Set<string>();
  doc.descendants((node, pos) => {
    if (!node.isBlock) return false;
    if (isCell(node)) {
      const kept = previous.get(pos);
      const id = kept && !used.has(kept) ? kept : newId();
      used.add(id);
      byPos.set(pos, id);
      return false;
    }
    return true;
  });
  return byPos;
}

export function cellIdAt(state: EditorState, pos: number): string | null {
  return cellIdsKey.getState(state)?.byPos.get(pos) ?? null;
}

/** Cells of the document, in order, as kernel requests (disabled cells left out). */
export function cellRequests(state: EditorState): (CellRequest & { pos: number })[] {
  const requests: (CellRequest & { pos: number })[] = [];
  const ids = cellIdsKey.getState(state)?.byPos;
  state.doc.descendants((node, pos) => {
    if (!node.isBlock) return false;
    if (isCell(node)) {
      const info = cellInfo(node.attrs.language, node.attrs.meta);
      const id = ids?.get(pos);
      if (id && !info.disabled) requests.push({ id, pos, lang: info.language, code: node.textContent, options: info.language === "sql" ? { query: info.query } : {} });
      return false;
    }
    return true;
  });
  return requests;
}

export function cellRequestAt(state: EditorState, pos: number): CellRequest | null {
  return cellRequests(state).find((r) => r.pos === pos) ?? null;
}

export function cellIdsPlugin(bridge: BridgeRef): Plugin<CellIds> {
  return new Plugin<CellIds>({
    key: cellIdsKey,
    state: {
      init: (_config, state) => ({ byPos: assign(state.doc, new Map()) }),
      apply(tr, value, _old, state) {
        if (!tr.docChanged) return value;
        const mapped = new Map<number, string>();
        for (const [pos, id] of value.byPos) {
          const result = tr.mapping.mapResult(pos, 1);
          if (!result.deleted) mapped.set(result.pos, id);
        }
        return { byPos: assign(state.doc, mapped) };
      },
    },
    props: {
      // ⌘↵ / Ctrl+↵ in a cell runs it.
      handleKeyDown(view, event) {
        if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return false;
        if (!bridge.current.notebook || !bridge.current.runCell) return false;
        const { $from } = view.state.selection;
        for (let depth = $from.depth; depth >= 0; depth--) {
          if (isCell($from.node(depth))) {
            bridge.current.runCell(depth === 0 ? 0 : $from.before(depth));
            return true;
          }
        }
        return false;
      },
    },
  });
}

/** Current position of the cell with this id (cells move while text is edited). */
export function posOfCell(state: EditorState, id: string): number | null {
  for (const [pos, cellId] of cellIdsKey.getState(state)?.byPos ?? []) if (cellId === id) return pos;
  return null;
}
