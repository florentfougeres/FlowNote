import { useRef, useState, type ReactNode } from "react";
import { Icon } from "../Icon";
import type { VaultBridge } from "../editor/bridge";
import { resolveLink } from "../vault/links";
import { addCard, addLane, cardDone, cardText, makeCard, moveCard, parseKanban, removeLane, renameLane, serializeKanban, setCard, type KanbanBoard, type KanbanCard } from "./format";

interface Drag {
  lane: number;
  card: number;
  /** Pointer position, and where the card was grabbed. */
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
}

/** A card's text: `[[liens]]` that open their note, `#tags`, `@{dates}`, **gras**; the rest as written. */
function CardText({ text, bridge }: { text: string; bridge: VaultBridge }): ReactNode {
  const parts = text.split(/(\[\[[^\]]+\]\]|@\{\d{4}-\d{2}-\d{2}\}|\*\*[^*]+\*\*|(?:^|(?<=\s))#[\p{L}\p{N}_/-]+)/u);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;
    if (part.startsWith("[[")) {
      const [target, alias] = part.slice(2, -2).split("|");
      const path = resolveLink(target, bridge.files, bridge.notePath);
      return (
        <span key={i} className={path ? "kanban-link" : "kanban-link unresolved"} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => path && bridge.openPath(path, e.metaKey || e.ctrlKey)}>
          {alias ?? target.split("#")[0]}
        </span>
      );
    }
    if (part.startsWith("@{")) {
      const iso = part.slice(2, -1);
      return (
        <span key={i} className="kanban-date">
          📅 {iso.slice(8, 10)}/{iso.slice(5, 7)}/{iso.slice(0, 4)}
        </span>
      );
    }
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return (
      <span key={i} className="kanban-tag">
        {part}
      </span>
    );
  });
}

/** A card's text being typed: ↵ validates, ⇧↵ goes to the line, esc cancels. */
function CardInput({ initial, placeholder, onDone }: { initial: string; placeholder: string; onDone: (text: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (text: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(text);
  };
  return (
    <textarea
      className="kanban-input"
      autoFocus
      rows={Math.max(2, value.split("\n").length)}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          finish(null);
        } else if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          finish(value);
        }
      }}
    />
  );
}

/**
 * A board of the Kanban plugin (kanban/format.ts): a column per list, cards
 * dragged between and within lists (pointer events: WebKit refuses HTML drag
 * and drop on some elements), checked, written or edited in place
 * (double-click). Lists are renamed by a double-click on their title, added at
 * the end, removed when empty.
 */
