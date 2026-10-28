import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { reportError } from "./errors";
import { Icon } from "./Icon";
import { PAGE_KINDS, kindIconClass, type PageKind } from "./pageKinds";
import { readAllNotes, type Vault } from "./vault/vault";
import { parseReadingList, type ReadingItem } from "./reading/readingList";
import { openUrl } from "./reading/web";
import type { GitCommit, GitStatus } from "./vault/git";
import { isConflicted, isStaged, isUnstaged, isUntracked } from "./vault/git";
import { syncSummary } from "./vault/gitMessages";
import { basename, IMAGE_EXTENSIONS, extension, noteTitle } from "./vault/links";
import { readPages, unusedAttachments } from "./vault/attachments";
import { noteExcerpt, recentPages } from "./dashboard/recents";
import { usePersistentFlag } from "./hooks/usePersistentFlag";
import { isoDay } from "./dates";
import { bookmarkedFiles, computeStats, type VaultStats } from "./dashboard/stats";
import { agenda, dueLabel, type AgendaItem, type TasksPriority } from "./tasks/agenda";
import type { TaskConfig } from "./tasks/config";
import { isTaskMarkdown } from "./tasks/task";

/**
 * Home of an empty tab, made to pick up again: the last pages opened (with
 * the start of their text) and what is due, by day; aside, creation,
 * bookmarks, the reading list, Git and what needs tidying; the vault's
 * statistics and activity folded at the bottom.
 */

export type CreateKind = PageKind;

const folderOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

const relative = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
const PRIORITY_LABELS: Record<TasksPriority, string> = { highest: "maximale", high: "haute", medium: "moyenne", low: "basse", lowest: "minimale" };

function timeAgo(at: number, now = Date.now()): string {
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

interface AgendaGroup {
  label: string;
  /** "28 octobre" next to the day's name. */
  date?: string;
  tone?: "late" | "today";
  /** Each item says when it was due (late, later). */
  showDue?: boolean;
  items: AgendaItem[];
}

/** What is due, by day: late, today, each of the next six days, then later (the next two weeks). */
function agendaGroups(items: AgendaItem[], today = isoDay()): AgendaGroup[] {
  const groups: AgendaGroup[] = [];
  const at = (offset: number) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + offset);
    return isoDay(d);
  };
  const late = items.filter((i) => i.due < today);
  if (late.length) groups.push({ label: "En retard", tone: "late", showDue: true, items: late });
  for (let offset = 0; offset < 7; offset++) {
    const day = at(offset);
    const due = items.filter((i) => i.due === day);
    if (!due.length) continue;
    const date = new Date(`${day}T12:00:00`);
    const name = offset === 0 ? "Aujourd'hui" : offset === 1 ? "Demain" : date.toLocaleDateString("fr-FR", { weekday: "long" });
    groups.push({
      label: name.charAt(0).toUpperCase() + name.slice(1),
      date: date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }),
      tone: offset === 0 ? "today" : undefined,
      items: due,
    });
  }
  const later = items.filter((i) => i.due > at(6) && i.due <= at(20));
  if (later.length) groups.push({ label: "Plus tard", showDue: true, items: later });
  return groups;
}

