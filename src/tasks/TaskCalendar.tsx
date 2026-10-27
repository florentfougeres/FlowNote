import { useContext, useRef, useState } from "react";
import { Icon } from "../Icon";
import { monthGrid } from "../base/CalendarView";
import { priorityOf } from "./config";
import { isOccurrenceDone, occurrences } from "./recurrence";
import { type TaskInfo } from "./task";
import { TaskConfigContext } from "./TaskSummary";
import { isoDay } from "../dates";

/** What places a task on a day: its due date, its scheduled date, an occurrence of its rule, or another date property. */
export type EntryKind = "due" | "scheduled" | "occurrence" | "date";

export interface CalendarEntry {
  task: TaskInfo;
  day: string;
  kind: EntryKind;
  done: boolean;
  /** Shown on today while late (the agenda's overdue tasks). */
  late?: boolean;
}

export type CalendarMode = "month" | "week" | "list";

export interface CalendarOptions {
  mode: CalendarMode;
  /** Days of the agenda (list). */
  listDays: number;
  showDue: boolean;
  showScheduled: boolean;
  showRecurring: boolean;
  /** Late tasks are listed on today in the agenda. */
  showOverdueOnToday: boolean;
  /** Only this date (a mini calendar): "due", "scheduled", "file.ctime"… */
  dateProperty: string | null;
}

