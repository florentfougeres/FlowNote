import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * Size of a new table: a grid to hover and click, or the
 * numbers of rows (header included) and columns to type. Opened from the
 * slash menu's "Tableau".
 */

export interface TableSizeRequest {
  x: number;
  y: number;
  onPick: (rows: number, cols: number) => void;
  onCancel: () => void;
}

class TableSizeStore {
  state: TableSizeRequest | null = null;
  private listeners = new Set<() => void>();
  open(request: TableSizeRequest | null) {
    this.state = request;
    this.listeners.forEach((listener) => listener());
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
}

export const tableSizePicker = new TableSizeStore();

const GRID_ROWS = 8;
const GRID_COLS = 10;
const MAX = 50;

const clamp = (value: number) => Math.min(MAX, Math.max(1, Math.round(value) || 1));

export function TableSizePicker() {
  const request = useSyncExternalStore(
    (listener) => tableSizePicker.subscribe(listener),
    () => tableSizePicker.state,
  );
  const [size, setSize] = useState({ rows: 3, cols: 3 });
  const [draft, setDraft] = useState({ rows: "3", cols: "3" });

  useEffect(() => {
    setSize({ rows: 3, cols: 3 });
    setDraft({ rows: "3", cols: "3" });
  }, [request]);

  if (!request) return null;
  const cancel = () => {
    tableSizePicker.open(null);
    request.onCancel();
  };
  const pick = (rows: number, cols: number) => {
    tableSizePicker.open(null);
    request.onPick(clamp(rows), clamp(cols));
  };
  const hover = (rows: number, cols: number) => {
    setSize({ rows, cols });
    setDraft({ rows: String(rows), cols: String(cols) });
  };
  const typed = (key: "rows" | "cols", value: string) => {
    const next = { ...draft, [key]: value.replace(/\D/g, "").slice(0, 2) };
    setDraft(next);
    setSize({ rows: clamp(Number(next.rows)), cols: clamp(Number(next.cols)) });
  };
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") pick(size.rows, size.cols);
    else if (event.key === "Escape") cancel();
    else return;
    event.preventDefault();
  };
  const left = Math.max(8, Math.min(request.x, window.innerWidth - 260));
  const top = request.y + 290 > window.innerHeight ? Math.max(8, request.y - 300) : request.y;

  return createPortal(
    <div className="callout-picker-backdrop" onMouseDown={cancel}>
      <div className="block-menu table-size-picker" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="table-size-grid" role="grid" aria-label="Taille du tableau" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 18px)` }}>
          {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) => {
            const row = Math.floor(i / GRID_COLS) + 1;
            const col = (i % GRID_COLS) + 1;
            const inside = row <= size.rows && col <= size.cols;
            return (
              <button
                key={i}
                className={inside ? (row === 1 ? "header selected" : "selected") : row === 1 ? "header" : undefined}
                aria-label={`${row} × ${col}`}
                onMouseEnter={() => hover(row, col)}
                onClick={() => pick(row, col)}
              />
            );
          })}
        </div>
        <div className="table-size-fields">
          <input autoFocus value={draft.rows} inputMode="numeric" aria-label="Lignes" title="Lignes, en-tête comprise" onChange={(e) => typed("rows", e.target.value)} />
          <span>×</span>
          <input value={draft.cols} inputMode="numeric" aria-label="Colonnes" title="Colonnes" onChange={(e) => typed("cols", e.target.value)} />
          <button className="table-size-ok" onClick={() => pick(size.rows, size.cols)}>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
