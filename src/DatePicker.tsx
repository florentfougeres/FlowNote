import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { isoDay } from "./dates";
import { useClickOutside } from "./hooks/useClickOutside";

/**
 * The app's date picker, in place of the system's: a month calendar in a
 * menu. Values stay as written in the files: "YYYY-MM-DD", or
 * "YYYY-MM-DDTHH:mm" with the time.
 */

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const LONG = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

const pad = (n: number) => String(n).padStart(2, "0");

/** The day of a value ("2026-10-15", "2026-10-15T09:30", "2026-10-15 09:30"), or null. */
export function dayOf(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

const timeOf = (value: string | null | undefined) => /[T ](\d{2}:\d{2})/.exec(value ?? "")?.[1] ?? "";

/** A typed date: "15/10/2026", "15/10", "2026-10-15"; null when it is not one. */
export function parseTypedDate(text: string, today = new Date()): Date | null {
  const t = text.trim();
  const iso = dayOf(t);
  if (iso) return iso;
  const fr = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(t);
  if (!fr) return null;
  const year = fr[3] ? (fr[3].length === 2 ? 2000 + Number(fr[3]) : Number(fr[3])) : today.getFullYear();
  const date = new Date(year, Number(fr[2]) - 1, Number(fr[1]), 12);
  return date.getMonth() === Number(fr[2]) - 1 ? date : null;
}

/** How a value reads in the app ("jeu. 15 oct. 2026", with the time when there is one). */
export function formatDateValue(value: string | null | undefined): string {
  const day = dayOf(value);
  if (!day) return value ?? "";
  const time = timeOf(value);
  return time ? `${LONG.format(day)} · ${time}` : LONG.format(day);
}

/** The 6 weeks shown for a month, starting on Monday. */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12));
}

export function DatePicker({
  value,
  withTime = false,
  anchor,
  onChange,
  onClose,
}: {
  value: string | null;
  withTime?: boolean;
  /** The element the menu opens under (above it when there is no room). */
  anchor: DOMRect;
  onChange: (value: string | null) => void;
  onClose: () => void;
}) {
  const selected = dayOf(value);
  const [month, setMonth] = useState(() => selected ?? new Date());
  const [focus, setFocus] = useState(() => selected ?? new Date());
  const [typed, setTyped] = useState(selected ? `${pad(selected.getDate())}/${pad(selected.getMonth() + 1)}/${selected.getFullYear()}` : "");
  const [time, setTime] = useState(timeOf(value) || "09:00");
  const box = useRef<HTMLDivElement>(null);
  useClickOutside(box, onClose);
  const grid = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number }>({ left: anchor.left, top: anchor.bottom + 4 });

  useLayoutEffect(() => {
    const height = box.current?.offsetHeight ?? 340;
    const width = box.current?.offsetWidth ?? 260;
    const below = anchor.bottom + 4 + height <= window.innerHeight - 8;
    setPlace({
      left: Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8)),
      top: below ? anchor.bottom + 4 : Math.max(8, anchor.top - 4 - height),
    });
  }, [anchor]);

  const pick = (day: Date) => {
    onChange(withTime ? `${isoDay(day)}T${time || "09:00"}` : isoDay(day));
    onClose();
  };
  const moveFocus = (days: number) => {
    const next = new Date(focus.getFullYear(), focus.getMonth(), focus.getDate() + days, 12);
    setFocus(next);
    if (next.getMonth() !== month.getMonth() || next.getFullYear() !== month.getFullYear()) setMonth(next);
  };
  const shiftMonth = (step: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + step, 1, 12));
  const today = isoDay(new Date());

  return createPortal(
    <div
      ref={box}
      className="date-picker"
      role="dialog"
      aria-label="Choisir une date"
      style={place}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="date-picker-fields">
        <input
          autoFocus
          value={typed}
          placeholder="jj/mm/aaaa"
          aria-label="Date"
          spellCheck={false}
          onChange={(event) => {
            setTyped(event.target.value);
            const day = parseTypedDate(event.target.value);
            if (day) {
              setMonth(day);
              setFocus(day);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              const day = parseTypedDate(typed);
              if (day) pick(day);
              else if (!typed.trim()) {
                onChange(null);
                onClose();
              }
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              grid.current?.querySelector<HTMLButtonElement>("button.focus")?.focus();
            }
          }}
        />
        {withTime && <input className="date-picker-time" type="time" value={time} aria-label="Heure" onChange={(event) => setTime(event.target.value)} />}
      </div>
      <div className="date-picker-header">
        <span>{MONTH.format(month)}</span>
        <button onClick={() => (setMonth(new Date()), setFocus(new Date()))}>Aujourd'hui</button>
        <button aria-label="Mois précédent" onClick={() => shiftMonth(-1)}>
          <Icon name="chevronLeft" size={14} />
        </button>
        <button aria-label="Mois suivant" onClick={() => shiftMonth(1)}>
          <Icon name="chevronRight" size={14} />
        </button>
      </div>
      <div
        ref={grid}
        className="date-picker-grid"
        role="grid"
        onKeyDown={(event) => {
          const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
          if (event.key in moves) {
            event.preventDefault();
            moveFocus(moves[event.key]);
            requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>("button.focus")?.focus());
          }
        }}
      >
        {WEEKDAYS.map((day, i) => (
          <span key={i} className="date-picker-weekday">
            {day}
          </span>
        ))}
        {monthGrid(month).map((day) => {
          const iso = isoDay(day);
          const classes = [
            day.getMonth() !== month.getMonth() ? "outside" : "",
            iso === today ? "today" : "",
            selected && iso === isoDay(selected) ? "selected" : "",
            iso === isoDay(focus) ? "focus" : "",
          ].filter(Boolean);
          return (
            <button key={iso} className={classes.join(" ")} tabIndex={iso === isoDay(focus) ? 0 : -1} aria-label={LONG.format(day)} onClick={() => pick(day)}>
              {day.getDate()}
            </button>
          );
        })}
      </div>
      {value && (
        <div className="date-picker-footer">
          <button
            onClick={() => {
              onChange(null);
              onClose();
            }}
          >
            Effacer
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** A date shown as text; a click opens the picker. */
export function DateField({
  value,
  withTime = false,
  placeholder = "Vide",
  readOnly = false,
  className = "",
  onChange,
}: {
  value: string | null;
  withTime?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  onChange: (value: string | null) => void;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <button
        type="button"
        className={`date-field${value ? "" : " empty"}${className ? ` ${className}` : ""}`}
        disabled={readOnly}
        onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}
      >
        {value ? formatDateValue(value) : placeholder}
      </button>
      {anchor && <DatePicker value={value} withTime={withTime} anchor={anchor} onChange={onChange} onClose={() => setAnchor(null)} />}
    </>
  );
}
