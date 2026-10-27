import { noteLinkTargets, noteTags } from "../dashboard/stats";
import { noteProperties, splitFrontmatter } from "../markdown/frontmatter";
import { dirname, noteTitle } from "../vault/links";
import { isoDay } from "../dates";

/**
 * The vault as the queries see it (Dataview and Tasks blocks): one page per
 * note, with its properties, inline fields (`key:: value`), tags, dates and
 * tasks. Read from the notes' text, never written.
 */

/** A link to a note, shown as a link in the results. */
export class Link {
  constructor(public readonly path: string) {}
  toString() {
    return noteTitle(this.path);
  }
}

/** A duration (Dataview's `dur(7 days)`). */
export interface Duration {
  days: number;
}

/** A value of a field or of an expression. Dates are strings `YYYY-MM-DD` (or with a time), compared as text. */
export type Value = string | number | boolean | null | Link | Duration | Value[] | { [key: string]: Value };

export type Priority = "highest" | "high" | "medium" | "none" | "low" | "lowest";

export interface Task {
  path: string;
  /** 0-based line of the task in its note. */
  line: number;
  /** Description, without the dates and signs of the Tasks plugin. */
  text: string;
  /** The character between the brackets. */
  status: string;
  completed: boolean;
  due: string | null;
  scheduled: string | null;
  start: string | null;
  done: string | null;
  priority: Priority;
  recurrence: string | null;
  /** With `#`. */
  tags: string[];
  /** The heading the task is under. */
  heading: string | null;
}

export interface Page {
  path: string;
  name: string;
  folder: string;
  /** With `#`, as Dataview gives them. */
  tags: string[];
  ctime: string | null;
  mtime: string | null;
  /** Properties then inline fields, by key as written. */
  fields: Map<string, Value>;
  tasks: Task[];
  /** Targets of its links, as written. */
  links: string[];
}

const TASK = /^(\s*)([-*+]) \[(.)\] (.*)$/;
const INLINE_FIELD = /^\s*(?:[-*+] )?([\p{L}\p{N}_ -]+?)::\s*(.*)$/u;
const BRACKET_FIELD = /[[(]([\p{L}\p{N}_ -]+?)::\s*([^\])]*)[\])]/gu;
const DATE = "(\\d{4}-\\d{2}-\\d{2})";

