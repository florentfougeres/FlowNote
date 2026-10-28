import type { TaskConfig } from "./config";
import { isTaskMarkdown, taskInfo } from "./task";
import { isoDay } from "../dates";

/**
 * Dated to-dos across the vault: unchecked checkboxes carrying a due date in
 * the Obsidian Tasks plugin convention (`- [ ] Faire X 📅 2026-10-20`), and
 * the tasks (TaskNotes notes) not done with a `due` date.
 */

const DUE_DATE = /📅️?[ \t]*(\d{4}-\d{2}-\d{2})/;

export interface AgendaItem {
  kind: "checkbox" | "task";
  path: string;
  /** Checkbox text (without the date), or the task title. */
  text: string;
  due: string;
  /** 1-based line of the checkbox in the file. */
  line?: number;
  /** A checkbox's priority sign (Obsidian Tasks: 🔺 ⏫ 🔼 🔽 ⏬), taken out of its text. */
  priority?: TasksPriority;
}

export type TasksPriority = "highest" | "high" | "medium" | "low" | "lowest";

const PRIORITY_SIGNS: [string, TasksPriority][] = [
  ["🔺", "highest"],
  ["⏫", "high"],
  ["🔼", "medium"],
  ["🔽", "low"],
  ["⏬", "lowest"],
];

/** Dated, not done, soonest first. */
export function agenda(notes: [string, string][], config: TaskConfig): AgendaItem[] {
  const items: AgendaItem[] = [];
  for (const [path, text] of notes) {
    if (path.toLowerCase().endsWith(".excalidraw.md")) continue;
    let inFence = false;
    text.split(/\r?\n/).forEach((line, index) => {
      if (/^[ \t]*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return;
      const task = /^[ \t]*(?:>[ \t]?)*[-*+] \[ \][ \t]+(.*)$/.exec(line);
      const due = task ? DUE_DATE.exec(task[1]) : null;
      if (!task || !due) return;
      let label = task[1].replace(DUE_DATE, "");
      const priority = PRIORITY_SIGNS.find(([sign]) => label.includes(sign))?.[1];
      for (const [sign] of PRIORITY_SIGNS) label = label.replaceAll(`${sign}\uFE0F`, "").replaceAll(sign, "");
      items.push({ kind: "checkbox", path, text: label.replace(/\s{2,}/g, " ").trim(), due: due[1], line: index + 1, ...(priority ? { priority } : {}) });
    });
    if (isTaskMarkdown(text, config)) {
      const info = taskInfo(path, text, config);
      if (!info.done && info.due && /^\d{4}-\d{2}-\d{2}/.test(info.due)) items.push({ kind: "task", path, text: info.title, due: info.due.slice(0, 10) });
    }
  }
  return items.sort((a, b) => a.due.localeCompare(b.due) || a.path.localeCompare(b.path, "fr"));
}

export type Urgency = "overdue" | "today" | "soon" | "later";

/** Overdue, due today, within a week, later. */
export function urgency(due: string, today = isoDay()): Urgency {
  if (due < today) return "overdue";
  if (due === today) return "today";
  const inAWeek = new Date(`${today}T12:00:00`);
  inAWeek.setDate(inAWeek.getDate() + 7);
  return due <= isoDay(inAWeek) ? "soon" : "later";
}

/** "aujourd'hui", "demain", "lun. 20 oct.", "il y a 3 jours"… */
export function dueLabel(due: string, today = isoDay()): string {
  const day = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
  const diff = Math.round((day(due) - day(today)) / 86400000);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "demain";
  if (diff === -1) return "hier";
  if (diff < 0) return `en retard de ${-diff} jours`;
  return new Date(`${due}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}
