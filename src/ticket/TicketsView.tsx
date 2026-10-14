import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { readAllNotes, type Vault } from "../vault/vault";
import { usePersistentFlag } from "../hooks/usePersistentFlag";
import { dueLabel, ticketsOf, urgency, type TicketInfo } from "./agenda";
import { applyChange, boardColumns, planMove, type TicketColumn } from "./board";
import { isoMinute } from "./format";
import { TicketBoard } from "./TicketBoard";

/**
 * Every ticket of the vault, as a list like GitHub's issues (open / closed,
 * sort) or as a kanban board; tags and search filter both.
 */
export function TicketsView({
  vault,
  files,
  columns,
  onOpen,
  onCreate,
  onChanged,
}: {
  vault: Vault;
  files: string[];
  columns: TicketColumn[];
  onOpen: (path: string, newTab: boolean) => void;
  onCreate: () => void;
  /** Tickets were rewritten (moved on the board). */
  onChanged: () => void;
}) {
  const [tickets, setTickets] = useState<TicketInfo[] | null>(null);
  const [board, setBoard] = usePersistentFlag("flownote:tickets-view", false, ["board", "list"]);
  const [error, setError] = useState("");
  const [state, setState] = useState<"open" | "closed">("open");
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"due" | "created" | "id">("due");

  const reload = useCallback(() => readAllNotes(vault, files).then((notes) => ticketsOf(notes)), [vault, files]);
  useEffect(() => {
    let cancelled = false;
    reload().then(
      (list) => !cancelled && setTickets(list),
      () => !cancelled && setTickets([]),
    );
    return () => {
      cancelled = true;
    };
  }, [reload]);

  /** A card dropped on the board: shown at once, then written to the tickets. */
  const move = async (ticket: TicketInfo, status: string, index: number) => {
    const all = tickets ?? [];
    const c = columns.findIndex((col) => col.status === status);
    // `index` counts the cards shown (filters may hide some): place the ticket
    // after the shown card it was dropped under, among all the column's cards.
    const full = boardColumns(all, columns)[c].filter((t) => t.path !== ticket.path);
    const visible = boardColumns(matching, columns)[c].filter((t) => t.path !== ticket.path);
    const anchor = visible[index - 1];
    const at = anchor ? full.indexOf(anchor) + 1 : visible.length > 0 ? full.indexOf(visible[0]) : full.length;
    const changes = planMove(ticket, status, full, at);
    const now = isoMinute();
    setTickets(
      all.map((t) => {
        const change = changes.find((c) => c.path === t.path);
        if (!change) return t;
        const next = change.status ?? t.column;
        return { ...t, order: change.order, column: next, status: next === "closed" ? "closed" : "open", closed: next === "closed" ? (t.status === "closed" ? t.closed : now) : null };
      }),
    );
    setError("");
    try {
      for (const change of changes) {
        const text = await vault.read(change.path);
        await vault.write(change.path, applyChange(text, change), text);
      }
    } catch (e) {
      setError(`Impossible de déplacer le ticket : ${String(e)}`);
      setTickets(await reload().catch(() => all));
    }
    onChanged();
  };

  const tags = useMemo(() => [...new Set((tickets ?? []).flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b, "fr")), [tickets]);
  const open = (tickets ?? []).filter((t) => t.status === "open").length;
  const closed = (tickets ?? []).length - open;
  const q = query.trim().toLowerCase();
  const matching = (tickets ?? []).filter((t) => !tag || t.tags.includes(tag)).filter((t) => !q || t.title.toLowerCase().includes(q) || String(t.id ?? "").includes(q));
  const shown = (tickets ?? [])
    .filter((t) => t.status === state)
    .filter((t) => !tag || t.tags.includes(tag))
    .filter((t) => !q || t.title.toLowerCase().includes(q) || String(t.id ?? "").includes(q))
    .sort((a, b) => {
      if (sort === "id") return (b.id ?? 0) - (a.id ?? 0);
      if (sort === "created") return (b.created ?? "").localeCompare(a.created ?? "");
      // Due date first (soonest), then the others by number.
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due || b.due) return a.due ? -1 : 1;
      return (b.id ?? 0) - (a.id ?? 0);
    });

  return (
    <div className={board ? "tickets-view board-mode" : "tickets-view"}>
      <header className="tickets-header">
        <h1>Tickets</h1>
        <div className="segmented" role="radiogroup" aria-label="Affichage">
          <button role="radio" aria-checked={!board} className={board ? "" : "selected"} onClick={() => setBoard(false)}>
            <Icon name="list" size={13} /> Liste
          </button>
          <button role="radio" aria-checked={board} className={board ? "selected" : ""} onClick={() => setBoard(true)}>
            <Icon name="board" size={13} /> Tableau
          </button>
        </div>
        <button className="primary" onClick={onCreate}>
          <Icon name="plus" size={13} /> Nouveau ticket
        </button>
      </header>
      <div className="tickets-toolbar">
        {!board && (
        <div className="segmented" role="radiogroup" aria-label="État">
          <button role="radio" aria-checked={state === "open"} className={state === "open" ? "selected" : ""} onClick={() => setState("open")}>
            <Icon name="ticket" size={13} /> {open} ouvert{open > 1 ? "s" : ""}
          </button>
          <button role="radio" aria-checked={state === "closed"} className={state === "closed" ? "selected" : ""} onClick={() => setState("closed")}>
            <Icon name="ticketClosed" size={13} /> {closed} fermé{closed > 1 ? "s" : ""}
          </button>
        </div>
        )}
        <label className="tickets-search">
          <Icon name="search" size={14} />
          <input placeholder="Rechercher un ticket" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQuery("")} />
          {query && (
            <button aria-label="Effacer" onClick={() => setQuery("")}>
              ×
            </button>
          )}
        </label>
        {!board && (
        <div className="segmented" role="radiogroup" aria-label="Trier par">
          {(
            [
              ["due", "Échéance"],
              ["created", "Récents"],
              ["id", "Numéro"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} role="radio" aria-checked={sort === value} className={sort === value ? "selected" : ""} onClick={() => setSort(value)}>
              {label}
            </button>
          ))}
        </div>
        )}
      </div>
      {tags.length > 0 && (
        <div className="tickets-tags">
          {tags.map((t) => (
            <button key={t} className={tag === t ? "ticket-tag selected" : "ticket-tag"} onClick={() => setTag(tag === t ? null : t)}>
              #{t}
            </button>
          ))}
        </div>
      )}
      {error && <p className="status warning">{error}</p>}
      {board && tickets !== null ? (
        <TicketBoard tickets={matching} columns={columns} onOpen={onOpen} onMove={(t, status, index) => void move(t, status, index)} onCreate={onCreate} />
      ) : (
      <div className="tickets-list">
        {tickets === null ? (
          <p className="dash-muted">Lecture des tickets…</p>
        ) : shown.length === 0 ? (
          <div className="tickets-empty">
            <Icon name="ticket" size={22} />
            <p>{(tickets ?? []).length === 0 ? "Aucun ticket pour l'instant." : "Aucun ticket ne correspond."}</p>
          </div>
        ) : (
          shown.map((t) => {
            const level = t.due && t.status === "open" ? urgency(t.due.slice(0, 10)) : null;
            return (
              <button key={t.path} className="ticket-row" onClick={(e) => onOpen(t.path, e.metaKey || e.ctrlKey)} onAuxClick={(e) => e.button === 1 && onOpen(t.path, true)}>
                <span className={`ticket-row-state ${t.status}`}>
                  <Icon name={t.status === "open" ? "ticket" : "ticketClosed"} size={15} />
                </span>
                <span className="ticket-row-main">
                  <span className="ticket-row-title">
                    {t.title}
                    {t.tags.map((x) => (
                      <span key={x} className="ticket-tag small">
                        #{x}
                      </span>
                    ))}
                  </span>
                  <span className="ticket-row-sub">
                    {t.id !== null ? `#${t.id} · ` : ""}
                    {t.status === "closed" && t.closed ? `fermé le ${new Date(t.closed).toLocaleDateString("fr-FR")}` : t.created ? `ouvert le ${new Date(t.created).toLocaleDateString("fr-FR")}` : ""}
                  </span>
                </span>
                {t.due && <span className={`due-chip${level ? ` ${level}` : ""}`}>📅 {level ? dueLabel(t.due.slice(0, 10)) : t.due.slice(0, 10)}</span>}
                {t.tasks.total > 0 && (
                  <span className="ticket-row-count" title="Tâches">
                    ☑ {t.tasks.done}/{t.tasks.total}
                  </span>
                )}
                {t.comments > 0 && (
                  <span className="ticket-row-count" title="Commentaires">
                    <Icon name="comment" size={12} /> {t.comments}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
      )}
    </div>
  );
}