const SIGNS: [keyof Pick<Task, "due" | "scheduled" | "start" | "done">, RegExp][] = [
  ["due", new RegExp(`(?:📅|📆|🗓️?)\\s*${DATE}`, "u")],
  ["scheduled", new RegExp(`(?:⏳|⌛)\\s*${DATE}`, "u")],
  ["start", new RegExp(`🛫\\s*${DATE}`, "u")],
  ["done", new RegExp(`✅\\s*${DATE}`, "u")],
];
const PRIORITIES: [string, Priority][] = [
  ["🔺", "highest"],
  ["⏫", "high"],
  ["🔼", "medium"],
  ["🔽", "low"],
  ["⏬", "lowest"],
];
const TAG = /(?:^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;


function isoTime(time: number): string {
  const date = new Date(time);
  return `${isoDay(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Reads one task line of a note (null when the line is not a task). */
export function parseTask(path: string, line: number, text: string, heading: string | null = null): Task | null {
  const match = TASK.exec(text);
  if (!match) return null;
  const status = match[3];
  let description = match[4];
  const dates: Pick<Task, "due" | "scheduled" | "start" | "done"> = { due: null, scheduled: null, start: null, done: null };
  for (const [key, sign] of SIGNS) {
    const found = sign.exec(description);
    if (found) {
      dates[key] = found[1];
      description = description.replace(found[0], "");
    }
  }
  // Dataview's way: [due:: 2026-10-30].
  for (const field of description.matchAll(BRACKET_FIELD)) {
    const key = field[1].trim().toLowerCase();
    if ((key === "due" || key === "scheduled" || key === "start" || key === "completion") && /^\d{4}-\d{2}-\d{2}/.test(field[2])) {
      dates[key === "completion" ? "done" : key] = field[2].slice(0, 10);
      description = description.replace(field[0], "");
    }
  }
  let priority: Priority = "none";
  for (const [sign, level] of PRIORITIES) {
    if (description.includes(sign)) {
      priority = level;
      description = description.replace(sign, "");
    }
  }
  const recurrence = /🔁\s*([^📅📆🗓⏳⌛🛫✅🔺⏫🔼🔽⏬]+)/u.exec(description);
  if (recurrence) description = description.replace(recurrence[0], "");
  const tags = [...description.matchAll(TAG)].map((t) => `#${t[1]}`);
  return {
    path,
    line,
    text: description.replace(/\s+\^[\w-]+\s*$/, "").replace(/\s{2,}/g, " ").trim(),
    status,
    completed: status !== " ",
    ...dates,
    priority,
    recurrence: recurrence ? recurrence[1].trim() : null,
    tags,
    heading,
  };
}

function propertyValue(value: unknown): Value {
  if (Array.isArray(value)) return value.map(propertyValue);
  if (typeof value === "string") {
    const link = /^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/.exec(value.trim());
    return link ? new Link(link[1]) : value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return value === undefined ? null : String(value);
}

/** An inline field's text as a value: number, boolean, link or text. */
function inlineValue(text: string): Value {
  const value = text.trim();
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value === "true" || value === "false") return value === "true";
  return propertyValue(value);
}

/** Reads a note into a page. */
export function readPage(path: string, text: string, stats?: { ctime: number; mtime: number }): Page {
  const fields = new Map<string, Value>();
  for (const { key, value } of noteProperties(text)) fields.set(key, propertyValue(value));
  const front = splitFrontmatter(text);
  const body = front ? front.body : text;
  const offset = front ? front.block.split("\n").length - 1 : 0;
  const tasks: Task[] = [];
  let fence: string | null = null;
  let heading: string | null = null;
  body.split(/\r?\n/).forEach((line, i) => {
    const marker = /^\s*(```+|~~~+)/.exec(line)?.[1];
    if (marker && (fence === null || line.trim().startsWith(fence))) {
      fence = fence === null ? marker : null;
      return;
    }
    if (fence !== null) return;
    const title = /^#{1,6}\s+(.*)$/.exec(line);
    if (title) heading = title[1].trim();
    const task = parseTask(path, offset + i, line, heading);
    if (task) tasks.push(task);
    const field = INLINE_FIELD.exec(line);
    if (field && !task && !fields.has(field[1].trim())) fields.set(field[1].trim(), inlineValue(field[2]));
    for (const inline of line.matchAll(BRACKET_FIELD)) if (!fields.has(inline[1].trim())) fields.set(inline[1].trim(), inlineValue(inline[2]));
  });
  return {
    path,
    name: noteTitle(path),
    folder: dirname(path),
    tags: [...new Set(noteTags(text).map((t) => `#${t}`))],
    ctime: stats ? isoTime(stats.ctime) : null,
    mtime: stats ? isoTime(stats.mtime) : null,
    fields,
    tasks,
    links: noteLinkTargets(text),
  };
}

export interface VaultSnapshot {
  notes: [string, string][];
  stats: { path: string; ctime: number; mtime: number }[];
}

/** The pages of the vault, drawings and mind maps aside (their text is data). */
export function readPages(snapshot: VaultSnapshot): Page[] {
  const stats = new Map(snapshot.stats.map((s) => [s.path, s]));
  return snapshot.notes.filter(([path]) => !/\.(excalidraw|mindmap)\.md$/i.test(path)).map(([path, text]) => readPage(path, text, stats.get(path)));
}

/** Checks or unchecks a task line, adding or removing its done date (✅) like the Tasks plugin; null when the line is not a task. */
export function setTaskDone(line: string, done: boolean, today: string): string | null {
  const match = TASK.exec(line);
  if (!match) return null;
  const [, indent, bullet] = match;
  let description = match[4];
  if (done) {
    if (!/✅\s*\d{4}-\d{2}-\d{2}/u.test(description)) description = `${description.replace(/\s+$/, "")} ✅ ${today}`;
  } else description = description.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/u, "");
  return `${indent}${bullet} [${done ? "x" : " "}] ${description}`;
}
