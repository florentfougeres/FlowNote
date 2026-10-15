import { useEffect, useMemo, useState, type ReactNode } from "react";
import { keys } from "./keys";
import { Icon } from "./Icon";
import { PAGE_KINDS, kindIconClass, type PageKind } from "./pageKinds";
import { readAllNotes, type Vault } from "./vault/vault";
import { buildGraph, type VaultGraph } from "./graph/graph";
import { GraphView } from "./graph/GraphView";
import { parseReadingList, siteOf, type ReadingItem } from "./reading/readingList";
import { openUrl } from "./reading/web";
import type { GitCommit, GitStatus } from "./vault/git";
import { isConflicted, isStaged, isUnstaged, isUntracked } from "./vault/git";
import { syncSummary } from "./vault/gitMessages";
import { noteTitle } from "./vault/links";
import { recentPages } from "./dashboard/recents";
import { bookmarkedFiles, computeStats, type VaultStats } from "./dashboard/stats";
import { agenda, dueLabel, ticketsOf, urgency, type AgendaItem, type TicketInfo } from "./ticket/agenda";

/**
 * Home of an empty tab: recent pages, quick creation, Git state, a year of
 * commit activity, vault statistics and health, Obsidian bookmarks.
 */

export type CreateKind = PageKind;

const folderOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

const relative = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
export function timeAgo(at: number, now = Date.now()): string {
  const seconds = Math.round((at - now) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return "à l'instant";
}

function PageLink({ path, iconOf, onOpen, detail }: { path: string; iconOf: (path: string) => ReactNode; onOpen: (path: string, newTab: boolean) => void; detail?: string }) {
  return (
    <button className="dash-page" onClick={(e) => onOpen(path, e.metaKey || e.ctrlKey)} onAuxClick={(e) => e.button === 1 && onOpen(path, true)} title={path}>
      {iconOf(path)}
      <span className="dash-page-title">{noteTitle(path)}</span>
      <span className="dash-page-detail">{detail ?? folderOf(path)}</span>
    </button>
  );
}

/** A year of activity, a square per day (Monday first), darker with more commits. */
function Heatmap({ activity }: { activity: [string, number][] }) {
  const counts = new Map(activity);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 364 - ((today.getDay() + 6) % 7));
  const days: { date: string; count: number; label: string }[] = [];
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const count = counts.get(iso) ?? 0;
    days.push({ date: iso, count, label: `${count === 0 ? "Aucun" : count} commit${count > 1 ? "s" : ""} le ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` });
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const active = days.filter((d) => d.count > 0).length;
  return (
    <div className="heatmap-wrap">
      <div className="heatmap" role="img" aria-label={`${total} commits sur un an`}>
        {days.map((d) => (
          <span key={d.date} className={`heat l${level(d.count)}`} title={d.label} />
        ))}
      </div>
      <p className="dash-muted">
        {total} commit{total > 1 ? "s" : ""} sur un an · {active} jour{active > 1 ? "s" : ""} actif{active > 1 ? "s" : ""}
      </p>
    </div>
  );
}

