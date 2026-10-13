import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import * as ops from "./tableOps";

/**
 * Notion-style table handles: a grip above the hovered column and left of the
 * hovered row (each opening a menu), plus "+" bars to add a row at the bottom
 * and a column at the right.
 */

interface Hover {
  pos: number;
  element: HTMLTableElement;
  row: number;
  col: number;
}

interface Menu {
  kind: "row" | "col";
  index: number;
  x: number;
  y: number;
}

const MARGIN = 26;

function tablePosOf(editor: Editor, element: HTMLTableElement): number | null {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "table") {
      const dom = editor.view.nodeDOM(pos);
      if (dom === element || (dom instanceof HTMLElement && dom.contains(element))) found = pos;
      return false;
    }
    return node.isBlock && !node.isTextblock;
  });
  return found;
}

function indexAt(edges: { start: number; size: number }[], value: number, previous: number): number {
  const index = edges.findIndex((edge) => value >= edge.start && value < edge.start + edge.size);
  return index === -1 ? Math.min(previous, edges.length - 1) : index;
}

const rowEdges = (table: HTMLTableElement) => [...table.rows].map((row) => ({ start: row.getBoundingClientRect().top, size: row.getBoundingClientRect().height }));
const colEdges = (table: HTMLTableElement) =>
  [...(table.rows[0]?.cells ?? [])].map((cell) => ({ start: cell.getBoundingClientRect().left, size: cell.getBoundingClientRect().width }));