export function Dashboard({
  vault,
  files,
  iconOf,
  onOpen,
  onCreate,
  onOpenGit,
  onOpenTasks,
  onOpenGraph,
  readingList,
  tasksConfig,
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
  onOpenTasks: (newTab: boolean) => void;
  onOpenGraph: (newTab: boolean) => void;
  /** The tasks' settings (TaskNotes). */
  tasksConfig: TaskConfig;
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
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [toRead, setToRead] = useState<ReadingItem[] | null>(null);
  /** Pages changed in the vault (by FlowNote, Obsidian, a pull…), newest first, from the files' times. */
  const [modified, setModified] = useState<{ path: string; at: number }[]>([]);
  /** The notes' text, for the excerpts of the pages to pick up again. */
  const [texts, setTexts] = useState<Map<string, string>>(() => new Map());
  const [vaultShown, setVaultShown] = usePersistentFlag("flownote:home-vault", false, ["shown", "hidden"]);
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
  const [open, setOpen] = useState<"broken" | "orphans" | "unused" | null>(null);
  /** Attachments that no page names any more. */
  const [unused, setUnused] = useState<string[] | null>(null);
  /** Tag whose pages are listed under the tags. */
  const [openTag, setOpenTag] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const git = vault.git;
    if (git) {
      git.status().then(
        (s) => !cancelled && setStatus(s),
        () => {},
      );
      git.lastCommit().then(
        (c) => !cancelled && setLastCommit(c),
        () => {},
      );
      git.activity(371).then(
        (a) => !cancelled && setActivity(a),
        () => !cancelled && setActivity([]),
      );
    }
    vault.bookmarks?.().then(
      (json) => !cancelled && setBookmarks(bookmarkedFiles(json)),
      () => {},
    );
    vault.stats?.().then(
      (times) => !cancelled && setModified(times.filter((t) => t.mtime > 0).sort((a, b) => b.mtime - a.mtime).slice(0, 12).map((t) => ({ path: t.path, at: t.mtime }))),
      () => {},
    );
    (async () => {
      const notes = await readAllNotes(vault, files);
      if (cancelled) return;
      setTexts(new Map(notes));
      setStats(computeStats(notes, files));
      setTodo(agenda(notes, tasksConfig));
      const pages = await readPages(vault, files, notes);
      if (!cancelled) setUnused(unusedAttachments(pages, files));
    })().catch(reportError);
    return () => {
      cancelled = true;
    };
    // The dashboard reloads its data when it is shown again (files change while it is hidden).
  }, [vault, files, tasksConfig]);

  const existing = useMemo(() => new Set(files), [files]);
  /** TaskNotes' files (tasks, their folder, its views) are not pages to pick up: they have their own view. */
  const taskViews = new Set(Object.values(tasksConfig.views));
  const isTaskFile = (path: string) => {
    const text = texts.get(path);
    return taskViews.has(path) || (tasksConfig.folder !== "" && path.startsWith(`${tasksConfig.folder}/`)) || (text !== undefined && isTaskMarkdown(text, tasksConfig));
  };
  const recents = recentPages(vault.name)
    .filter((p) => existing.has(p.path) && !isTaskFile(p.path))
    .slice(0, 8);
  const favorites = bookmarks.filter((p) => existing.has(p));
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Bonne nuit" : hour < 18 ? "Bonjour" : "Bonsoir";
  const changes = status ? status.files.filter((f) => isStaged(f) || isUnstaged(f) || isUntracked(f) || isConflicted(f)).length : 0;

  const resume = (recents.length > 0 ? recents.map((p) => ({ path: p.path, detail: timeAgo(p.at) })) : favorites.map((path) => ({ path, detail: "Favori" }))).filter((r) => !isTaskFile(r.path));
  const groups = todo ? agendaGroups(todo) : [];
  /** Changed lately, other than the three pages to pick up, that are already in sight. */
  const shownLarge = new Set(resume.slice(0, 3).map((r) => r.path));
  const changed = modified.filter((m) => existing.has(m.path) && !shownLarge.has(m.path) && !isTaskFile(m.path)).slice(0, 5);
  const health = stats
    ? [
        { key: "broken" as const, label: "Liens cassés", count: stats.brokenLinks.length },
        { key: "orphans" as const, label: "Pages orphelines", count: stats.orphans.length },
        { key: "unused" as const, label: "Pièces jointes inutilisées", count: unused?.length ?? 0 },
      ].filter((h) => h.count > 0)
    : [];

  return (
    <div className="dashboard home">
      <header className="home-header">
        <h1>{greeting}</h1>
        <p className="dash-muted">
          {vault.name} · {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </header>

      <div className="home-layout">
        <main className="home-main">
          <section className="home-section" aria-labelledby="home-resume">
            <h2 id="home-resume">Reprendre</h2>
            {resume.length === 0 ? (
              <p className="dash-muted">Les pages que vous ouvrez apparaîtront ici.</p>
            ) : (
              <>
                <div className="home-resume">
                  {resume.slice(0, 3).map(({ path, detail }) => (
                    <button key={path} className="home-resume-item" onClick={(e) => onOpen(path, e.metaKey || e.ctrlKey)} onAuxClick={(e) => e.button === 1 && onOpen(path, true)} title={path}>
                      <span className="home-resume-icon">{iconOf(path)}</span>
                      <span className="home-resume-text">
                        <span className="home-resume-title">
                          <strong>{noteTitle(path)}</strong>
                          <span className="dash-page-detail">{[folderOf(path), detail].filter(Boolean).join(" · ")}</span>
                        </span>
                        {texts.has(path) && <span className="home-resume-excerpt">{noteExcerpt(texts.get(path)!) || "Page vide"}</span>}
                      </span>
                    </button>
                  ))}
                </div>
                {resume.length > 3 && (
                  <div className="dash-list home-resume-more">
                    {resume.slice(3, 8).map(({ path, detail }) => (
                      <PageLink iconOf={iconOf} key={path} path={path} onOpen={onOpen} detail={detail} />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="home-section" aria-labelledby="home-todo">
            <h2 id="home-todo">
              À faire
              <button className="dash-card-action" onClick={(e) => onOpenTasks(e.metaKey || e.ctrlKey)}>
                Toutes les tâches
              </button>
            </h2>
            {todo === null ? (
              <p className="dash-muted">Recherche des échéances…</p>
            ) : groups.length === 0 ? (
              <p className="dash-muted">Rien de prévu cette semaine. Ajoutez une échéance à une tâche, ou « 📅 date » à une case à cocher.</p>
            ) : (
              groups.map((group) => (
                <div key={group.label} className="home-day">
                  <h3 className={group.tone ? `home-day-title ${group.tone}` : "home-day-title"}>
                    {group.label}
                    {group.date && <span>{group.date}</span>}
                  </h3>
                  <div className="dash-list">
                    {group.items.slice(0, 6).map((item, i) => (
                      <button key={`${item.path}-${item.line ?? "t"}-${i}`} className="dash-page dash-todo" onClick={(e) => onOpen(item.path, e.metaKey || e.ctrlKey)} title={item.path}>
                        <Icon name={item.kind === "task" ? "task" : "checkbox"} size={14} />
                        <span className="dash-page-title">{item.text || noteTitle(item.path)}</span>
                        {item.priority && <span className={`task-priority-dot tasks-${item.priority}`} title={`Priorité ${PRIORITY_LABELS[item.priority]}`} />}
                        <span className="dash-page-detail">{group.showDue ? dueLabel(item.due) : noteTitle(item.path) !== item.text ? noteTitle(item.path) : ""}</span>
                      </button>
                    ))}
                    {group.items.length > 6 && <p className="dash-muted">… et {group.items.length - 6} autres</p>}
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="home-section home-vault">
            <button className="home-fold" onClick={() => setVaultShown(!vaultShown)} aria-expanded={vaultShown}>
              <Icon name={vaultShown ? "chevronDown" : "chevronRight"} size={12} />
              Le vault
              {stats && (
                <span className="dash-page-detail">
                  {stats.notes} note{stats.notes > 1 ? "s" : ""} · {stats.tagCount} tag{stats.tagCount > 1 ? "s" : ""}
                </span>
              )}
            </button>
            {vaultShown && (
              <div className="home-vault-body">
                {vault.git && status?.isRepo && (activity === null ? <p className="dash-muted">Calcul…</p> : <Heatmap activity={activity} />)}
                {stats && (
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
                          <button
                            key={tag}
                            className={openTag === tag ? "dash-tag selected" : "dash-tag"}
                            aria-pressed={openTag === tag}
                            title={`${count} usage${count > 1 ? "s" : ""} : afficher les pages`}
                            onClick={() => setOpenTag(openTag === tag ? null : tag)}
                          >
                            #{tag} <small>{count}</small>
                          </button>
                        ))}
                      </div>
                    )}
                    {openTag && (
                      <div className="dash-list">
                        {(stats.tagPages[openTag] ?? []).map((p) => (
                          <PageLink iconOf={iconOf} key={p} path={p} onOpen={onOpen} />
                        ))}
                      </div>
                    )}
                  </>
                )}
                <button className="dash-inline" onClick={(e) => onOpenGraph(e.metaKey || e.ctrlKey)}>
                  Ouvrir le graphe des liens
                </button>
              </div>
            )}
          </section>
        </main>

        <aside className="home-side" aria-label="Raccourcis">
          <section className="dash-create" aria-label="Créer">
            {PAGE_KINDS.map((k) => (
              <button key={k.kind} onClick={() => onCreate(k.kind)} title={`${k.create} : ${k.description}`}>
                <span className={kindIconClass(k.kind)}>
                  <Icon name={k.icon} size={16} />
                </span>
                {k.label}
              </button>
            ))}
          </section>

          {changed.length > 0 && (
            <section className="home-side-section">
              <h2>Modifiées récemment</h2>
              <div className="dash-list">
                {changed.map((p) => (
                  <PageLink iconOf={iconOf} key={p.path} path={p.path} onOpen={onOpen} detail={timeAgo(p.at)} />
                ))}
              </div>
            </section>
          )}

          {favorites.length > 0 && recents.length > 0 && (
            <section className="home-side-section">
              <h2>Favoris</h2>
              <div className="dash-list">
                {favorites.map((p) => (
                  <PageLink iconOf={iconOf} key={p} path={p} onOpen={onOpen} detail="" />
                ))}
              </div>
            </section>
          )}

          <section className="home-side-section">
            <h2>
              Liens
              <button className="dash-card-action" onClick={(e) => onOpenReading(e.metaKey || e.ctrlKey)}>
                Tout voir
              </button>
            </h2>
            {toRead === null ? (
              <p className="dash-muted">Lecture de la liste…</p>
            ) : toRead.length === 0 ? (
              <p className="dash-muted">
                Rien en attente.{" "}
                <button className="dash-inline" onClick={onAddLink}>
                  Ajouter un lien
                </button>
              </p>
            ) : (
              <>
                <div className="dash-list">
                  {toRead.slice(0, 3).map((item) => (
                    <button key={item.line} className="dash-page" onClick={() => openUrl(item.url)} title={item.url}>
                      <Icon name="bookmark" size={14} />
                      <span className="dash-page-title">{item.title}</span>
                    </button>
                  ))}
                </div>
                {toRead.length > 3 && <p className="dash-muted">{toRead.length} liens à voir</p>}
              </>
            )}
          </section>

          {vault.git && status?.isRepo && (
            <section className="home-side-section">
              <h2>
                Git
                <button className="dash-card-action" onClick={onOpenGit}>
                  Ouvrir
                </button>
              </h2>
              <p className="home-git">
                <Icon name="branch" size={14} /> {status.branch ?? "HEAD détachée"}
                <span className={changes ? "pending" : undefined}>{changes === 0 ? "à jour" : `${changes} modifié${changes > 1 ? "s" : ""}`}</span>
              </p>
              {(status.ahead > 0 || status.behind > 0) && <p className="dash-muted">{syncSummary(status.upstream, status.ahead, status.behind)}</p>}
              {lastCommit && (
                <p className="dash-muted">
                  « {lastCommit.subject} » · {timeAgo(Date.parse(lastCommit.date))}
                </p>
              )}
            </section>
          )}

          {health.length > 0 && (
            <section className="home-side-section">
              <h2>À ranger</h2>
              <div className="dash-health">
                {health.map((h) => (
                  <Fragment key={h.key}>
                    <button className={h.key === "broken" ? "dash-health-row warn" : "dash-health-row"} onClick={() => setOpen(open === h.key ? null : h.key)} aria-expanded={open === h.key}>
                      <span>{h.label}</span>
                      <strong>{h.count}</strong>
                    </button>
                    {open === "broken" && h.key === "broken" && stats && (
                      <div className="dash-list">
                        {stats.brokenLinks.slice(0, 30).map((l, i) => (
                          <PageLink iconOf={iconOf} key={`${l.from}-${i}`} path={l.from} onOpen={onOpen} detail={`→ ${l.target}`} />
                        ))}
                      </div>
                    )}
                    {open === "orphans" && h.key === "orphans" && stats && (
                      <div className="dash-list">
                        {stats.orphans.slice(0, 30).map((p) => (
                          <PageLink iconOf={iconOf} key={p} path={p} onOpen={onOpen} />
                        ))}
                      </div>
                    )}
                    {open === "unused" && h.key === "unused" && unused && (
                      <div className="dash-list">
                        {unused.slice(0, 30).map((p) => (
                          <button key={p} className="dash-page" onClick={() => void vault.reveal?.(p)} disabled={!vault.reveal} title={vault.reveal ? `Afficher dans le Finder : ${p}` : p}>
                            <Icon name={IMAGE_EXTENSIONS.has(extension(p)) ? "image" : "doc"} size={14} />
                            <span className="dash-page-title">{basename(p)}</span>
                            <span className="dash-page-detail">{folderOf(p)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