export function Dashboard({
  vault,
  files,
  iconOf,
  onOpen,
  onCreate,
  onOpenGit,
  onSearch,
  onOpenTickets,
  onOpenGraph,
  readingList,
  readingVersion,
  onOpenReading,
  onAddLink,
}: {
  vault: Vault;
  files: string[];
  /** Icon of a page: its emoji, or the icon of its kind. */
  iconOf: (path: string) => ReactNode;
  onOpen: (path: string, newTab: boolean) => void;
  onCreate: (kind: CreateKind) => void;
  onOpenGit: () => void;
  onSearch: () => void;
  onOpenTickets: (newTab: boolean) => void;
  onOpenGraph: (newTab: boolean) => void;
  /** Path of the reading list note. */
  readingList: string;
  /** Bumped when a link was added. */
  readingVersion: number;
  onOpenReading: (newTab: boolean) => void;
  onAddLink: () => void;
}) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [lastCommit, setLastCommit] = useState<GitCommit | null>(null);
  const [activity, setActivity] = useState<[string, number][] | null>(null);
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [todo, setTodo] = useState<AgendaItem[] | null>(null);
  const [tickets, setTickets] = useState<TicketInfo[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [graph, setGraph] = useState<VaultGraph | null>(null);
  const [toRead, setToRead] = useState<ReadingItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void vault
      .read(readingList)
      .catch(() => "")
      .then((text) => !cancelled && setToRead(parseReadingList(text).flatMap((s) => s.items.filter((i) => !i.checked))));
    return () => {
      cancelled = true;
    };
  }, [vault, readingList, readingVersion, files]);
  const [open, setOpen] = useState<"broken" | "orphans" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const git = vault.git;
    if (git) {
      git.status().then((s) => !cancelled && setStatus(s), () => {});
      git.lastCommit().then((c) => !cancelled && setLastCommit(c), () => {});
      git.activity(371).then((a) => !cancelled && setActivity(a), () => !cancelled && setActivity([]));
    }
    vault.bookmarks?.().then((json) => !cancelled && setBookmarks(bookmarkedFiles(json)), () => {});
    (async () => {
      const notes = await readAllNotes(vault, files);
      if (cancelled) return;
      setGraph(buildGraph(notes, files));
      setStats(computeStats(notes, files));
      setTodo(agenda(notes));
      setTickets(ticketsOf(notes));
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
    // The dashboard reloads its data when it is shown again (files change while it is hidden).
  }, [vault, files]);

  const existing = useMemo(() => new Set(files), [files]);
  const recents = recentPages(vault.name).filter((p) => existing.has(p.path)).slice(0, 8);
  const favorites = bookmarks.filter((p) => existing.has(p));
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Bonne nuit" : hour < 18 ? "Bonjour" : "Bonsoir";
  const changes = status ? status.files.filter((f) => isStaged(f) || isUnstaged(f) || isUntracked(f) || isConflicted(f)).length : 0;

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div>
          <h1>{greeting}</h1>
          <p className="dash-muted">
            {vault.name} · {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <button className="dash-search" onClick={onSearch}>
          <Icon name="search" size={14} /> Rechercher une page <kbd>{keys("⌘P")}</kbd>
        </button>
      </header>

      <section className="dash-create" aria-label="Créer">
        {PAGE_KINDS.map((k) => (
          <button key={k.kind} onClick={() => onCreate(k.kind)}>
            <span className={kindIconClass(k.kind)}>
              <Icon name={k.icon} size={20} />
            </span>
            <span>
              <strong>{k.create}</strong>
              <small>{k.description}</small>
            </span>
          </button>
        ))}
        {/* « Nouveau notebook » arrivera avec la fusion de la branche feature/notebooks. */}
      </section>

      <div className="dash-grid">
        <section className="dash-card">
          <h2>Récents</h2>
          {recents.length === 0 ? (
            <p className="dash-muted">Les pages que vous ouvrez apparaîtront ici.</p>
          ) : (
            <div className="dash-list">
              {recents.map((p) => (
                <PageLink iconOf={iconOf} key={p.path} path={p.path} onOpen={onOpen} detail={timeAgo(p.at)} />
              ))}
            </div>
          )}
        </section>

        <section className="dash-card">
          <h2>À faire</h2>
          {todo === null ? (
            <p className="dash-muted">Recherche des échéances…</p>
          ) : todo.length === 0 ? (
            <p className="dash-muted">Aucune échéance. Ajoutez « 📅 date » à une tâche ou une échéance à un ticket.</p>
          ) : (
            <div className="dash-list">
              {todo.slice(0, 8).map((item, i) => (
                <button key={`${item.path}-${item.line ?? "t"}-${i}`} className="dash-page dash-todo" onClick={(e) => onOpen(item.path, e.metaKey || e.ctrlKey)} title={item.path}>
                  <Icon name={item.kind === "ticket" ? "ticket" : "checkbox"} size={14} />
                  <span className="dash-page-title">{item.text || noteTitle(item.path)}</span>
                  <span className={`due-chip ${urgency(item.due)}`}>{dueLabel(item.due)}</span>
                </button>
              ))}
              {todo.length > 8 && <p className="dash-muted">… et {todo.length - 8} autres</p>}
            </div>
          )}
        </section>

        <section className="dash-card">
          <h2>
            Tickets
            <button className="dash-card-action" onClick={(e) => onOpenTickets(e.metaKey || e.ctrlKey)}>
              Tout voir
            </button>
          </h2>
          {(() => {
            const open = tickets.filter((t) => t.status === "open");
            if (tickets.length === 0) return <p className="dash-muted">Aucun ticket. Créez-en un avec « Nouveau ticket ».</p>;
            return (
              <>
                <p className="dash-muted">
                  {open.length} ouvert{open.length > 1 ? "s" : ""} · {tickets.length - open.length} fermé{tickets.length - open.length > 1 ? "s" : ""}
                </p>
                <div className="dash-list">
                  {open
                    .sort((a, b) => (b.created ?? "").localeCompare(a.created ?? ""))
                    .slice(0, 5)
                    .map((t) => (
                      <PageLink iconOf={iconOf} key={t.path} path={t.path} onOpen={onOpen} detail={t.id !== null ? `#${t.id}` : ""} />
                    ))}
                </div>
              </>
            );
          })()}
        </section>

        <section className="dash-card">
          <h2>
            À lire
            <button className="dash-card-action" onClick={(e) => onOpenReading(e.metaKey || e.ctrlKey)}>
              Tout voir
            </button>
          </h2>
          {toRead === null ? (
            <p className="dash-muted">Lecture de la liste…</p>
          ) : toRead.length === 0 ? (
            <p className="dash-muted">
              Rien en attente. <button className="dash-inline" onClick={onAddLink}>Ajouter un lien</button> (⌘⇧L)
            </p>
          ) : (
            <>
              <p className="dash-muted dash-reading-count">
                {toRead.length} lien{toRead.length > 1 ? "s" : ""} à lire
                <button className="dash-inline" onClick={() => openUrl(toRead[Math.floor(Math.random() * toRead.length)].url)}>
                  Au hasard
                </button>
              </p>
              <div className="dash-list">
                {toRead.slice(0, 5).map((item) => (
                  <button key={item.line} className="dash-page" onClick={() => openUrl(item.url)} title={item.url}>
                    <Icon name="bookmark" size={14} />
                    <span className="dash-page-title">{item.title}</span>
                    <span className="dash-page-detail">{siteOf(item.url)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        {vault.git && (
          <section className="dash-card">
            <h2>
              Git
              <button className="dash-card-action" onClick={onOpenGit}>
                Ouvrir
              </button>
            </h2>
            {!status ? (
              <p className="dash-muted">Lecture du dépôt…</p>
            ) : !status.isRepo ? (
              <p className="dash-muted">Ce vault n'est pas un dépôt Git.</p>
            ) : (
              <div className="dash-git">
                <p className="dash-git-branch">
                  <Icon name="branch" size={14} /> {status.branch ?? "HEAD détachée"}
                </p>
                <p className={status.ahead || status.behind ? "dash-git-sync pending" : "dash-git-sync"}>{syncSummary(status.upstream, status.ahead, status.behind)}</p>
                <p className={changes ? "dash-git-changes pending" : "dash-git-changes"}>
                  {changes === 0 ? "Aucune modification en attente" : `${changes} fichier${changes > 1 ? "s" : ""} modifié${changes > 1 ? "s" : ""}, à commiter`}
                </p>
                {lastCommit && (
                  <p className="dash-muted dash-git-last">
                    Dernier commit : « {lastCommit.subject} » · {timeAgo(Date.parse(lastCommit.date))}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        <section className="dash-card dash-wide">
          <h2>
            Graphe
            <button className="dash-card-action" onClick={(e) => onOpenGraph(e.metaKey || e.ctrlKey)}>
              Agrandir
            </button>
          </h2>
          {!graph ? <p className="dash-muted">Analyse des liens…</p> : <GraphView graph={graph} onOpen={onOpen} compact />}
        </section>

        {vault.git && status?.isRepo && (
          <section className="dash-card dash-wide">
            <h2>Activité</h2>
            {activity === null ? <p className="dash-muted">Calcul…</p> : <Heatmap activity={activity} />}
          </section>
        )}

        <section className="dash-card">
          <h2>Vault</h2>
          {!stats ? (
            <p className="dash-muted">Analyse des notes…</p>
          ) : (
            <>
              <div className="dash-counts">
                <span>
                  <strong>{stats.notes}</strong> note{stats.notes > 1 ? "s" : ""}
                </span>
                <span>
                  <strong>{stats.drawings}</strong> dessin{stats.drawings > 1 ? "s" : ""}
                </span>
                <span>
                  <strong>{stats.tagCount}</strong> tag{stats.tagCount > 1 ? "s" : ""}
                </span>
              </div>
              {stats.tags.length > 0 && (
                <div className="dash-tags">
                  {stats.tags.map(([tag, count]) => (
                    <span key={tag} className="dash-tag" title={`${count} usage${count > 1 ? "s" : ""}`}>
                      #{tag} <small>{count}</small>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section className="dash-card">
          <h2>Santé</h2>
          {!stats ? (
            <p className="dash-muted">Analyse des liens…</p>
          ) : (
            <div className="dash-health">
              <button className={stats.brokenLinks.length ? "dash-health-row warn" : "dash-health-row"} onClick={() => setOpen(open === "broken" ? null : "broken")} disabled={!stats.brokenLinks.length}>
                <span>Liens cassés</span>
                <strong>{stats.brokenLinks.length}</strong>
              </button>
              {open === "broken" && (
                <div className="dash-list">
                  {stats.brokenLinks.slice(0, 30).map((l, i) => (
                    <PageLink iconOf={iconOf} key={`${l.from}-${i}`} path={l.from} onOpen={onOpen} detail={`→ ${l.target}`} />
                  ))}
                </div>
              )}
              <button className="dash-health-row" onClick={() => setOpen(open === "orphans" ? null : "orphans")} disabled={!stats.orphans.length}>
                <span>Pages orphelines (aucun lien vers elles)</span>
                <strong>{stats.orphans.length}</strong>
              </button>
              {open === "orphans" && (
                <div className="dash-list">
                  {stats.orphans.slice(0, 30).map((p) => (
                    <PageLink iconOf={iconOf} key={p} path={p} onOpen={onOpen} />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {favorites.length > 0 && (
          <section className="dash-card">
            <h2>Favoris</h2>
            <div className="dash-list">
              {favorites.map((p) => (
                <PageLink iconOf={iconOf} key={p} path={p} onOpen={onOpen} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
