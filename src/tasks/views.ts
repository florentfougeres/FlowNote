import tasksView from "./views/tasks-default.base?raw";
import kanbanView from "./views/kanban-default.base?raw";
import agendaView from "./views/agenda-default.base?raw";
import calendarView from "./views/calendar-default.base?raw";
import type { TaskConfig } from "./config";

/**
 * TaskNotes' default views (`TaskNotes/Views/*.base`, as the plugin writes
 * them with its default settings), created by FlowNote when they are missing:
 * the same files open in Obsidian with the plugin.
 */
const DEFAULT_VIEWS: Record<keyof TaskConfig["views"], string> = { tasks: tasksView, kanban: kanbanView, agenda: agendaView, calendar: calendarView };

export function defaultViewFile(view: keyof TaskConfig["views"]): string {
  return DEFAULT_VIEWS[view];
}