export function TableHandles({ editor }: { editor: Editor | null }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [, setTick] = useState(0);
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const menuRef = useRef(menu);
  menuRef.current = menu;

  useEffect(() => {
    if (!editor) return;
    let frame = 0;
    let pointer = { x: 0, y: 0 };
    const track = () => {
      frame = 0;
      if (menuRef.current || editor.isDestroyed) return;
      if (!editor.isEditable) return setHover(null);
      const { x, y } = pointer;
      const tables = [...editor.view.dom.querySelectorAll("table")];
      const element = tables.find((table) => {
        const r = table.getBoundingClientRect();
        return x >= r.left - MARGIN && x <= r.right + MARGIN && y >= r.top - MARGIN && y <= r.bottom + MARGIN;
      });
      if (!element) return setHover(null);
      const pos = tablePosOf(editor, element);
      if (pos === null) return setHover(null);
      const previous = hoverRef.current?.element === element ? hoverRef.current : null;
      setHover({ pos, element, row: indexAt(rowEdges(element), y, previous?.row ?? 0), col: indexAt(colEdges(element), x, previous?.col ?? 0) });
    };
    const onMove = (event: MouseEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(track);
    };
    // Geometry follows scrolling and edits.
    const refresh = () => setTick((n) => n + 1);
    document.addEventListener("mousemove", onMove);
    window.addEventListener("scroll", refresh, true);
    editor.on("transaction", refresh);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", refresh, true);
      editor.off("transaction", refresh);
    };
  }, [editor]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event.target instanceof Element && event.target.closest(".table-handle-menu")) return;
      setMenu(null);
    };
    document.addEventListener("mousedown", close, true);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("mousedown", close, true);
      document.removeEventListener("keydown", close, true);
    };
  }, [menu]);

  if (!editor || editor.isDestroyed || !hover || !hover.element.isConnected) return null;
  const table = ops.tableAt(editor, hover.pos);
  if (!table) return null;
  const rect = hover.element.getBoundingClientRect();
  const rows = rowEdges(hover.element);
  const cols = colEdges(hover.element);
  const row = rows[Math.min(hover.row, rows.length - 1)];
  const col = cols[Math.min(hover.col, cols.length - 1)];
  if (!row || !col) return null;

  const fresh = () => ops.tableAt(editor, hover.pos);
  const act = (action: (t: ops.TableRef) => void) => () => {
    const current = fresh();
    if (current) action(current);
    setMenu(null);
    editor.view.focus();
  };
  const openMenu = (kind: "row" | "col", index: number) => (event: React.MouseEvent) => {
    event.preventDefault();
    ops.selectLine(editor, table, kind, index);
    const target = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ kind, index, x: kind === "row" ? target.right + 6 : target.left, y: kind === "row" ? target.top : target.bottom + 6 });
  };
  const addRowAtEnd = () => {
    ops.insertRow(editor, table, table.node.childCount);
    editor.view.focus();
  };
  const addColumnAtEnd = () => {
    ops.insertColumn(editor, table, table.node.child(0).childCount);
    editor.view.focus();
  };

  const rowCount = table.node.childCount;
  const colCount = table.node.child(0).childCount;
  const index = menu?.index ?? 0;

  return createPortal(
    <div className="table-handles" onMouseDown={(e) => e.target instanceof HTMLButtonElement && e.preventDefault()}>
      <button
        className={menu?.kind === "col" ? "table-grip col open" : "table-grip col"}
        style={{ left: col.start + col.size / 2 - 12, top: rect.top - 9 }}
        onMouseDown={openMenu("col", Math.min(hover.col, colCount - 1))}
        aria-label="Options de la colonne"
        title="Options de la colonne"
      >
        <GripDots horizontal />
      </button>
      <button
        className={menu?.kind === "row" ? "table-grip row open" : "table-grip row"}
        style={{ left: rect.left - 9 - 8, top: row.start + row.size / 2 - 12 }}
        onMouseDown={openMenu("row", Math.min(hover.row, rowCount - 1))}
        aria-label="Options de la ligne"
        title="Options de la ligne"
      >
        <GripDots />
      </button>
      <button className="table-add row" style={{ left: rect.left, top: rect.bottom + 3, width: rect.width }} onClick={addRowAtEnd} aria-label="Ajouter une ligne" title="Ajouter une ligne">
        +
      </button>
      <button className="table-add col" style={{ left: rect.right + 3, top: rect.top, height: rect.height }} onClick={addColumnAtEnd} aria-label="Ajouter une colonne" title="Ajouter une colonne">
        +
      </button>
      {menu && (
        <div className="block-menu table-handle-menu" style={{ left: menu.x, top: menu.y }}>
          {menu.kind === "row" ? (
            <>
              <button onClick={act((t) => ops.insertRow(editor, t, index))}>Insérer au-dessus</button>
              <button onClick={act((t) => ops.insertRow(editor, t, index + 1))}>Insérer en dessous</button>
              <div className="block-menu-sub">
                <button disabled={index === 0} onClick={act((t) => ops.moveRow(editor, t, index, index - 1))}>
                  Monter
                </button>
                <button disabled={index === rowCount - 1} onClick={act((t) => ops.moveRow(editor, t, index, index + 1))}>
                  Descendre
                </button>
              </div>
              <div className="block-menu-sub">
                <button className="danger" onClick={act((t) => ops.deleteRow(editor, t, index))}>
                  {index === 0 ? "Supprimer la ligne (la suivante devient l'en-tête)" : "Supprimer la ligne"}
                </button>
              </div>
            </>
          ) : (
            <>
              <button onClick={act((t) => ops.insertColumn(editor, t, index))}>Insérer à gauche</button>
              <button onClick={act((t) => ops.insertColumn(editor, t, index + 1))}>Insérer à droite</button>
              <div className="block-menu-sub">
                <button disabled={index === 0} onClick={act((t) => ops.moveColumn(editor, t, index, index - 1))}>
                  Déplacer à gauche
                </button>
                <button disabled={index === colCount - 1} onClick={act((t) => ops.moveColumn(editor, t, index, index + 1))}>
                  Déplacer à droite
                </button>
              </div>
              <div className="block-menu-sub table-align">
                {(["left", "center", "right"] as const).map((align) => (
                  <button
                    key={align}
                    className={table.node.child(0).child(index)?.attrs.align === align ? "active" : ""}
                    onClick={act((t) => ops.alignColumn(editor, t, index, table.node.child(0).child(index)?.attrs.align === align ? null : align))}
                  >
                    {{ left: "Aligner à gauche", center: "Centrer", right: "Aligner à droite" }[align]}
                  </button>
                ))}
              </div>
              <div className="block-menu-sub">
                <button className="danger" onClick={act((t) => ops.deleteColumn(editor, t, index))}>
                  Supprimer la colonne
                </button>
              </div>
            </>
          )}
          <div className="block-menu-sub">
            <button className="danger" onClick={act((t) => ops.deleteTable(editor, t))}>
              Supprimer le tableau
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function GripDots({ horizontal = false }: { horizontal?: boolean }) {
  const dots = [0, 1, 2].flatMap((i) => [0, 1].map((j) => (horizontal ? { cx: 4 + i * 4, cy: 4 + j * 4 } : { cx: 4 + j * 4, cy: 4 + i * 4 })));
  return (
    <svg width={horizontal ? 16 : 12} height={horizontal ? 12 : 16} viewBox={horizontal ? "0 0 16 12" : "0 0 12 16"} aria-hidden="true">
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={1.25} fill="currentColor" />
      ))}
    </svg>
  );
}

