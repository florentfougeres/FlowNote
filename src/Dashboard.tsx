import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "./Icon";
import type { Vault } from "./vault/vault";
import type { GitCommit, GitStatus } from "./vault/git";
import { isConflicted, isStaged, isUnstaged, isUntracked } from "./vault/git";
import { syncSummary } from "./vault/gitMessages";
import { noteTitle } from "./vault/links";
import { isDrawingPath } from "./drawing/format";
import { recentPages } from "./dashboard/recents";
import { bookmarkedFiles, computeStats, type VaultStats } from "./dashboard/stats";

/**
 * Home of an empty tab: recent pages, quick creation, Git state, a year of
 * commit activity, vault statistics and health, Obsidian bookmarks.
 */

export type CreateKind = "note" | "drawing";

const pageIcon = (path: string): IconName => (isDrawingPath(path) ? "drawing" : "doc");
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

function PageLink({ path, onOpen, detail }: { path: string; onOpen: (path: string, newTab: boolean) => void; detail?: string }) {
  return (
    <button className="dash-page" onClick={(e) => onOpen(path, e.metaKey || e.ctrlKey)} onAuxClick={(e) => e.button === 1 && onOpen(path, true)} title={path}>
      <Icon name={pageIcon(path)} size={14} />
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
  onOpen,
  onCreate,
  onOpenGit,
  onSearch,
}: {
  vault: Vault;
  files: string[];
  onOpen: (path: string, newTab: boolean) => void;
  onCreate: (kind: CreateKind) => void;
  onOpenGit: () => void;
  onSearch: () => void;
}) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [lastCommit, setLastCommit] = useState<GitCommit | null>(null);
  const [activity, setActivity] = useState<[string, number][] | null>(null);
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
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
      const notes: [string, string][] = vault.readNotes
        ? await vault.readNotes()
        : await Promise.all(files.filter((f) => f.endsWith(".md")).map(async (f): Promise<[string, string]> => [f, await vault.read(f).catch(() => "")]));
      if (!cancelled) setStats(computeStats(notes, files));
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
          <Icon name="search" size={14} /> Rechercher une page <kbd>⌘P</kbd>
        </button>
      </header>

      <section className="dash-create" aria-label="Créer">
        <button onClick={() => onCreate("note")}>
          <span className="dash-create-icon">
            <Icon name="doc" size={20} />
          </span>
          <span>
            <strong>Nouvelle note</strong>
            <small>Texte, listes, tableaux, callouts</small>
          </span>
        </button>
        <button onClick={() => onCreate("drawing")}>
          <span className="dash-create-icon drawing">
            <Icon name="drawing" size={20} />
          </span>
          <span>
            <strong>Nouveau dessin</strong>
            <small>Schémas à main levée (Excalidraw)</small>
          </span>
        </button>
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
                <PageLink key={p.path} path={p.path} onOpen={onOpen} detail={timeAgo(p.at)} />
              ))}
            </div>
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
                    <PageLink key={`${l.from}-${i}`} path={l.from} onOpen={onOpen} detail={`→ ${l.target}`} />
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
                    <PageLink key={p} path={p} onOpen={onOpen} />
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
                <PageLink key={p} path={p} onOpen={onOpen} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
