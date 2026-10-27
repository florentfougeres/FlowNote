import type { TaskConfig, TaskStatus } from "./config";
import type { TaskInfo } from "./task";

/**
 * The task board (TaskNotes' kanban): a column per status, in the order of
 * the settings. Cards are ordered by hand with TaskNotes' ranks
 * (`tasknotes_manual_order: tnmzzzzzzzzz`, ten letters compared as text);
 * the default views show the highest rank first. Moving a card usually
 * writes that task only; when its neighbours leave no room (or carry a rank
 * FlowNote does not read), the column is renumbered.
 */

const WIDTH = 10;
const MAX = 26 ** WIDTH - 1;

export function encodeRank(value: number): string {
  let rest = Math.max(0, Math.min(MAX, Math.floor(value)));
  const chars: string[] = [];
  for (let i = 0; i < WIDTH; i++) {
    chars.unshift(String.fromCharCode(97 + (rest % 26)));
    rest = Math.floor(rest / 26);
  }
  return `tn${chars.join("")}`;
}

export function decodeRank(rank: string | null): number | null {
  if (!rank || !/^tn[a-z]{10}$/.test(rank)) return null;
  let value = 0;
  for (const c of rank.slice(2)) value = value * 26 + (c.charCodeAt(0) - 97);
  return value;
}

export type Direction = "ASC" | "DESC";

/** Cards in display order: by rank (tasks never placed after), then soonest due date, then title. */
export function sortCards(tasks: TaskInfo[], direction: Direction = "DESC"): TaskInfo[] {
  return [...tasks].sort((a, b) => {
    if (a.order !== null && b.order !== null && a.order !== b.order) return (a.order < b.order ? -1 : 1) * (direction === "DESC" ? -1 : 1);
    if ((a.order === null) !== (b.order === null)) return a.order === null ? 1 : -1;
    if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
    if (!a.due !== !b.due) return a.due ? -1 : 1;
    return a.title.localeCompare(b.title, "fr", { numeric: true });
  });
}

/** The statuses as columns, plus the values used by tasks that the settings do not list. */
export function boardColumns(tasks: TaskInfo[], config: TaskConfig): TaskStatus[] {
  const columns = [...config.statuses];
  for (const t of tasks) if (t.status && !columns.some((c) => c.value === t.status)) columns.push({ value: t.status, label: t.status, color: "#808080", done: false });
  return columns;
}

export interface OrderChange {
  path: string;
  order: string;
}

/**
 * New ranks for dropping `moved` at `index` among `cards` (a column in
 * display order, without the moved card): the moved task alone when there is
 * room between its neighbours, else every card of the column.
 */
export function planMove(moved: TaskInfo, cards: TaskInfo[], index: number, direction: Direction = "DESC"): OrderChange[] {
  const above = index > 0 ? decodeRank(cards[index - 1].order) : direction === "DESC" ? MAX : 0;
  const below = index < cards.length ? decodeRank(cards[index].order) : direction === "DESC" ? 0 : MAX;
  if (above !== null && below !== null && Math.abs(above - below) > 1) return [{ path: moved.path, order: encodeRank(Math.floor((above + below) / 2)) }];
  const list = [...cards.slice(0, index), moved, ...cards.slice(index)];
  const step = Math.floor(MAX / (list.length + 1));
  return list
    .map((t, i) => ({ path: t.path, order: encodeRank(direction === "DESC" ? MAX - (i + 1) * step : (i + 1) * step) }))
    .filter((change, i) => list[i] === moved || list[i].order !== change.order);
}
