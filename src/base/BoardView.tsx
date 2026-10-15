import { useRef, useState } from "react";
import type { PropertyValue } from "../markdown/frontmatter";
import { Icon } from "../Icon";
import type { SelectOption } from "./baseFile";
import type { BaseRow } from "./rows";
import { OptionPill } from "./cells";
import { hasValue, ValueView, type ColumnInfo } from "./columns";

/**
 * The kanban view: a column per option of a select property (and one for the
 * rows without a value). Dropping a card in a column sets the property in its
 * note; its place among the cards is the view's manual order. The drag follows the pointer (no HTML drag and drop, refused by WebKit
 * on some elements).
 */
export function BoardView({
  rows,
  group,
  shown,
  formulas,
  selectColumns,
  editable,
  onGroup,
  onMove,
  onOpen,
  onNewRow,
}: {
  rows: BaseRow[];
  /** The property the board is grouped by, or null to choose one. */
  group: ColumnInfo | null;
  /** Other properties shown on the cards. */
  shown: ColumnInfo[];
  formulas: Record<string, string>;
  selectColumns: ColumnInfo[];
  editable: boolean;
  onGroup: (property: string) => void;
  /** A card dropped: its new value (null: same column) and the new order of the rows. */
  onMove: (row: BaseRow, value: PropertyValue | undefined | null, paths: string[] | null) => void;
  onOpen: (path: string, newTab: boolean) => void;
  onNewRow: (value: string | undefined) => void;
}) {
  const [drag, setDrag] = useState<{ row: BaseRow; x: number; y: number; dx: number; dy: number; width: number } | null>(null);
  const [over, setOver] = useState<{ column: number; index: number } | null>(null);
  const pressed = useRef<{ row: BaseRow; x: number; y: number; rect: DOMRect } | null>(null);
  const board = useRef<HTMLDivElement>(null);

  if (!group) {
    return (
      <div className="db-board-empty">
        <p>Le kanban range les lignes selon une propriété de type « Sélection ».</p>
        {selectColumns.length ? (
          <div className="db-board-choose">
            {selectColumns.map((c) => (
              <button key={c.property} onClick={() => onGroup(c.property)}>
                Grouper par « {c.label} »
              </button>
            ))}
          </div>
        ) : (
          <p className="dash-muted">Ajoutez d'abord une propriété « Sélection » dans la vue Tableau.</p>
        )}
      </div>
    );
  }

  const columns: { option: SelectOption | null; rows: BaseRow[] }[] = [
    ...group.options.map((option) => ({ option, rows: rows.filter((r) => valueIs(r.values[group.property], option.value, group.meta.type === "multi")) })),
    { option: null, rows: rows.filter((r) => empty(r.values[group.property]) || !group.options.some((o) => valueIs(r.values[group.property], o.value, group.meta.type === "multi"))) },
  ];
  /** Column under the pointer, and the place among its cards (the dragged one aside). */
  const dropAt = (x: number, y: number, dragged: string) => {
    const sections = [...(board.current?.querySelectorAll<HTMLElement>(".db-board-column") ?? [])];
    const column = sections.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right;
    });
    if (column < 0) return null;
    const cards = [...sections[column].querySelectorAll<HTMLElement>(".db-card[data-path]")].filter((el) => el.dataset.path !== dragged);
    const index = cards.filter((el) => y > el.getBoundingClientRect().top + el.offsetHeight / 2).length;
    return { column, index };
  };
  /** The rows' order after dropping `path` at `index` of a column. */
  const orderAfter = (path: string, column: number, index: number) => {
    const others = columns[column].rows.filter((r) => r.path !== path);
    const paths = rows.map((r) => r.path).filter((p) => p !== path);
    const before = others[index]?.path;
    const after = others[index - 1]?.path;
    const at = before ? paths.indexOf(before) : after ? paths.indexOf(after) + 1 : paths.length;
    paths.splice(at, 0, path);
    return paths;
  };

  return (
    <div ref={board} className={drag ? "db-board dragging" : "db-board"}>
      {columns.map((column, c) => (
        <section key={column.option?.value ?? "∅"} className={over?.column === c && over.column !== columns.findIndex((col) => col.rows.some((r) => r.path === drag?.row.path)) ? "db-board-column drop" : "db-board-column"}>
          <header>
            {column.option ? <OptionPill option={column.option} /> : <span className="dash-muted">Sans {group.label.toLowerCase()}</span>}
            <span className="board-count">{column.rows.length}</span>
          </header>
          <div className="db-board-cards">
            {column.rows.map((row, i) => (
              <div
                key={row.path}
                data-path={row.path}
                role="button"
                tabIndex={0}
                className={["db-card", drag?.row.path === row.path ? "dragging" : "", drag && over?.column === c && over.index === column.rows.filter((r) => r.path !== drag.row.path).indexOf(row) && drag.row.path !== row.path ? "drop-before" : ""].filter(Boolean).join(" ")}
                data-index={i}
                onPointerDown={(e) => {
                  if (e.button !== 0 || !editable) return;
                  e.preventDefault();
                  pressed.current = { row, x: e.clientX, y: e.clientY, rect: e.currentTarget.getBoundingClientRect() };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const p = pressed.current;
                  if (!p || (!drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5)) return;
                  setDrag({ row: p.row, x: e.clientX, y: e.clientY, dx: p.x - p.rect.left, dy: p.y - p.rect.top, width: p.rect.width });
                  setOver(dropAt(e.clientX, e.clientY, p.row.path));
                }}
                onPointerUp={(e) => {
                  const p = pressed.current;
                  pressed.current = null;
                  if (!p) return onOpen(row.path, e.metaKey || e.ctrlKey);
                  if (!drag) return onOpen(row.path, e.metaKey || e.ctrlKey);
                  const drop = dropAt(e.clientX, e.clientY, row.path);
                  setDrag(null);
                  setOver(null);
                  if (!drop) return;
                  const paths = orderAfter(row.path, drop.column, drop.index);
                  const changed = paths.some((p, j) => p !== rows[j]?.path);
                  if (drop.column === c) return changed && onMove(row, null, paths);
                  const option = columns[drop.column].option;
                  if (group.meta.type === "multi") {
                    const list = asList(row.values[group.property]).filter((v) => v !== column.option?.value);
                    onMove(row, option ? [...list, option.value] : list.length ? list : undefined, changed ? paths : null);
                  } else onMove(row, option ? option.value : undefined, changed ? paths : null);
                }}
                onPointerCancel={() => {
                  pressed.current = null;
                  setDrag(null);
                  setOver(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && onOpen(row.path, e.metaKey || e.ctrlKey)}
              >
                <Card row={row} shown={shown} formulas={formulas} />
              </div>
            ))}
            {editable && (
              <button className="board-new" onClick={() => onNewRow(column.option?.value)}>
                <Icon name="plus" size={13} /> Nouveau
              </button>
            )}
          </div>
        </section>
      ))}
      {drag && (
        <div className="db-card board-ghost" style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width }} aria-hidden>
          <Card row={drag.row} shown={shown} formulas={formulas} />
        </div>
      )}
    </div>
  );
}

function Card({ row, shown, formulas }: { row: BaseRow; shown: ColumnInfo[]; formulas: Record<string, string> }) {
  return (
    <>
      <span className="db-card-title">
        <Icon name="doc" size={13} /> {row.name}
      </span>
      {shown
        .filter((c) => hasValue(c, row, formulas))
        .map((c) => (
          <span key={c.property} className="db-card-prop" title={c.label}>
            <ValueView column={c} row={row} formulas={formulas} />
          </span>
        ))}
    </>
  );
}

const empty = (v: PropertyValue | undefined) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
const asList = (v: PropertyValue | undefined) => (Array.isArray(v) ? v.map(String) : empty(v) ? [] : [String(v)]);
const valueIs = (v: PropertyValue | undefined, option: string, multi: boolean) => (multi ? asList(v).includes(option) : asList(v)[0] === option);
