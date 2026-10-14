import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import type { Vault } from "../vault/vault";
import { dueLabel, ticketsOf, urgency, type TicketInfo } from "./agenda";

/** Every ticket of the vault, like GitHub's issue list: open / closed, tags, search, sort. */
export function TicketsView({ vault, files, onOpen, onCreate }: { vault: Vault; files: string[]; onOpen: (path: string, newTab: boolean) => void; onCreate: () => void }) {
  const [tickets, setTickets] = useState<TicketInfo[] | null>(null);
  const [state, setState] = useState<"open" | "closed">("open");
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"due" | "created" | "id">("due");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const notes: [string, string][] = vault.readNotes
        ? await vault.readNotes()
        : await Promise.all(files.filter((f) => f.endsWith(".md")).map(async (f): Promise<[string, string]> => [f, await vault.read(f).catch(() => "")]));
      if (!cancelled) setTickets(ticketsOf(notes));
    })().catch(() => !cancelled && setTickets([]));
    return () => {
      cancelled = true;
    };
  }, [vault, files]);

  const tags = useMemo(() => [...new Set((tickets ?? []).flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b, "fr")), [tickets]);
  const open = (tickets ?? []).filter((t) => t.status === "open").length;
  const closed = (tickets ?? []).length - open;
  const q = query.trim().toLowerCase();
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
    <div className="tickets-view">
      <header className="tickets-header">
        <h1>Tickets</h1>
        <button className="primary" onClick={onCreate}>
          <Icon name="plus" size={13} /> Nouveau ticket
        </button>
      </header>
      <div className="tickets-toolbar">
        <div className="segmented" role="radiogroup" aria-label="État">
          <button role="radio" aria-checked={state === "open"} className={state === "open" ? "selected" : ""} onClick={() => setState("open")}>
            <Icon name="ticket" size={13} /> {open} ouvert{open > 1 ? "s" : ""}
          </button>
          <button role="radio" aria-checked={state === "closed"} className={state === "closed" ? "selected" : ""} onClick={() => setState("closed")}>
            <Icon name="ticketClosed" size={13} /> {closed} fermé{closed > 1 ? "s" : ""}
          </button>
        </div>
        <label className="tickets-search">
          <Icon name="search" size={14} />
          <input placeholder="Rechercher un ticket" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQuery("")} />
          {query && (
            <button aria-label="Effacer" onClick={() => setQuery("")}>
              ×
            </button>
          )}
        </label>
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
    </div>
  );
}
