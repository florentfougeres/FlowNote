import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { recurrenceText, ruleParts } from "./recurrence";

const WEEKDAYS: [string, string, string][] = [
  ["MO", "L", "lundi"],
  ["TU", "M", "mardi"],
  ["WE", "M", "mercredi"],
  ["TH", "J", "jeudi"],
  ["FR", "V", "vendredi"],
  ["SA", "S", "samedi"],
  ["SU", "D", "dimanche"],
];
/** RRULE day codes by `Date.getDay()`. */
const CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const FREQS: [string, string][] = [
  ["DAILY", "Jours"],
  ["WEEKLY", "Semaines"],
  ["MONTHLY", "Mois"],
  ["YEARLY", "Ans"],
];

/** The rule built by the editor: every `interval` days, weeks (on these days), months or years, from `start`. */
export function buildRule(freq: string, interval: number, days: string[], start: Date): string {
  const parts = [`FREQ=${freq}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (freq === "WEEKLY") parts.push(`BYDAY=${(days.length ? WEEKDAYS.map(([c]) => c).filter((c) => days.includes(c)) : [CODES[start.getDay()]]).join(",")}`);
  if (freq === "MONTHLY") parts.push(`BYMONTHDAY=${start.getDate()}`);
  if (freq === "YEARLY") parts.push(`BYMONTH=${start.getMonth() + 1}`, `BYMONTHDAY=${start.getDate()}`);
  return parts.join(";");
}

/**
 * The recurrence of a task: its rule in words, and a popover to choose one
 * (presets, or every n days, weeks on chosen days, months, years) and whether
 * the next occurrence follows the last completion (TaskNotes'
 * `recurrence_anchor: completion`).
 */
export function RecurrenceField({
  rule,
  anchor,
  start,
  done,
  editable,
  onChange,
}: {
  rule: string | null;
  anchor: "scheduled" | "completion";
  /** The first day (scheduled, else today): presets take its weekday and day of month. */
  start: Date;
  /** Occurrences done. */
  done: number;
  editable: boolean;
  onChange: (rule: string | null, anchor: "scheduled" | "completion") => void;
}) {
  const [open, setOpen] = useState(false);
  /** The menu opens leftwards when it would leave the window on the right. */
  const [toLeft, setToLeft] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const toggle = () => {
    setToLeft((box.current?.getBoundingClientRect().left ?? 0) + 340 > window.innerWidth - 16);
    setOpen(!open);
  };
  const parts = rule ? ruleParts(rule) : {};
  const [freq, setFreq] = useState(parts.FREQ && FREQS.some(([f]) => f === parts.FREQ) ? parts.FREQ : "WEEKLY");
  const [interval, setInterval] = useState(Number(parts.INTERVAL ?? 1) || 1);
  const [days, setDays] = useState<string[]>((parts.BYDAY ?? "").split(",").filter((d) => /^[A-Z]{2}$/.test(d)));
  const [follow, setFollow] = useState(anchor === "completion");
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  const choose = (next: string | null) => {
    onChange(next, follow ? "completion" : "scheduled");
    setOpen(false);
  };
  const weekday = WEEKDAYS.find(([c]) => c === CODES[start.getDay()])!;
  const presets: [string, string][] = [
    ["Tous les jours", "FREQ=DAILY"],
    [`Toutes les semaines, le ${weekday[2]}`, `FREQ=WEEKLY;BYDAY=${weekday[0]}`],
    ["Du lundi au vendredi", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
    [`Tous les mois, le ${start.getDate() === 1 ? "1er" : start.getDate()}`, `FREQ=MONTHLY;BYMONTHDAY=${start.getDate()}`],
    [`Tous les ans, le ${start.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`, `FREQ=YEARLY;BYMONTH=${start.getMonth() + 1};BYMONTHDAY=${start.getDate()}`],
  ];
  const custom = buildRule(freq, interval, days, start);

  return (
    <span className="task-recurrence" ref={box}>
      {rule ? (
        <span className="task-tag">
          <button className="task-chip-open" disabled={!editable} onClick={toggle} title={rule}>
            <Icon name="repeat" size={11} /> {recurrenceText(rule)}
            {anchor === "completion" ? ", après la dernière fois" : ""}
            {done > 0 ? ` · ${done} fois faite` : ""}
          </button>
          {editable && (
            <button aria-label="Ne plus répéter" onClick={() => choose(null)}>
              ×
            </button>
          )}
        </span>
      ) : (
        editable && (
          <button className="task-add" onClick={toggle}>
            + répéter
          </button>
        )
      )}
      {open && (
        <div className={toLeft ? "task-recurrence-menu to-left" : "task-recurrence-menu"} role="dialog" aria-label="Répéter la tâche">
          <div className="task-recurrence-presets">
            {presets.map(([label, value]) => (
              <button key={value} onClick={() => choose(value)}>
                {label}
              </button>
            ))}
          </div>
          <div className="task-recurrence-custom">
            <span className="task-recurrence-row">
              Tous les
              <input type="number" min={1} max={99} value={interval} aria-label="Intervalle" onChange={(e) => setInterval(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} />
              <span className="segmented" role="radiogroup" aria-label="Unité">
                {FREQS.map(([value, label]) => (
                  <button key={value} role="radio" aria-checked={freq === value} className={freq === value ? "selected" : ""} onClick={() => setFreq(value)}>
                    {label}
                  </button>
                ))}
              </span>
            </span>
            {freq === "WEEKLY" && (
              <span className="task-recurrence-days" role="group" aria-label="Jours">
                {WEEKDAYS.map(([code, letter, name]) => (
                  <button key={code} aria-pressed={days.includes(code)} aria-label={name} title={name} className={days.includes(code) ? "selected" : ""} onClick={() => setDays(days.includes(code) ? days.filter((d) => d !== code) : [...days, code])}>
                    {letter}
                  </button>
                ))}
              </span>
            )}
            <label className="task-recurrence-follow">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
              Compter à partir de la dernière fois faite
            </label>
            <button className="primary" onClick={() => choose(custom)}>
              Répéter : {recurrenceText(custom).toLowerCase()}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
