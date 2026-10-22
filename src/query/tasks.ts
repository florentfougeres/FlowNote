import { addDays, QueryError } from "./dataview";
import { isoDay, type Page, type Priority, type Task } from "./pages";

/**
 * Queries of the Tasks plugin (```tasks blocks): one instruction per line.
 *
 *   done | not done
 *   due|scheduled|starts|done (before|after|on|on or before|on or after) <date>
 *   due today, due this week…   (date: today, tomorrow, yesterday, YYYY-MM-DD,
 *                                 in 3 days, 3 days ago, this/next/last week)
 *   has due date | no due date   (also scheduled, start, done)
 *   path|folder|filename|description|heading (includes|does not include) <text>
 *   tag|tags (include|includes|do not include|does not include) #tag
 *   priority is [above|below|not] highest|high|medium|none|low|lowest
 *   is recurring | is not recurring
 *   (filter) AND|OR (filter), NOT (filter)
 *   sort by due|scheduled|start|done|priority|path|description|status [reverse]
 *   group by filename|folder|path|due|priority|heading|status
 *   limit [to] N [tasks]
 *
 * Layout instructions (hide, show, short mode, explain) are accepted and ignored.
 */

type Filter = (task: Task) => boolean;
type SortKey = "due" | "scheduled" | "start" | "done" | "priority" | "path" | "description" | "status";
type GroupKey = "filename" | "folder" | "path" | "due" | "priority" | "heading" | "status";

export interface TasksQuery {
  filters: Filter[];
  sort: { key: SortKey; reverse: boolean }[];
  group: GroupKey | null;
  limit: number | null;
}

const PRIORITY_RANK: Record<Priority, number> = { highest: 0, high: 1, medium: 2, none: 3, low: 4, lowest: 5 };
const WEEKDAY = (today: Date) => (today.getDay() + 6) % 7;

/** A date or a range of days written in a query. */
function dateRange(text: string, today: Date): [string, string] | null {
  const word = text.trim().toLowerCase();
  const day = isoDay(today);
  const single = (d: string): [string, string] => [d, d];
  if (word === "today") return single(day);
  if (word === "tomorrow") return single(addDays(day, 1));
  if (word === "yesterday") return single(addDays(day, -1));
  const week = /^(this|next|last) week$/.exec(word);
  if (week) {
    const monday = addDays(day, -WEEKDAY(today) + (week[1] === "next" ? 7 : week[1] === "last" ? -7 : 0));
    return [monday, addDays(monday, 6)];
  }
  const ahead = /^in (\d+) days?$/.exec(word);
  if (ahead) return single(addDays(day, Number(ahead[1])));
  const ago = /^(\d+) days? ago$/.exec(word);
  if (ago) return single(addDays(day, -Number(ago[1])));
  if (/^\d{4}-\d{2}-\d{2}$/.test(word)) return single(word);
  return null;
}

type DateField = keyof Pick<Task, "due" | "scheduled" | "start" | "done">;
const DATE_FIELD: Record<string, DateField> = { due: "due", scheduled: "scheduled", starts: "start", start: "start", done: "done" };

function dateFilter(field: DateField, rest: string, today: Date): Filter | null {
  const match = /^(on or before|on or after|before|after|on|in)?\s*(.+)$/.exec(rest.trim());
  if (!match) return null;
  const range = dateRange(match[2], today);
  if (!range) return null;
  const [from, to] = range;
  const relation = match[1] ?? "on";
  return (task) => {
    const value = task[field];
    if (!value) return false;
    if (relation === "before") return value < from;
    if (relation === "after") return value > to;
    if (relation === "on or before") return value <= to;
    if (relation === "on or after") return value >= from;
    return value >= from && value <= to;
  };
}

const TEXT_OF: Record<string, (task: Task) => string> = {
  path: (t) => t.path,
  folder: (t) => t.path.slice(0, t.path.lastIndexOf("/") + 1),
  filename: (t) => t.path.slice(t.path.lastIndexOf("/") + 1),
  description: (t) => t.text,
  heading: (t) => t.heading ?? "",
};

