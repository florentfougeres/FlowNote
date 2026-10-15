import { useRef, useState } from "react";
import { Icon } from "../Icon";
import type { ColumnInfo } from "./columns";
import type { BaseRow } from "./rows";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

/** The day of a date value ("2026-10-14", "2026-10-14T09:30"), or null. */
export function dayOf(value: unknown): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  if (typeof text !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(text.trim());
  return m ? m[1] : null;
}

/** Moves a date value to another day, keeping its time. */
export function moveToDay(value: unknown, day: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? day + text.slice(10) : day;
}

/** The weeks shown for a month: Monday to Sunday, from the week of the 1st. */
export function monthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i));
    if (w > 3 && week[0].getMonth() !== month) break;
    weeks.push(week);
  }
  return weeks;
}

/**
 * The calendar view: a month, rows placed on the day of a date property.
 * Dragging a page to another day changes its date; "+" on a day creates one.
 */
export function CalendarView({
  rows,
  date,
  dateColumns,
  editable,
  onDate,
  onMove,
  onOpen,
  onNewRow,
}: {
  rows: BaseRow[];
  date: ColumnInfo | null;
  dateColumns: ColumnInfo[];
  editable: boolean;
  onDate: (property: string) => void;
  onMove: (row: BaseRow, value: string) => void;
  onOpen: (path: string, newTab: boolean) => void;
  onNewRow: (day: string) => void;
}) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [drag, setDrag] = useState<{ row: BaseRow; x: number; y: number; over: string | null } | null>(null);
  const pressed = useRef<{ row: BaseRow; x: number; y: number } | null>(null);

  if (!date) {
    return (
      <div className="db-board-empty">
        <p>Le calendrier place les pages selon une propriété de type « Date ».</p>
        {dateColumns.length ? (
          <div className="db-board-choose">
            {dateColumns.map((c) => (
              <button key={c.property} onClick={() => onDate(c.property)}>
                Utiliser « {c.label} »
              </button>
            ))}
          </div>
        ) : (
          <p className="dash-muted">Ajoutez d'abord une propriété « Date » dans la vue Tableau.</p>
        )}
      </div>
    );
  }

  const byDay = new Map<string, BaseRow[]>();
  let undated = 0;
  for (const row of rows) {
    const day = dayOf(row.values[date.property]);
    if (!day) {
      undated++;
      continue;
    }
    byDay.set(day, [...(byDay.get(day) ?? []), row]);
  }
  const weeks = monthGrid(month.year, month.month);
  const today = dayKey(new Date());
  const title = new Date(month.year, month.month, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const shift = (n: number) => setMonth(({ year, month: m }) => ({ year: m + n < 0 ? year - 1 : m + n > 11 ? year + 1 : year, month: (m + n + 12) % 12 }));
  const dayAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-day]") as HTMLElement | null)?.dataset.day ?? null;

  return (
    <div className={drag ? "db-calendar dragging" : "db-calendar"}>
      <div className="db-calendar-bar">
        <h2>{title}</h2>
        <span className="db-calendar-nav">
          <button className="db-icon-button" aria-label="Mois précédent" title="Mois précédent" onClick={() => shift(-1)}>
            <Icon name="chevronLeft" size={14} />
          </button>
          <button className="db-tool" onClick={() => setMonth({ year: new Date().getFullYear(), month: new Date().getMonth() })}>
            Aujourd'hui
          </button>
          <button className="db-icon-button" aria-label="Mois suivant" title="Mois suivant" onClick={() => shift(1)}>
            <Icon name="chevronRight" size={14} />
          </button>
        </span>
        {undated > 0 && (
          <span className="dash-muted">
            {undated} page{undated > 1 ? "s" : ""} sans date
          </span>
        )}
      </div>
      <div className="db-calendar-grid" role="grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="db-calendar-weekday">
            {d}
          </div>
        ))}
        {weeks.flat().map((d) => {
          const key = dayKey(d);
          const outside = d.getMonth() !== month.month;
          const items = byDay.get(key) ?? [];
          return (
            <div key={key} data-day={key} className={["db-calendar-day", outside ? "outside" : "", key === today ? "today" : "", drag?.over === key ? "drop" : ""].filter(Boolean).join(" ")}>
              <div className="db-calendar-day-head">
                {editable && (
                  <button className="db-icon-button db-calendar-add" aria-label={`Nouvelle page le ${d.toLocaleDateString("fr-FR")}`} title="Nouvelle page ce jour" onClick={() => onNewRow(key)}>
                    <Icon name="plus" size={12} />
                  </button>
                )}
                <span className="db-calendar-date">{d.getDate() === 1 ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : d.getDate()}</span>
              </div>
              {items.map((row) => (
                <div
                  key={row.path}
                  role="button"
                  tabIndex={0}
                  className={drag?.row.path === row.path ? "db-calendar-item dragging" : "db-calendar-item"}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    pressed.current = { row, x: e.clientX, y: e.clientY };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    const p = pressed.current;
                    if (!p || !editable || (!drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5)) return;
                    setDrag({ row: p.row, x: e.clientX, y: e.clientY, over: dayAt(e.clientX, e.clientY) });
                  }}
                  onPointerUp={(e) => {
                    const p = pressed.current;
                    pressed.current = null;
                    if (!drag) return p && onOpen(row.path, e.metaKey || e.ctrlKey);
                    const target = dayAt(e.clientX, e.clientY);
                    setDrag(null);
                    if (target && target !== key) onMove(row, moveToDay(row.values[date.property], target));
                  }}
                  onPointerCancel={() => {
                    pressed.current = null;
                    setDrag(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && onOpen(row.path, e.metaKey || e.ctrlKey)}
                >
                  <Icon name="doc" size={12} />
                  <span>{row.name}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {drag && (
        <div className="db-calendar-item board-ghost" style={{ left: drag.x + 8, top: drag.y - 10 }} aria-hidden>
          <Icon name="doc" size={12} />
          <span>{drag.row.name}</span>
        </div>
      )}
    </div>
  );
}
