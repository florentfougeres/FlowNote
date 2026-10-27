import { noteProperties, splitFrontmatter, type PropertyValue } from "../markdown/frontmatter";
import { setNoteProperty } from "../base/rows";
import { noteTitle } from "../vault/links";
import { statusOf, type TaskConfig } from "./config";
import { isoDay } from "../dates";

/**
 * A task: a note in the TaskNotes format, readable and editable as is in
 * Obsidian with the plugin.
 *
 *   ---
 *   status: in-progress
 *   priority: high
 *   due: 2026-10-20
 *   scheduled: 2026-10-18
 *   contexts: [bureau]
 *   projects: ["[[Site Maison Pain]]"]
 *   dateCreated: 2026-10-14T13:40:00.000+02:00
 *   dateModified: 2026-10-15T09:12:00.000+02:00
 *   tags: [task]
 *   ---
 *   Description…
 *
 *   ## Commentaires          ← FlowNote's thread (comments.ts), ignored by TaskNotes
 *
 * The title is the file name (or the `title` property when TaskNotes is set
 * so). Property names follow the plugin's settings (`config.fields`).
 */

export interface TaskInfo {
  path: string;
  title: string;
  /** Raw `status` value ("" when missing). */
  status: string;
  /** In a status marked as completed. */
  done: boolean;
  priority: string | null;
  due: string | null;
  scheduled: string | null;
  contexts: string[];
  projects: string[];
  /** Tags other than the task tag. */
  tags: string[];
  /** Minutes. */
  timeEstimate: number | null;
  created: string | null;
  completed: string | null;
  /** RRULE (`DTSTART:20261020;FREQ=WEEKLY;BYDAY=MO`), null for a one-off task. */
  recurrence: string | null;
  /** The next occurrence follows the scheduled dates, or the last completion. */
  recurrenceAnchor: "scheduled" | "completion";
  /** Days (`YYYY-MM-DD`) of the occurrences done, and skipped. */
  completeInstances: string[];
  skippedInstances: string[];
  /** Manual position (TaskNotes' rank, compared as text), null when never placed. */
  order: string | null;
  /** Number of comments (replies included). */
  comments: number;
  /** Checkboxes in the description. */
  checklist: { done: number; total: number };
}

export function frontmatterValues(markdown: string): Record<string, PropertyValue> {
  const values: Record<string, PropertyValue> = {};
  for (const p of noteProperties(markdown)) values[p.key] = p.value;
  return values;
}

const list = (v: PropertyValue | undefined): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v.trim() !== "" ? [v] : []);
const textOf = (v: PropertyValue | undefined): string | null => (v === null || v === undefined || v === "" || Array.isArray(v) ? null : String(v));
const cleanTag = (t: string) => t.trim().replace(/^#/, "");

/** The tag marks a task: `task`, or under it (`task/travail`), like TaskNotes. */
const isTaskTag = (tag: string, config: TaskConfig) => {
  const t = cleanTag(tag).toLowerCase();
  const wanted = config.tag.toLowerCase();
  return t === wanted || t.startsWith(`${wanted}/`);
};

/** Whether front matter values make a task, as TaskNotes decides (front matter only, never a tag in the text). */
export function isTaskValues(values: Record<string, PropertyValue>, config: TaskConfig): boolean {
  if (config.identification === "property") {
    const { name, value } = config.property;
    if (!name || !value) return false;
    const v = values[name];
    const same = (x: unknown) => (typeof x === "boolean" ? String(x) === value.toLowerCase() : x === value);
    return Array.isArray(v) ? v.some(same) : same(v);
  }
  return list(values.tags).some((t) => isTaskTag(t, config));
}

export function isTaskMarkdown(markdown: string, config: TaskConfig): boolean {
  return splitFrontmatter(markdown) !== null && isTaskValues(frontmatterValues(markdown), config);
}

export function taskInfo(path: string, markdown: string, config: TaskConfig): TaskInfo {
  const values = frontmatterValues(markdown);
  const f = config.fields;
  const status = textOf(values[f.status]) ?? "";
  const checks = [...markdown.matchAll(/^[ \t]*[-*+] \[([ xX])\]/gm)];
  const estimate = Number(values[f.timeEstimate]);
  return {
    path,
    title: (!config.titleInFilename && textOf(values[f.title])) || noteTitle(path),
    status,
    done: statusOf(config, status).done,
    priority: textOf(values[f.priority]),
    due: textOf(values[f.due]),
    scheduled: textOf(values[f.scheduled]),
    contexts: list(values[f.contexts]),
    projects: list(values[f.projects]),
    tags: list(values.tags).map(cleanTag).filter((t) => !isTaskTag(t, config)),
    timeEstimate: Number.isFinite(estimate) && estimate > 0 ? estimate : null,
    created: textOf(values[f.dateCreated]),
    completed: textOf(values[f.completedDate]),
    recurrence: textOf(values[f.recurrence]),
    recurrenceAnchor: textOf(values[f.recurrenceAnchor]) === "completion" ? "completion" : "scheduled",
    completeInstances: list(values[f.completeInstances]).map((d) => d.slice(0, 10)),
    skippedInstances: list(values[f.skippedInstances]).map((d) => d.slice(0, 10)),
    order: textOf(values[f.sortOrder]),
    comments: (markdown.match(/^(?:>[ \t]?)+\[!comment\]/gim) ?? []).length,
    checklist: { done: checks.filter((c) => c[1] !== " ").length, total: checks.length },
  };
}

/** Every task of the vault. */
export function tasksOf(notes: [string, string][], config: TaskConfig): TaskInfo[] {
  return notes.filter(([path, text]) => path.endsWith(".md") && isTaskMarkdown(text, config)).map(([path, text]) => taskInfo(path, text, config));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A local date-time with milliseconds and offset, as TaskNotes writes `dateCreated` and `dateModified`. */
export function taskTimestamp(date = new Date()): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const day = isoDay(date);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, "0")}`;
  return `${day}T${time}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}


