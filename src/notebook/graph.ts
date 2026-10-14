/**
 * Dependency graph between cells, from the names each run reports (`defs`:
 * defined at top level, `refs`: read without being defined first). This is
 * the groundwork for reactive execution (V2): after a cell runs, the cells
 * reading what it defines can be re-run, in order.
 *
 * Inspired by marimo's dataflow graph (marimo/_runtime/dataflow, Apache 2.0),
 * re-implemented here; no marimo code is copied. Unlike marimo, V1 notebooks
 * may define a name in several cells (Jupyter style): a reference goes to the
 * closest earlier cell defining it, or the first one after when none comes
 * before.
 */

export interface CellNames {
  id: string;
  defs: string[];
  refs: string[];
}

/** Edges parent → children: a child reads a name the parent defines. */
export function dependencyGraph(cells: CellNames[]): Map<string, Set<string>> {
  const children = new Map<string, Set<string>>(cells.map((c) => [c.id, new Set<string>()]));
  cells.forEach((cell, index) => {
    for (const name of cell.refs) {
      let parent: CellNames | undefined;
      for (let i = index - 1; i >= 0 && !parent; i--) if (cells[i].defs.includes(name)) parent = cells[i];
      for (let i = index + 1; i < cells.length && !parent; i++) if (cells[i].defs.includes(name)) parent = cells[i];
      if (parent && parent.id !== cell.id) children.get(parent.id)!.add(cell.id);
    }
  });
  return children;
}

/** Cells to re-run after `id` ran: every cell depending on it, directly or not, in document order. */
export function descendants(cells: CellNames[], id: string): string[] {
  const graph = dependencyGraph(cells);
  const seen = new Set<string>();
  const queue = [...(graph.get(id) ?? [])];
  while (queue.length) {
    const next = queue.shift()!;
    if (next === id || seen.has(next)) continue;
    seen.add(next);
    queue.push(...(graph.get(next) ?? []));
  }
  return cells.map((c) => c.id).filter((c) => seen.has(c));
}

/** Names read by a cell that no cell defines (likely a typo or a cell not run yet). */
export function undefinedNames(cells: CellNames[], id: string): string[] {
  const cell = cells.find((c) => c.id === id);
  if (!cell) return [];
  const defined = new Set(cells.flatMap((c) => c.defs));
  return cell.refs.filter((name) => !defined.has(name));
}