export function KanbanPage({ source, onChange, bridge, editable }: { source: string; onChange: (text: string) => void; bridge: VaultBridge; editable: boolean }) {
  const [board, setBoard] = useState<KanbanBoard>(() => parseKanban(source));
  const [drag, setDrag] = useState<Drag | null>(null);
  const [target, setTarget] = useState<{ lane: number; index: number } | null>(null);
  const [editing, setEditing] = useState<{ lane: number; card: number | "new" } | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const pressed = useRef<{ lane: number; card: number; x: number; y: number; rect: DOMRect } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const change = (next: KanbanBoard) => {
    setBoard(next);
    onChange(serializeKanban(next));
  };

  /** List and position under the pointer, from the cards' positions on screen. */
  const targetAt = (x: number, y: number) => {
    const columns = [...(boardRef.current?.querySelectorAll<HTMLElement>(".board-column") ?? [])];
    const lane = columns.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top - 40 && y <= Math.max(r.bottom, window.innerHeight);
    });
    if (lane < 0) return null;
    const others = [...columns[lane].querySelectorAll<HTMLElement>(".board-card:not(.dragging)")];
    return { lane, index: others.filter((el) => y > el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2).length };
  };

  const onPointerDown = (event: React.PointerEvent, lane: number, card: number) => {
    if (event.button !== 0 || !editable || (event.target as HTMLElement).closest("button, input, textarea, .kanban-link")) return;
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    pressed.current = { lane, card, x: event.clientX, y: event.clientY, rect: event.currentTarget.getBoundingClientRect() };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const press = pressed.current;
    if (!press) return;
    if (!drag && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 5) return;
    setDrag({ lane: press.lane, card: press.card, x: event.clientX, y: event.clientY, dx: press.x - press.rect.left, dy: press.y - press.rect.top, width: press.rect.width });
    setTarget(targetAt(event.clientX, event.clientY));
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const press = pressed.current;
    pressed.current = null;
    if (!press || !drag) return;
    const to = targetAt(event.clientX, event.clientY);
    setDrag(null);
    setTarget(null);
    if (!to || (to.lane === press.lane && to.index === press.card)) return;
    change(moveCard(board, { lane: press.lane, card: press.card }, to));
  };
  const cancel = () => {
    pressed.current = null;
    setDrag(null);
    setTarget(null);
  };

  const edited = (lane: number, index: number | "new", text: string | null) => {
    setEditing(null);
    if (text === null) return;
    if (index === "new") {
      if (text.trim()) change(addCard(board, lane, text));
      return;
    }
    const card = board.lanes[lane].cards[index];
    if (text.trim() !== cardText(card)) change(setCard(board, lane, index, text.trim() ? makeCard(text, cardDone(card)) : null));
  };

  const cardBody = (card: KanbanCard, lane: number, index: number) => (
    <span className="kanban-card-row">
      <input type="checkbox" checked={cardDone(card)} disabled={!editable} onChange={() => change(setCard(board, lane, index, makeCard(cardText(card), !cardDone(card))))} aria-label="Fait" />
      <span className={cardDone(card) ? "board-card-title kanban-card-text done" : "board-card-title kanban-card-text"}>
        <CardText text={cardText(card)} bridge={bridge} />
      </span>
      {editable && (
        <button type="button" className="kanban-card-remove" title="Supprimer la carte" onClick={() => change(setCard(board, lane, index, null))}>
          <Icon name="close" size={11} />
        </button>
      )}
    </span>
  );

  return (
    <div className="kanban-page">
      <div ref={boardRef} className={drag ? "board dragging" : "board"}>
        {board.lanes.map((lane, l) => {
          const shown = lane.cards.filter((_, i) => !(drag?.lane === l && drag.card === i));
          return (
            <section key={l} className={`board-column${target?.lane === l ? " drop" : ""}`}>
              <header className="board-column-header">
                <span className={`board-dot${lane.complete ? " closed" : l === 0 ? " open" : ""}`} />
                {renaming === l ? (
                  <input
                    className="kanban-lane-input"
                    autoFocus
                    defaultValue={lane.title}
                    onBlur={(e) => {
                      setRenaming(null);
                      const title = e.target.value.trim();
                      if (title && title !== lane.title) change(renameLane(board, l, title));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <strong onDoubleClick={() => editable && setRenaming(l)} title={editable ? "Double-cliquer pour renommer" : undefined}>
                    {lane.title}
                  </strong>
                )}
                <span className="board-count">{lane.cards.length}</span>
                {editable && lane.cards.length === 0 && (
                  <button type="button" className="kanban-lane-remove" title="Supprimer la liste vide" onClick={() => change(removeLane(board, l))}>
                    <Icon name="close" size={11} />
                  </button>
                )}
              </header>
              <div className="board-cards">
                {lane.cards.map((card, i) => {
                  const dragged = drag?.lane === l && drag.card === i;
                  const before = !dragged && target?.lane === l && shown.indexOf(card) === target.index;
                  return (
                    <div key={`${i}:${card.raw}`} className="board-slot">
                      {before && <div className="board-insert" />}
                      {editing?.lane === l && editing.card === i ? (
                        <CardInput initial={cardText(card)} placeholder="Texte de la carte" onDone={(text) => edited(l, i, text)} />
                      ) : (
                        <div
                          className={`board-card kanban-card${dragged ? " dragging" : ""}`}
                          onPointerDown={(e) => onPointerDown(e, l, i)}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          onPointerCancel={cancel}
                          onDoubleClick={() => editable && setEditing({ lane: l, card: i })}
                        >
                          {cardBody(card, l, i)}
                        </div>
                      )}
                    </div>
                  );
                })}
                {target?.lane === l && target.index >= shown.length && drag && <div className="board-insert" />}
                {editing?.lane === l && editing.card === "new" ? (
                  <CardInput initial="" placeholder="Texte de la carte, ↵ pour l'ajouter" onDone={(text) => edited(l, "new", text)} />
                ) : (
                  editable && (
                    <button type="button" className="board-new" onClick={() => setEditing({ lane: l, card: "new" })}>
                      <Icon name="plus" size={13} /> Ajouter une carte
                    </button>
                  )
                )}
              </div>
            </section>
          );
        })}
        {editable && (
          <button type="button" className="board-new kanban-add-lane" onClick={() => void bridge.askName("Nouvelle liste", "").then((title) => title?.trim() && change(addLane(board, title.trim())))}>
            <Icon name="plus" size={13} /> Ajouter une liste
          </button>
        )}
        {drag && (
          <div className="board-card kanban-card board-ghost" style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width }} aria-hidden>
            {cardBody(board.lanes[drag.lane].cards[drag.card], drag.lane, drag.card)}
          </div>
        )}
      </div>
    </div>
  );
}
