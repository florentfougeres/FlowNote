import { useRef, useState } from "react";
import { Icon } from "../Icon";
import { dueLabel, urgency, type TicketInfo } from "./agenda";
import { boardColumns, type TicketColumn } from "./board";

interface Drag {
  ticket: TicketInfo;
  /** Pointer position, and where the card was grabbed. */
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
}

/**
 * Kanban board of the tickets: a column per status, cards dragged between
 * columns and within one (the order is kept in the tickets). The drag follows
 * the pointer itself (no HTML drag and drop, which WebKit refuses on some
 * elements), with the card under the pointer like in Notion.
 */
export function TicketBoard({
  tickets,
  columns,
  onOpen,
  onMove,
  onCreate,
}: {
  tickets: TicketInfo[];
  columns: TicketColumn[];
  onOpen: (path: string, newTab: boolean) => void;
  /** Drop of `ticket` at `index` of the column `status` (index among the column's other cards). */
  onMove: (ticket: TicketInfo, status: string, index: number) => void;
  onCreate: () => void;
}) {
  const cards = boardColumns(tickets, columns);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [target, setTarget] = useState<{ column: number; index: number } | null>(null);
  const pressed = useRef<{ ticket: TicketInfo; x: number; y: number; rect: DOMRect } | null>(null);

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

  const onPointerDown = (event: React.PointerEvent, ticket: TicketInfo) => {
    if (event.button !== 0) return;
    // No text selection while a card is pressed or dragged (the click still opens it).
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    pressed.current = { ticket, x: event.clientX, y: event.clientY, rect: event.currentTarget.getBoundingClientRect() };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const press = pressed.current;
    if (!press) return;
    if (!drag && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 5) return;
    setDrag({ ticket: press.ticket, x: event.clientX, y: event.clientY, dx: press.x - press.rect.left, dy: press.y - press.rect.top, width: press.rect.width });
    setTarget(targetAt(event.clientX, event.clientY));
  };
  const onPointerUp = (event: React.PointerEvent, ticket: TicketInfo) => {
    const press = pressed.current;
    pressed.current = null;
    if (!press) return;
    if (!drag) {
      onOpen(ticket.path, event.metaKey || event.ctrlKey);
      return;
    }
    const to = targetAt(event.clientX, event.clientY);
    setDrag(null);
    setTarget(null);
    if (!to) return;
    // `index` counts the other cards of the column (the dragged one is left out).
    const from = cards[to.column].findIndex((t) => t.path === ticket.path);
    if (from >= 0 && from === to.index) return;
    onMove(ticket, columns[to.column].status, to.index);
  };
  const cancel = () => {
    pressed.current = null;
    setDrag(null);
    setTarget(null);
  };

  const card = (t: TicketInfo) => {
    const level = t.due && t.status === "open" ? urgency(t.due.slice(0, 10)) : null;
    return (
      <>
        <span className="board-card-title">{t.title}</span>
        {t.tags.length > 0 && (
          <span className="board-card-tags">
            {t.tags.map((x) => (
              <span key={x} className="ticket-tag small">
                #{x}
              </span>
            ))}
          </span>
        )}
        <span className="board-card-meta">
          {t.id !== null && <span>#{t.id}</span>}
          {t.due && <span className={`due-chip${level ? ` ${level}` : ""}`}>📅 {level ? dueLabel(t.due.slice(0, 10)) : t.due.slice(0, 10)}</span>}
          {t.tasks.total > 0 && <span title="Tâches">☑ {t.tasks.done}/{t.tasks.total}</span>}
          {t.comments > 0 && (
            <span title="Commentaires">
              <Icon name="comment" size={11} /> {t.comments}
            </span>
          )}
        </span>
      </>
    );
  };

  return (
    <div className={drag ? "board dragging" : "board"}>
      {columns.map((column, c) => {
        const shown = cards[c].filter((t) => t.path !== drag?.ticket.path);
        return (
          <section key={column.status} className={`board-column${target?.column === c ? " drop" : ""}`} data-column={c}>
            <header className="board-column-header">
              <span className={`board-dot${c === 0 ? " open" : c === columns.length - 1 ? " closed" : ""}`} />
              <strong>{column.label}</strong>
              <span className="board-count">{cards[c].length}</span>
            </header>
            <div className="board-cards">
              {cards[c].map((t) => {
                const dragged = drag?.ticket.path === t.path;
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
                      onAuxClick={(event) => event.button === 1 && onOpen(t.path, true)}
                      onKeyDown={(event) => event.key === "Enter" && onOpen(t.path, event.metaKey || event.ctrlKey)}
                    >
                      {card(t)}
                    </div>
                  </div>
                );
              })}
              {target?.column === c && target.index >= shown.length && drag && <div className="board-insert" />}
              {c === 0 && (
                <button className="board-new" onClick={onCreate}>
                  <Icon name="plus" size={13} /> Nouveau ticket
                </button>
              )}
            </div>
          </section>
        );
      })}
      {drag && (
        <div className="board-card board-ghost" style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width }} aria-hidden>
          {card(drag.ticket)}
        </div>
      )}
    </div>
  );
}