/** TaskNotes' id file names: `zettel` is yyMMdd + the seconds since midnight in base 36. */
function idName(config: TaskConfig, date: Date): string {
  if (config.filename === "timestamp") return `${isoDay(date)}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  return `${String(date.getFullYear()).slice(2)}${pad(date.getMonth() + 1)}${pad(date.getDate())}${Math.floor((date.getTime() - midnight.getTime()) / 1000).toString(36)}`;
}

/** Title of a task just created, typed over in its page. */
export const NEW_TASK_TITLE = "Sans titre";

/** File name (without `.md`) of a new task: its title, or an id when the title is a property. */
export function taskFileName(title: string, config: TaskConfig, date = new Date()): string {
  return config.titleInFilename ? title.replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim() || "Tâche" : idName(config, date);
}

/** A new task, its front matter in TaskNotes' order. */
export function newTaskFile(title: string, config: TaskConfig, now = new Date(), values: { due?: string; status?: string } = {}): string {
  const f = config.fields;
  const yaml = (v: string) => (/^[\w./-]+$/.test(v) && !/^(true|false|null|yes|no|~)$/i.test(v) ? v : JSON.stringify(v));
  const status = values.status ?? config.defaultStatus;
  const lines = [
    ...(config.titleInFilename ? [] : [`${f.title}: ${JSON.stringify(title.trim())}`]),
    `${f.status}: ${yaml(status)}`,
    `${f.priority}: ${yaml(config.defaultPriority)}`,
    ...(values.due ? [`${f.due}: ${values.due}`] : []),
    `${f.dateCreated}: ${taskTimestamp(now)}`,
    `${f.dateModified}: ${taskTimestamp(now)}`,
    ...(statusOf(config, status).done ? [`${f.completedDate}: ${isoDay(now)}`] : []),
    ...(config.identification === "property" ? [`${config.property.name}: ${yaml(config.property.value)}`] : ["tags:", `  - ${config.tag}`]),
  ];
  return ["---", ...lines, "---", "", ""].join("\n");
}

/**
 * The task with one field changed, as TaskNotes does it: `dateModified` is
 * updated, and a status change sets or removes `completedDate` (not for a
 * recurring task, whose occurrences are completed one by one). The rest of
 * the file is kept byte for byte.
 */
export function setTaskField(markdown: string, key: string, value: PropertyValue | undefined, config: TaskConfig, now = new Date()): string {
  const f = config.fields;
  let text = setNoteProperty(markdown, key, value);
  if (key === f.status) {
    const values = frontmatterValues(text);
    const done = statusOf(config, typeof value === "string" ? value : null).done;
    if (!values[f.recurrence]) {
      if (done && !values[f.completedDate]) text = setNoteProperty(text, f.completedDate, isoDay(now));
      if (!done && values[f.completedDate] !== undefined) text = setNoteProperty(text, f.completedDate, undefined);
    }
  }
  return setNoteProperty(text, f.dateModified, taskTimestamp(now));
}

/** The first status marked as completed. */
export function doneStatus(config: TaskConfig): string {
  return config.statuses.find((s) => s.done)?.value ?? "done";
}

/** The status of a task opened again: the default one, unless it means done. */
export function reopenStatus(config: TaskConfig): string {
  return statusOf(config, config.defaultStatus).done ? (config.statuses.find((s) => !s.done && s.value !== "none")?.value ?? "open") : config.defaultStatus;
}

/** The day a recurring task's round box completes: its scheduled occurrence, or today when the rule follows completions (as TaskNotes). */
export function actionDay(task: TaskInfo, today = isoDay()): string {
  return task.recurrenceAnchor !== "completion" && task.scheduled ? task.scheduled.slice(0, 10) : today;
}
