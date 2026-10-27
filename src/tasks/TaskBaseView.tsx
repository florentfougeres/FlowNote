import { useEffect, useState } from "react";
import type { BaseView as View } from "../base/baseFile";
import { setNoteProperty, type BaseRow } from "../base/rows";
import type { Vault } from "../vault/vault";
import { boardColumns, planMove, sortCards, type Direction } from "./board";
import { priorityOf, statusOf, type TaskConfig } from "./config";
import { doneStatus, setTaskField, taskInfo, type TaskInfo } from "./task";
import { TaskBoard } from "./TaskBoard";
import { TaskList, type TaskGroup } from "./TaskList";
import { TaskConfigContext } from "./TaskSummary";

/** TaskNotes' view types, shown by FlowNote in place of the plugin. */
export const isTaskView = (type: string) => type.startsWith("tasknotes");

/** French names for the views TaskNotes creates (shown only: the file keeps its names). */
const VIEW_NAMES: Record<string, string> = {
  "Manual Order": "Ordre manuel",
  "All Tasks": "Toutes",
  "Not Blocked": "Non bloquées",
  Today: "Aujourd'hui",
  Overdue: "En retard",
  "This Week": "Cette semaine",
  Unscheduled: "Sans date",
  "Kanban Board": "Tableau",
  Agenda: "Agenda",
  Calendar: "Calendrier",
};
export const taskViewName = (name: string) => VIEW_NAMES[name] ?? name;

/**
 * A view of a TaskNotes `.base` file: the task list (`tasknotesTaskList`) or
 * the kanban (`tasknotesKanban`). The rows are those of the base, filtered
 * and sorted as its view says; changes are written to the tasks the way
 * TaskNotes writes them (status, completion date, rank).
 */
export function TaskBaseView({
  view,
  rows,
  texts,
  config,
  vault,
  editable,
  onOpen,
  onChanged,
  onNew,
}: {
  view: View;
  /** The view's rows, filtered and sorted. */
  rows: BaseRow[];
  /** The notes' text, for what the properties do not say (comments, checkboxes). */
  texts: Map<string, string>;
  config: TaskConfig;
  vault: Vault;
  editable: boolean;
  onOpen: (path: string, newTab: boolean) => void;
  /** Tasks were written: the base reads them again. */
  onChanged: () => void;
  onNew: (status?: string) => void;
}) {
  const f = config.fields;
  /** Changes shown at once, until the rows are read again. */
  const [shown, setShown] = useState<Map<string, Partial<TaskInfo>>>(new Map());
  const [error, setError] = useState("");
  useEffect(() => setShown(new Map()), [rows]);
  const tasks = rows.map((row) => ({ ...taskInfo(row.path, texts.get(row.path) ?? "", config), ...shown.get(row.path) }));

  const write = async (changes: { path: string; change: (text: string) => string; local: Partial<TaskInfo> }[]) => {
    setShown((map) => {
      const next = new Map(map);
      for (const c of changes) next.set(c.path, { ...next.get(c.path), ...c.local });
      return next;
    });
    setError("");
    try {
      for (const { path, change } of changes) {
        const text = await vault.read(path);
        await vault.write(path, change(text), text);
      }
    } catch (e) {
      setError(`Impossible d'enregistrer la tâche : ${String(e)}`);
    }
    onChanged();
  };

  const toggle = (task: TaskInfo) => {
    const reopen = statusOf(config, config.defaultStatus).done ? (config.statuses.find((s) => !s.done && s.value !== "none")?.value ?? "open") : config.defaultStatus;
    const status = task.done ? reopen : doneStatus(config);
    void write([{ path: task.path, change: (text) => setTaskField(text, f.status, status, config), local: { status, done: !task.done } }]);
  };

  const manual = view.sort[0]?.property === f.sortOrder;
  const direction: Direction = view.sort[0]?.direction === "ASC" ? "ASC" : "DESC";

  let body;
  if (view.type === "tasknotesKanban") {
    const all = boardColumns(tasks, config);
    const fallback = all.some((c) => c.value === "none") ? "none" : config.defaultStatus;
    const inColumn = (value: string) => tasks.filter((t) => (t.status || fallback) === value);
    // "None" is a column only while tasks are in it.
    const columns = all.filter((c) => c.value !== "none" || inColumn(c.value).length > 0);
    const cards = columns.map((c) => (manual ? sortCards(inColumn(c.value), direction) : inColumn(c.value)));
    const move = (task: TaskInfo, status: string, index: number) => {
      const column = columns.findIndex((c) => c.value === status);
      const others = cards[column].filter((t) => t.path !== task.path);
      const ranks = planMove(task, others, index, direction);
      const statusChanged = (task.status || fallback) !== status;
      void write(
        ranks.map(({ path, order }) => ({
          path,
          change: (text: string) => {
            const ranked = setNoteProperty(text, f.sortOrder, order);
            return path === task.path && statusChanged ? setTaskField(ranked, f.status, status, config) : ranked;
          },
          local: { order, ...(path === task.path && statusChanged ? { status, done: statusOf(config, status).done } : {}) },
        })),
      );
    };
    body = <TaskBoard columns={columns} cards={cards} editable={editable} onOpen={onOpen} onMove={move} onCreate={onNew} />;
  } else {
    body = <TaskList groups={groupsOf(tasks, view.groupBy, config)} editable={editable} onOpen={onOpen} onToggle={toggle} />;
  }

  return (
    <TaskConfigContext.Provider value={config}>
      {error && (
        <p className="status warning" onClick={() => setError("")}>
          {error}
        </p>
      )}
      {view.type === "tasknotesCalendar" || view.type === "tasknotesMiniCalendar" ? <p className="dash-muted task-view-note">Le calendrier de TaskNotes n'est pas encore affiché par FlowNote : voici ses tâches en liste.</p> : null}
      {body}
    </TaskConfigContext.Provider>
  );
}

/** The groups of the list: by status or priority in the settings' order, else by value. */
function groupsOf(tasks: TaskInfo[], groupBy: string | null, config: TaskConfig): TaskGroup[] {
  const f = config.fields;
  if (!groupBy) return [{ key: "", label: "", tasks }];
  if (groupBy === f.status) {
    const columns = boardColumns(tasks, config);
    const fallback = columns.some((c) => c.value === "none") ? "none" : config.defaultStatus;
    return columns.map((s) => ({ key: s.value, label: s.label, color: s.color, tasks: tasks.filter((t) => (t.status || fallback) === s.value) }));
  }
  if (groupBy === f.priority) {
    const priorities = [...config.priorities].sort((a, b) => b.weight - a.weight);
    const groups = priorities.map((p) => ({ key: p.value, label: p.label, color: p.color, tasks: tasks.filter((t) => (t.priority ?? "none") === p.value) }));
    const other = tasks.filter((t) => !priorities.some((p) => p.value === (t.priority ?? "none")));
    return other.length ? [...groups, { key: "?", label: priorityOf(config, other[0].priority)?.label ?? "", tasks: other }] : groups;
  }
  const field = Object.entries(f).find(([, name]) => name === groupBy)?.[0];
  const value = (t: TaskInfo): string => {
    const v = field && field in t ? (t as unknown as Record<string, unknown>)[field] : groupBy === "tags" ? t.tags : undefined;
    return Array.isArray(v) ? String(v[0] ?? "") : v === null || v === undefined ? "" : String(v);
  };
  const keys = [...new Set(tasks.map(value))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "fr")));
  return keys.map((k) => ({ key: k, label: k, tasks: tasks.filter((t) => value(t) === k) }));
}
