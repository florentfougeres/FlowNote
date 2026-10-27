import { useRef, useState } from "react";
import { Icon } from "../Icon";
import type { TaskStatus } from "./config";
import type { TaskInfo } from "./task";
import { TaskSummary } from "./TaskSummary";

interface Drag {
  task: TaskInfo;
  /** Pointer position, and where the card was grabbed. */
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
}

/**
 * Kanban board of the tasks (TaskNotes' kanban view): a column per status,
 * cards dragged between columns and within one (the order is kept in the
 * tasks). The drag follows the pointer itself (no HTML drag and drop, which
 * WebKit refuses on some elements), with the card under the pointer.
 */
export function TaskBoard({
  columns,
  cards,
  editable,
  onOpen,
  onMove,
  onCreate,
}: {
  columns: TaskStatus[];
  /** The cards of each column, in display order. */
  cards: TaskInfo[][];
  editable: boolean;
  onOpen: (path: string, newTab: boolean) => void;
  /** Drop of `task` at `index` of the column `status` (index among the column's other cards). */
  onMove: (task: TaskInfo, status: string, index: number) => void;
  /** A new task in the column `status`. */
  onCreate?: (status: string) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [target, setTarget] = useState<{ column: number; index: number } | null>(null);
  const pressed = useRef<{ task: TaskInfo; x: number; y: number; rect: DOMRect } | null>(null);

  /** Column and position under the pointer, from the cards' positions on screen. */
  const targetAt = (x: number, y: number) => {
    const column = [...document.querySelectorAll<HTMLElement>(".board-column")].findIndex((el) => {
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top - 40 && y <= Math.max(r.bottom, window.innerHeight);
    });
    if (column < 0) return null;
    const others = [...document.querySelectorAll<HTMLElement>(`.board-column[data-column="${column}"] .board-card:not(.dragging)`)];
    const index = others.filter((el) => {
      const r = el.getBoundingClientRect();
      return y > r.top + r.height / 2;
    }).length;
    return { column, index };
  };

  const onPointerDown = (event: React.PointerEvent, task: TaskInfo) => {
    if (event.button !== 0 || !editable) return;
    // No text selection while a card is pressed or dragged (the click still opens it).
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    pressed.current = { task, x: event.clientX, y: event.clientY, rect: event.currentTarget.getBoundingClientRect() };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const press = pressed.current;
    if (!press) return;
    if (!drag && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 5) return;
    setDrag({ task: press.task, x: event.clientX, y: event.clientY, dx: press.x - press.rect.left, dy: press.y - press.rect.top, width: press.rect.width });
    setTarget(targetAt(event.clientX, event.clientY));
  };
  const onPointerUp = (event: React.PointerEvent, task: TaskInfo) => {
    const press = pressed.current;
    pressed.current = null;
    if (!press) return;
    if (!drag) {
      onOpen(task.path, event.metaKey || event.ctrlKey);
      return;
    }
    const to = targetAt(event.clientX, event.clientY);
    setDrag(null);
    setTarget(null);
    if (!to) return;
    // `index` counts the other cards of the column (the dragged one is left out).
    const from = cards[to.column].findIndex((t) => t.path === task.path);
    if (from >= 0 && from === to.index) return;
    onMove(task, columns[to.column].value, to.index);
  };
  const cancel = () => {
    pressed.current = null;
    setDrag(null);
    setTarget(null);
  };

  return (
    <div className={drag ? "board dragging" : "board"}>
      {columns.map((column, c) => {
        const shown = cards[c].filter((t) => t.path !== drag?.task.path);
        return (
          <section key={column.value} className={`board-column${target?.column === c ? " drop" : ""}`} data-column={c}>
            <header className="board-column-header">
              <span className="board-dot" style={{ background: column.color }} />
              <strong>{column.label}</strong>
              <span className="board-count">{cards[c].length}</span>
            </header>
            <div className="board-cards">
              {cards[c].map((t) => {
                const dragged = drag?.task.path === t.path;
                const before = !dragged && target?.column === c && shown.indexOf(t) === target.index;
                return (
                  <div key={t.path} className="board-slot">
                    {before && <div className="board-insert" />}
                    <div
                      role="button"
                      tabIndex={0}
                      data-path={t.path}
                      className={`board-card${dragged ? " dragging" : ""}`}
                      onPointerDown={(event) => onPointerDown(event, t)}
                      onPointerMove={onPointerMove}
                      onPointerUp={(event) => onPointerUp(event, t)}
                      onPointerCancel={cancel}
                      onClick={() => !editable && onOpen(t.path, false)}
                      onAuxClick={(event) => event.button === 1 && onOpen(t.path, true)}
                      onKeyDown={(event) => event.key === "Enter" && onOpen(t.path, event.metaKey || event.ctrlKey)}
                    >
                      <TaskSummary task={t} />
                    </div>
                  </div>
                );
              })}
              {target?.column === c && target.index >= shown.length && drag && <div className="board-insert" />}
              {onCreate && editable && (
                <button className="board-new" onClick={() => onCreate(column.value)}>
                  <Icon name="plus" size={13} /> Nouvelle tâche
                </button>
              )}
            </div>
          </section>
        );
      })}
      {drag && (
        <div className="board-card board-ghost" style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width }} aria-hidden>
          <TaskSummary task={drag.task} />
        </div>
      )}
    </div>
  );
}