/** One filter line, or null when it is not one. */
function filter(line: string, today: Date): Filter | null {
  const text = line.trim();
  const lower = text.toLowerCase();
  // Boolean combinations: (a) AND (b), (a) OR (b), NOT (a).
  const not = /^not\s*\((.*)\)$/i.exec(text);
  if (not) {
    const inner = filter(not[1], today);
    return inner && ((task) => !inner(task));
  }
  if (text.startsWith("(") && text.endsWith(")")) {
    const parts = text.slice(1, -1).split(/\)\s+(AND|OR)\s+\(/i);
    const filters = parts.filter((_, i) => i % 2 === 0).map((p) => filter(p, today));
    if (filters.some((f) => !f)) return null;
    const ops = parts.filter((_, i) => i % 2 === 1).map((op) => op.toUpperCase());
    return (task) => ops.reduce((acc, op, i) => (op === "AND" ? acc && filters[i + 1]!(task) : acc || filters[i + 1]!(task)), filters[0]!(task));
  }
  if (lower === "done") return (task) => task.completed;
  if (lower === "not done") return (task) => !task.completed;
  if (lower === "is recurring") return (task) => task.recurrence !== null;
  if (lower === "is not recurring") return (task) => task.recurrence === null;
  const has = /^(has|no) (due|scheduled|start|done) date$/.exec(lower);
  if (has) {
    const field = DATE_FIELD[has[2]];
    return has[1] === "has" ? (task) => task[field] !== null : (task) => task[field] === null;
  }
  const dated = /^(due|scheduled|starts|start|done)\s+(.+)$/.exec(lower);
  if (dated) return dateFilter(DATE_FIELD[dated[1]], dated[2], today);
  const texts = /^(path|folder|filename|description|heading)\s+(includes|does not include)\s+(.+)$/i.exec(text);
  if (texts) {
    const get = TEXT_OF[texts[1].toLowerCase()];
    const needle = texts[3].trim().toLowerCase();
    return texts[2].toLowerCase() === "includes" ? (task) => get(task).toLowerCase().includes(needle) : (task) => !get(task).toLowerCase().includes(needle);
  }
  const tag = /^tags?\s+(includes?|does not include|do not include)\s+#?(.+)$/i.exec(text);
  if (tag) {
    const wanted = `#${tag[2].trim().toLowerCase()}`;
    const found = (task: Task) => task.tags.some((t) => t.toLowerCase() === wanted || t.toLowerCase().startsWith(`${wanted}/`));
    return tag[1].toLowerCase().startsWith("include") ? found : (task) => !found(task);
  }
  const priority = /^priority is (above |below |not )?(highest|high|medium|none|low|lowest)$/.exec(lower);
  if (priority) {
    const rank = PRIORITY_RANK[priority[2] as Priority];
    const how = priority[1]?.trim();
    return (task) => {
      const own = PRIORITY_RANK[task.priority];
      return how === "above" ? own < rank : how === "below" ? own > rank : how === "not" ? own !== rank : own === rank;
    };
  }
  return null;
}

const IGNORED = /^(hide|show|short mode|full mode|explain|ignore global query)\b/i;

export function parseTasksQuery(source: string, today = new Date()): TasksQuery {
  const query: TasksQuery = { filters: [], sort: [], group: null, limit: null };
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || IGNORED.test(line)) continue;
    const sort = /^sort by (due|scheduled|start|done|priority|path|description|status)( reverse)?$/i.exec(line);
    if (sort) {
      query.sort.push({ key: sort[1].toLowerCase() as SortKey, reverse: !!sort[2] });
      continue;
    }
    const group = /^group by (filename|folder|path|due|priority|heading|status)$/i.exec(line);
    if (group) {
      query.group = group[1].toLowerCase() as GroupKey;
      continue;
    }
    const limit = /^limit (?:to )?(\d+)(?: tasks?)?$/i.exec(line);
    if (limit) {
      query.limit = Number(limit[1]);
      continue;
    }
    const found = filter(line, today);
    if (!found) throw new QueryError(`Instruction inconnue : « ${line} ».`);
    query.filters.push(found);
  }
  return query;
}

function sortValue(task: Task, key: SortKey): string | number {
  switch (key) {
    case "priority":
      return PRIORITY_RANK[task.priority];
    case "path":
      return `${task.path}\u0000${String(task.line).padStart(6, "0")}`;
    case "description":
      return task.text.toLowerCase();
    case "status":
      return task.completed ? 1 : 0;
    default:
      // Tasks without the date come last.
      return task[key] ?? "￿";
  }
}

const PRIORITY_NAMES: Record<Priority, string> = { highest: "Priorité maximale", high: "Priorité haute", medium: "Priorité moyenne", none: "Priorité normale", low: "Priorité basse", lowest: "Priorité minimale" };

function groupOf(task: Task, key: GroupKey): string {
  switch (key) {
    case "filename":
      return task.path.slice(task.path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
    case "folder":
      return task.path.includes("/") ? task.path.slice(0, task.path.lastIndexOf("/") + 1) : "/";
    case "path":
      return task.path.replace(/\.md$/i, "");
    case "due":
      return task.due ?? "Sans échéance";
    case "priority":
      return PRIORITY_NAMES[task.priority];
    case "heading":
      return task.heading ?? "(sans titre)";
    case "status":
      return task.completed ? "Faites" : "À faire";
  }
}

/** Runs a Tasks query on every task of the vault. */
export function runTasksQuery(query: TasksQuery, pages: Page[]): { key: string | null; tasks: Task[] }[] {
  let tasks = pages.flatMap((page) => page.tasks).filter((task) => query.filters.every((f) => f(task)));
  // The plugin's default order: open first, then by due date, then where they are.
  const sort: TasksQuery["sort"] = query.sort.length ? query.sort : [{ key: "status", reverse: false }, { key: "due", reverse: false }, { key: "path", reverse: false }];
  tasks.sort((a, b) => {
    for (const { key, reverse } of sort) {
      const x = sortValue(a, key);
      const y = sortValue(b, key);
      if (x !== y) return (x < y ? -1 : 1) * (reverse ? -1 : 1);
    }
    return sortValue(a, "path") < sortValue(b, "path") ? -1 : 1;
  });
  if (query.limit !== null) tasks = tasks.slice(0, query.limit);
  if (!query.group) return [{ key: null, tasks }];
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = groupOf(task, query.group);
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  return [...groups].sort((a, b) => a[0].localeCompare(b[0], "fr")).map(([key, list]) => ({ key, tasks: list }));
}
