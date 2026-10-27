import { createContext, useContext } from "react";
import { Icon } from "../Icon";
import { dueLabel, urgency } from "./agenda";
import { DEFAULT_TASK_CONFIG, priorityOf, type TaskConfig } from "./config";
import type { TaskInfo } from "./task";

/** The tasks' settings, for the views showing tasks. */
export const TaskConfigContext = createContext<TaskConfig>(DEFAULT_TASK_CONFIG);

/** "[[Site Maison Pain|Site]]" → "Site". */
export const linkText = (value: string) => value.replace(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/, (_, target: string, alias?: string) => alias ?? target);

/** A date as a chip, colored by urgency while the task is not done. */
export function DateChip({ date, done, icon = "📅", title }: { date: string; done: boolean; icon?: string; title?: string }) {
  const day = date.slice(0, 10);
  const level = done ? null : urgency(day);
  return (
    <span className={`due-chip${level ? ` ${level}` : ""}`} title={title}>
      {icon} {level ? dueLabel(day) : day}
    </span>
  );
}

/** "90" → "1 h 30". */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
}

/** What a card or a row shows of a task: title, priority, dates, contexts, projects, progress. */
export function TaskSummary({ task }: { task: TaskInfo }) {
  const config = useContext(TaskConfigContext);
  const priority = priorityOf(config, task.priority);
  return (
    <>
      <span className="board-card-title">
        {priority && priority.weight > 0 && <span className="task-priority-dot" style={{ background: priority.color }} title={`Priorité ${priority.label.toLowerCase()}`} />}
        {task.title}
      </span>
      {(task.contexts.length > 0 || task.projects.length > 0 || task.tags.length > 0) && (
        <span className="board-card-tags">
          {task.projects.map((p) => (
            <span key={p} className="task-chip project">
              {linkText(p)}
            </span>
          ))}
          {task.contexts.map((c) => (
            <span key={c} className="task-chip context">
              @{c}
            </span>
          ))}
          {task.tags.map((t) => (
            <span key={t} className="task-tag small">
              #{t}
            </span>
          ))}
        </span>
      )}
      {(task.due || task.scheduled || task.recurrence || task.checklist.total > 0 || task.comments > 0 || task.timeEstimate) && (
        <span className="board-card-meta">
          {task.due && <DateChip date={task.due} done={task.done} title="Échéance" />}
          {task.scheduled && <DateChip date={task.scheduled} done={task.done} icon="⏳" title="Prévue le" />}
          {task.recurrence && (
            <span title="Tâche récurrente">
              <Icon name="repeat" size={11} />
            </span>
          )}
          {task.timeEstimate && <span title="Estimation">{durationLabel(task.timeEstimate)}</span>}
          {task.checklist.total > 0 && (
            <span title="Cases cochées">
              ☑ {task.checklist.done}/{task.checklist.total}
            </span>
          )}
          {task.comments > 0 && (
            <span title="Commentaires">
              <Icon name="comment" size={11} /> {task.comments}
            </span>
          )}
        </span>
      )}
    </>
  );
}
