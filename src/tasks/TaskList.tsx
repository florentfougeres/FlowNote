import { useContext } from "react";
import { Icon } from "../Icon";
import type { TaskInfo } from "./task";
import { priorityOf } from "./config";
import { DateChip, durationLabel, linkText, TaskConfigContext } from "./TaskSummary";

export interface TaskGroup {
  key: string;
  label: string;
  color?: string;
  tasks: TaskInfo[];
}

/**
 * TaskNotes' task list view: a line per task (TaskLine), in groups when the
 * view groups them (by status, priority…). The round box completes the task
 * or opens it again.
 */
export function TaskList({
  groups,
  editable,
  onOpen,
  onToggle,
  onMenu,
}: {
  groups: TaskGroup[];
  editable: boolean;
  onOpen: (path: string, newTab: boolean) => void;
  onToggle: (task: TaskInfo) => void;
  /** Right-click on a task: its menu (open, delete). */
  onMenu: (path: string, event: React.MouseEvent) => void;
}) {
  const config = useContext(TaskConfigContext);
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  if (total === 0) {
    return (
      <div className="tasks-empty">
        <Icon name="task" size={22} />
        <p>Aucune tâche dans cette vue.</p>
      </div>
    );
  }
  return (
    <div className="task-list">
      {groups.map((group) =>
        group.tasks.length === 0 ? null : (
          <section key={group.key} className="task-group">
            {(groups.length > 1 || group.label) && (
              <header className="task-group-header">
                {group.color && <span className="board-dot" style={{ background: group.color }} />}
                <strong>{group.label || "Sans valeur"}</strong>
                <span className="board-count">{group.tasks.length}</span>
              </header>
            )}
            {group.tasks.map((task) => {
              const status = config.statuses.find((s) => s.value === task.status);
              return (
                <div key={task.path} className={task.done ? "task-row done" : "task-row"} onContextMenu={(e) => onMenu(task.path, e)}>
                  <button
                    className="task-check"
                    role="checkbox"
                    aria-checked={task.done}
                    aria-label={task.done ? "Rouvrir la tâche" : "Terminer la tâche"}
                    disabled={!editable}
                    style={status && !task.done ? { borderColor: status.color } : undefined}
                    onClick={() => onToggle(task)}
                  >
                    {task.done && <Icon name="check" size={11} />}
                  </button>
                  <button className="task-row-main task-line" onClick={(e) => onOpen(task.path, e.metaKey || e.ctrlKey)} onAuxClick={(e) => e.button === 1 && onOpen(task.path, true)} title={task.title}>
                    <TaskLine task={task} />
                  </button>
                </div>
              );
            })}
          </section>
        ),
      )}
    </div>
  );
}

/**
 * A task on one line: priority and title, then in muted columns on the right
 * its projects and contexts, its estimate and recurrence, and its date (the
 * due date, else the scheduled one). Tags show after the title, quietly.
 */
function TaskLine({ task }: { task: TaskInfo }) {
  const config = useContext(TaskConfigContext);
  const priority = priorityOf(config, task.priority);
  const date = task.due ? { day: task.due, icon: "calendar" as const, title: "Échéance" } : task.scheduled ? { day: task.scheduled, icon: "hourglass" as const, title: "Prévue le" } : null;
  return (
    <>
      <span className="task-line-title">
        {priority && priority.weight > 0 && <span className="task-priority-dot" style={{ background: priority.color }} title={`Priorité ${priority.label.toLowerCase()}`} />}
        <span className="task-line-name">{task.title}</span>
        {task.tags.length > 0 && <span className="task-line-tags">{task.tags.map((t) => `#${t}`).join(" ")}</span>}
      </span>
      <span className="task-line-meta">
        {[...task.projects.map(linkText), ...task.contexts.map((c) => `@${c}`)].join(" · ")}
        {task.checklist.total > 0 && (
          <span title="Cases cochées">
            <Icon name="checkbox" size={11} /> {task.checklist.done}/{task.checklist.total}
          </span>
        )}
        {task.timeEstimate && <span title="Estimation">{durationLabel(task.timeEstimate)}</span>}
        {task.recurrence && (
          <span title="Tâche récurrente">
            <Icon name="repeat" size={11} />
          </span>
        )}
      </span>
      <span className="task-line-date">{date && <DateChip date={date.day} done={task.done} icon={date.icon} title={date.title} />}</span>
    </>
  );
}
