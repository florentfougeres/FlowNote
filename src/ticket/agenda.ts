import { isTicketMarkdown, ticketTitle } from "./format";

/**
 * Dated to-dos across the vault: unchecked tasks carrying a due date in the
 * Obsidian Tasks plugin convention (`- [ ] Faire X 📅 2026-10-20`), and open
 * tickets with a `due:` date. Also the tickets themselves, for the list view.
 */

const DUE_DATE = /📅️?[ \t]*(\d{4}-\d{2}-\d{2})/;

export interface AgendaItem {
  kind: "task" | "ticket";
  path: string;
  /** Task text (without the date), or the ticket title. */
  text: string;
  due: string;
  /** 1-based line of the task in the file. */
  line?: number;
}

export interface TicketInfo {
  path: string;
  id: number | null;
  title: string;
  status: "open" | "closed";
  /** Raw `status` value: the kanban column ("open" when missing). */
  column: string;
  /** Manual position in its kanban column (`order` property), null when never moved. */
  order: number | null;
  tags: string[];
  due: string | null;
  created: string | null;
  closed: string | null;
  /** Number of comments (replies included). */
  comments: number;
  tasks: { done: number; total: number };
}

function frontmatterOf(text: string): string {
  return /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
}

function field(yaml: string, key: string): string | null {
  const match = new RegExp(`^${key}[ \\t]*:[ \\t]*(.*)$`, "m").exec(yaml);
  if (!match) return null;
  const value = match[1].trim().replace(/^["']|["']$/g, "");
  return value === "" ? null : value;
}

function tagsOf(yaml: string): string[] {
  const inline = /^tags[ \t]*:[ \t]*\[([^\]]*)\]/m.exec(yaml);
  if (inline) return inline[1].split(",").map((t) => t.trim().replace(/^["'#]|["']$/g, "")).filter(Boolean);
  const block = /^tags[ \t]*:[ \t]*\r?\n((?:[ \t]*-[^\n]*\r?\n?)+)/m.exec(yaml);
  if (block) return block[1].split("\n").map((l) => l.replace(/^[ \t]*-[ \t]*/, "").trim().replace(/^["'#]|["']$/g, "")).filter(Boolean);
  return [];
}

export function ticketInfo(path: string, text: string): TicketInfo {
  const yaml = frontmatterOf(text);
  const { id, title } = ticketTitle(path);
  const tasks = [...text.matchAll(/^[ \t]*[-*+] \[([ xX])\]/gm)];
  return {
    path,
    id: Number(field(yaml, "id")) || id,
    title,
    status: field(yaml, "status") === "closed" ? "closed" : "open",
    column: field(yaml, "status") ?? "open",
    order: field(yaml, "order") !== null && Number.isFinite(Number(field(yaml, "order"))) ? Number(field(yaml, "order")) : null,
    tags: tagsOf(yaml),
    due: field(yaml, "due"),
    created: field(yaml, "created"),
    closed: field(yaml, "closed"),
    comments: (text.match(/^(?:>[ \t]?)+\[!comment\]/gim) ?? []).length,
    tasks: { done: tasks.filter((t) => t[1] !== " ").length, total: tasks.length },
  };
}

/** Every ticket of the vault. */
export function ticketsOf(notes: [string, string][]): TicketInfo[] {
  return notes.filter(([, text]) => isTicketMarkdown(text)).map(([path, text]) => ticketInfo(path, text));
}

/** Dated, not done: unchecked tasks with 📅 and open tickets with a due date, soonest first. */
export function agenda(notes: [string, string][]): AgendaItem[] {
  const items: AgendaItem[] = [];
  for (const [path, text] of notes) {
    if (path.toLowerCase().endsWith(".excalidraw.md")) continue;
    let inFence = false;
    text.split(/\r?\n/).forEach((line, index) => {
      if (/^[ \t]*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return;
      const task = /^[ \t]*(?:>[ \t]?)*[-*+] \[ \][ \t]+(.*)$/.exec(line);
      const due = task ? DUE_DATE.exec(task[1]) : null;
      if (task && due) items.push({ kind: "task", path, text: task[1].replace(DUE_DATE, "").trim(), due: due[1], line: index + 1 });
    });
    if (isTicketMarkdown(text)) {
      const info = ticketInfo(path, text);
      if (info.status === "open" && info.due && /^\d{4}-\d{2}-\d{2}/.test(info.due)) items.push({ kind: "ticket", path, text: info.title, due: info.due.slice(0, 10) });
    }
  }
  return items.sort((a, b) => a.due.localeCompare(b.due) || a.path.localeCompare(b.path, "fr"));
}

/** "2026-10-14" for a local date. */
export function isoDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
