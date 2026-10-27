/**
 * Tasks are notes in the format of the TaskNotes plugin for Obsidian. Its
 * settings (`.obsidian/plugins/tasknotes/data.json`, read only) say how a
 * note is recognised as a task, where new ones go, the names of their
 * properties and the statuses and priorities. Without the plugin, its
 * defaults apply.
 */

export interface TaskStatus {
  value: string;
  label: string;
  color: string;
  /** The task is done in this status (TaskNotes' `isCompleted`). */
  done: boolean;
}

export interface TaskPriority {
  value: string;
  label: string;
  color: string;
  weight: number;
}

/** The task fields FlowNote reads and writes, by their TaskNotes name. */
export const TASK_FIELDS = ["title", "status", "priority", "due", "scheduled", "contexts", "projects", "timeEstimate", "completedDate", "dateCreated", "dateModified", "recurrence", "recurrenceAnchor", "completeInstances", "skippedInstances", "blockedBy", "sortOrder"] as const;
export type TaskField = (typeof TASK_FIELDS)[number];

export interface TaskConfig {
  /** Where new tasks are created. */
  folder: string;
  /** A task carries this tag (`tags: [task]`)… */
  identification: "tag" | "property";
  tag: string;
  /** …or this property with this value. */
  property: { name: string; value: string };
  /** Front matter key of each field. */
  fields: Record<TaskField, string>;
  statuses: TaskStatus[];
  priorities: TaskPriority[];
  defaultStatus: string;
  defaultPriority: string;
  /** File name of a new task when the title is not the file name: an id (TaskNotes' `zettel`, `timestamp`). */
  filename: "zettel" | "timestamp";
  /** The title is the file name (no `title` property). */
  titleInFilename: boolean;
  /** The views opened by the app's commands (`.base` files). */
  views: { tasks: string; kanban: string; agenda: string; calendar: string };
  /** Read from the plugin's settings (false: TaskNotes' defaults). */
  fromPlugin: boolean;
}

/** French labels for TaskNotes' default statuses and priorities (labels set in the plugin are kept). */
const FRENCH: Record<string, string> = { None: "Aucun", Open: "À faire", "In progress": "En cours", Done: "Terminé", Low: "Basse", Normal: "Normale", High: "Haute" };

export const DEFAULT_TASK_CONFIG: TaskConfig = {
  folder: "TaskNotes/Tasks",
  identification: "tag",
  tag: "task",
  property: { name: "", value: "" },
  fields: {
    title: "title",
    status: "status",
    priority: "priority",
    due: "due",
    scheduled: "scheduled",
    contexts: "contexts",
    projects: "projects",
    timeEstimate: "timeEstimate",
    completedDate: "completedDate",
    dateCreated: "dateCreated",
    dateModified: "dateModified",
    recurrence: "recurrence",
    recurrenceAnchor: "recurrence_anchor",
    completeInstances: "complete_instances",
    skippedInstances: "skipped_instances",
    blockedBy: "blockedBy",
    sortOrder: "tasknotes_manual_order",
  },
  statuses: [
    { value: "none", label: "Aucun", color: "#cccccc", done: false },
    { value: "open", label: "À faire", color: "#808080", done: false },
    { value: "in-progress", label: "En cours", color: "#0066cc", done: false },
    { value: "done", label: "Terminé", color: "#00aa00", done: true },
  ],
  priorities: [
    { value: "none", label: "Aucune", color: "#cccccc", weight: 0 },
    { value: "low", label: "Basse", color: "#00aa00", weight: 1 },
    { value: "normal", label: "Normale", color: "#ffaa00", weight: 2 },
    { value: "high", label: "Haute", color: "#ff0000", weight: 3 },
  ],
  defaultStatus: "open",
  defaultPriority: "normal",
  filename: "zettel",
  titleInFilename: true,
  views: {
    tasks: "TaskNotes/Views/tasks-default.base",
    kanban: "TaskNotes/Views/kanban-default.base",
    agenda: "TaskNotes/Views/agenda-default.base",
    calendar: "TaskNotes/Views/calendar-default.base",
  },
  fromPlugin: false,
};

const text = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() !== "" ? v.trim() : fallback);

/** The configuration from the plugin's `data.json` ("{}" or unreadable: the defaults). */
export function readTaskConfig(json: string): TaskConfig {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Object.keys(parsed).length === 0) return DEFAULT_TASK_CONFIG;
    data = parsed as Record<string, unknown>;
  } catch {
    return DEFAULT_TASK_CONFIG;
  }
  const d = DEFAULT_TASK_CONFIG;
  const mapping = (data.fieldMapping ?? {}) as Record<string, unknown>;
  const fields = Object.fromEntries(TASK_FIELDS.map((f) => [f, text(mapping[f], d.fields[f])])) as Record<TaskField, string>;
  const statuses = Array.isArray(data.customStatuses)
    ? (data.customStatuses as Record<string, unknown>[])
        .filter((s) => typeof s?.value === "string")
        .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
        .map((s) => ({ value: String(s.value), label: FRENCH[text(s.label, "")] ?? text(s.label, String(s.value)), color: text(s.color, "#808080"), done: s.isCompleted === true }))
    : [];
  const priorities = Array.isArray(data.customPriorities)
    ? (data.customPriorities as Record<string, unknown>[])
        .filter((p) => typeof p?.value === "string")
        .map((p) => ({ value: String(p.value), label: p.value === "none" ? "Aucune" : (FRENCH[text(p.label, "")] ?? text(p.label, String(p.value))), color: text(p.color, "#808080"), weight: Number(p.weight ?? 0) }))
        .sort((a, b) => a.weight - b.weight)
    : [];
  const commands = (data.commandFileMapping ?? {}) as Record<string, unknown>;
  return {
    folder: typeof data.tasksFolder === "string" ? data.tasksFolder.replace(/^\/+|\/+$/g, "") : d.folder,
    identification: data.taskIdentificationMethod === "property" ? "property" : "tag",
    tag: text(data.taskTag, d.tag).replace(/^#/, ""),
    property: { name: text(data.taskPropertyName, ""), value: text(data.taskPropertyValue, "") },
    fields,
    statuses: statuses.length > 0 ? statuses : d.statuses,
    priorities: priorities.length > 0 ? priorities : d.priorities,
    defaultStatus: text(data.defaultTaskStatus, d.defaultStatus),
    defaultPriority: text(data.defaultTaskPriority, d.defaultPriority),
    filename: data.taskFilenameFormat === "timestamp" ? "timestamp" : "zettel",
    titleInFilename: data.storeTitleInFilename !== false,
    views: {
      tasks: text(commands["open-tasks-view"], d.views.tasks),
      kanban: text(commands["open-kanban-view"], d.views.kanban),
      agenda: text(commands["open-agenda-view"], d.views.agenda),
      calendar: text(commands["open-advanced-calendar-view"], d.views.calendar),
    },
    fromPlugin: true,
  };
}

/** The status, or a stand-in for a value the settings do not list. */
export function statusOf(config: TaskConfig, value: string | null): TaskStatus {
  return config.statuses.find((s) => s.value === value) ?? { value: value ?? "", label: value || "Aucun", color: "#808080", done: false };
}

export function priorityOf(config: TaskConfig, value: string | null): TaskPriority | null {
  return config.priorities.find((p) => p.value === value) ?? (value ? { value, label: value, color: "#808080", weight: 0 } : null);
}