/** TaskNotes' options of a calendar view (`calendarView: timeGridWeek`, `showDue`…), with its defaults. */
export function calendarOptions(type: string, options: Record<string, unknown>): CalendarOptions {
  const view = String(options.calendarView ?? "");
  const flag = (key: string) => options[key] !== false;
  const mini = type === "tasknotesMiniCalendar";
  return {
    mode: mini || view.startsWith("dayGridMonth") || view === "multiMonthYear" ? "month" : view.startsWith("list") ? "list" : "week",
    listDays: Math.max(1, Math.min(31, Number(options.listDayCount) || 7)),
    showDue: flag("showDue"),
    showScheduled: flag("showScheduled"),
    showRecurring: flag("showRecurring"),
    showOverdueOnToday: options.showOverdueOnToday === true,
    dateProperty: mini ? String(options.dateProperty ?? "due").replace(/^note\./, "") : null,
  };
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
/** Monday of the week of `day`. */
const weekStart = (day: string) => addDays(day, -((new Date(`${day}T12:00:00`).getDay() + 6) % 7));

/** The entries of the tasks between two days (included), by day. */
export function calendarEntries(tasks: TaskInfo[], from: string, to: string, options: CalendarOptions, dateOf?: (task: TaskInfo) => string | null, today = isoDay()): Map<string, CalendarEntry[]> {
  const byDay = new Map<string, CalendarEntry[]>();
  const add = (entry: CalendarEntry) => {
    if (entry.day >= from && entry.day <= to) byDay.set(entry.day, [...(byDay.get(entry.day) ?? []), entry]);
  };
  for (const task of tasks) {
    if (options.dateProperty) {
      const day = dateOf?.(task)?.slice(0, 10);
      if (day) add({ task, day, kind: "date", done: task.done });
      continue;
    }
    const scheduled = task.recurrence ? null : (task.scheduled?.slice(0, 10) ?? null);
    const due = task.due?.slice(0, 10) ?? null;
    if (task.recurrence) {
      if (options.showRecurring) for (const day of occurrences(task, from, to)) add({ task, day, kind: "occurrence", done: task.done || isOccurrenceDone(task, day) });
    } else if (options.showScheduled && scheduled) add({ task, day: scheduled, kind: "scheduled", done: task.done });
    if (options.showDue && due && due !== scheduled && !task.recurrence) add({ task, day: due, kind: "due", done: task.done });
    // Late and not done: also on today in the agenda.
    const late = [due, scheduled].filter((d): d is string => d !== null && d < today);
    if (options.showOverdueOnToday && options.mode === "list" && !task.done && !task.recurrence && late.length) add({ task, day: today, kind: due && due < today ? "due" : "scheduled", done: false, late: true });
  }
  return byDay;
}

const KIND: Record<EntryKind, { icon: string; label: string }> = {
  due: { icon: "📅", label: "Échéance" },
  scheduled: { icon: "⏳", label: "Prévue" },
  occurrence: { icon: "🔁", label: "Occurrence" },
  date: { icon: "", label: "" },
};

const dayLabel = (day: string, format: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", format);

/**
 * TaskNotes' calendar views: a month, a week, or the agenda (the next days in
 * a list). Tasks show on their due and scheduled dates, recurring ones on each
 * occurrence; the round box completes a task or an occurrence. Dragging a
 * task to another day moves that date.
 */
export function TaskCalendar({
  tasks,
  options,
  editable,
  dateOf,
  onOpen,
  onToggle,
  onMove,
}: {
  tasks: TaskInfo[];
  options: CalendarOptions;
  editable: boolean;
  /** The date of a task for a mini calendar's property. */
  dateOf?: (task: TaskInfo) => string | null;
  onOpen: (path: string, newTab: boolean) => void;
  /** Completes (or opens again) the task, or its occurrence of the entry's day. */
  onToggle: (entry: CalendarEntry) => void;
  /** Moves the date the entry stands for to `day`. */
  onMove: (entry: CalendarEntry, day: string) => void;
}) {
  const config = useContext(TaskConfigContext);
  const today = isoDay();
  const [mode, setMode] = useState<CalendarMode>(options.mode);
  const [anchor, setAnchor] = useState(today);
  const [drag, setDrag] = useState<{ entry: CalendarEntry; x: number; y: number; over: string | null } | null>(null);
  const pressed = useRef<{ entry: CalendarEntry; x: number; y: number } | null>(null);

  const anchorDate = new Date(`${anchor}T12:00:00`);
  const days =
    mode === "month"
      ? monthGrid(anchorDate.getFullYear(), anchorDate.getMonth()).flat().map(isoDay)
      : mode === "week"
        ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i))
        : Array.from({ length: options.listDays }, (_, i) => addDays(anchor, i));
  const entries = calendarEntries(tasks, days[0], days[days.length - 1], { ...options, mode }, dateOf, today);
  const step = (n: number) => {
    if (mode === "month") setAnchor(isoDay(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + n, 1, 12)));
    else setAnchor(addDays(anchor, n * (mode === "week" ? 7 : options.listDays)));
  };
  const title = mode === "month" ? dayLabel(anchor, { month: "long", year: "numeric" }) : `${dayLabel(days[0], { day: "numeric", month: "short" })} – ${dayLabel(days[days.length - 1], { day: "numeric", month: "short", year: "numeric" })}`;
  const dayAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-day]") as HTMLElement | null)?.dataset.day ?? null;
  const movable = (entry: CalendarEntry) => editable && (entry.kind === "due" || entry.kind === "scheduled") && !entry.late;

  const item = (entry: CalendarEntry, day: string) => {
    const priority = priorityOf(config, entry.task.priority);
    const dragged = drag?.entry === entry;
    return (
      <div
        key={`${entry.task.path}-${entry.kind}-${entry.late ? "late" : day}`}
        role="button"
        tabIndex={0}
        className={["task-cal-item", entry.done ? "done" : "", entry.late ? "late" : "", dragged ? "dragging" : ""].filter(Boolean).join(" ")}
        title={entry.late ? `${entry.task.title} (en retard)` : entry.task.title}
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as Element).closest(".task-check")) return;
          e.preventDefault();
          pressed.current = { entry, x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const p = pressed.current;
          if (!p || !movable(p.entry) || (!drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5)) return;
          setDrag({ entry: p.entry, x: e.clientX, y: e.clientY, over: dayAt(e.clientX, e.clientY) });
        }}
        onPointerUp={(e) => {
          const p = pressed.current;
          pressed.current = null;
          if (!drag) return p && onOpen(entry.task.path, e.metaKey || e.ctrlKey);
          const target = dayAt(e.clientX, e.clientY);
          setDrag(null);
          if (target && target !== day) onMove(entry, target);
        }}
        onPointerCancel={() => {
          pressed.current = null;
          setDrag(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && onOpen(entry.task.path, e.metaKey || e.ctrlKey)}
      >
        {entry.kind !== "date" && (
          <button className="task-check small" role="checkbox" aria-checked={entry.done} aria-label={entry.done ? "Rouvrir" : "Terminer"} disabled={!editable} onClick={() => onToggle(entry)}>
            {entry.done && <Icon name="check" size={8} />}
          </button>
        )}
        {priority && priority.weight > 0 && <span className="task-priority-dot" style={{ background: priority.color }} />}
        <span className="task-cal-title">{entry.task.title}</span>
        {KIND[entry.kind].icon && (
          <span className="task-cal-kind" title={KIND[entry.kind].label}>
            {KIND[entry.kind].icon}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className={drag ? "db-calendar task-calendar dragging" : "db-calendar task-calendar"}>
      <div className="db-calendar-bar">
        <h2>{title}</h2>
        <span className="db-calendar-nav">
          <button className="db-icon-button" aria-label="Précédent" title="Précédent" onClick={() => step(-1)}>
            <Icon name="chevronLeft" size={14} />
          </button>
          <button className="db-tool" onClick={() => setAnchor(today)}>
            Aujourd'hui
          </button>
          <button className="db-icon-button" aria-label="Suivant" title="Suivant" onClick={() => step(1)}>
            <Icon name="chevronRight" size={14} />
          </button>
        </span>
        {!options.dateProperty && (
          <div className="segmented task-cal-modes" role="radiogroup" aria-label="Affichage">
            {(
              [
                ["month", "Mois"],
                ["week", "Semaine"],
                ["list", "Agenda"],
              ] as const
            ).map(([value, label]) => (
              <button key={value} role="radio" aria-checked={mode === value} className={mode === value ? "selected" : ""} onClick={() => setMode(value)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {mode === "list" ? (
        <div className="task-agenda">
          {days.map((day) => {
            const list = entries.get(day) ?? [];
            return (
              <section key={day} className={day === today ? "task-agenda-day today" : "task-agenda-day"} data-day={day}>
                <header>
                  <strong>{day === today ? "Aujourd'hui" : day === addDays(today, 1) ? "Demain" : dayLabel(day, { weekday: "long" })}</strong>
                  <span>{dayLabel(day, { day: "numeric", month: "long" })}</span>
                </header>
                {list.length ? list.map((entry) => item(entry, day)) : <p className="task-agenda-empty">Rien de prévu</p>}
              </section>
            );
          })}
        </div>
      ) : (
        <div className={mode === "week" ? "db-calendar-grid task-week" : "db-calendar-grid"} role="grid">
          {["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."].map((d, i) => (
            <div key={d} className={mode === "week" && days[i] === today ? "db-calendar-weekday today" : "db-calendar-weekday"}>
              {mode === "week" ? `${d} ${Number(days[i].slice(8))}` : d}
            </div>
          ))}
          {days.map((day) => {
            const date = new Date(`${day}T12:00:00`);
            const outside = mode === "month" && date.getMonth() !== anchorDate.getMonth();
            return (
              <div key={day} data-day={day} className={["db-calendar-day", outside ? "outside" : "", day === today ? "today" : "", drag?.over === day ? "drop" : ""].filter(Boolean).join(" ")}>
                {mode === "month" && (
                  <div className="db-calendar-day-head">
                    <span className="db-calendar-date">{date.getDate() === 1 ? dayLabel(day, { day: "numeric", month: "short" }) : date.getDate()}</span>
                  </div>
                )}
                {(entries.get(day) ?? []).map((entry) => item(entry, day))}
              </div>
            );
          })}
        </div>
      )}
      {drag && (
        <div className="task-cal-item board-ghost" style={{ left: drag.x + 8, top: drag.y - 10 }} aria-hidden>
          <span className="task-cal-title">{drag.entry.task.title}</span>
        </div>
      )}
    </div>
  );
}
