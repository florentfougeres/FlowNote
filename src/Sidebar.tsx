import { folderMenu as folderMenuItems, pageMenu as pageMenuItems, rootMenu } from "./menus";
import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { VaultEntry } from "./vault/vault";
import { Icon, type IconName } from "./Icon";
import { isDrawingPath } from "./drawing/format";
import { isMindmapPath } from "./mindmap/format";
import { isBasePath } from "./base/baseFile";
import { isCanvasPath } from "./canvas/format";
import { isDashboardPath } from "./dashboardPage/format";
import { dirname, noteTitle } from "./vault/links";
import { keys } from "./keys";
import type { TagNode } from "./dashboard/stats";
import { usePersistentFlag } from "./hooks/usePersistentFlag";
import { PAGE_SORTS, sortPages, type FileTimes, type PageSort } from "./pageSort";
import { useClickOutside } from "./hooks/useClickOutside";

/**
 * Sidebar, made for the pages: the vault (with its menu) and a "new page"
 * button at the top, one search field, the views in a row of icons, the
 * favorites and the page tree (all the height left), then Git, settings and
 * help as a row of icons at the bottom.
 *
 * Page tree: a note and the folder of the same name next to it ("Projet.md" +
 * "Projet/") are shown as one page whose children are the folder's content,
 * as nested pages.
 */

interface Page {
  key: string;
  name: string;
  /** Note opened by clicking the row; null for a plain folder. */
  notePath: string | null;
  children: Page[];
  task?: boolean;
  presentation?: boolean;
  icon?: string;
  /** The page's own title (vault.ts), shown in place of its name with `showTitles`. */
  title?: string;
  /** A row of the base next to its folder (`X.base` + `X/`). */
  row?: boolean;
}

function toPages(entries: VaultEntry[], tasks: Set<string>, rows = false): Page[] {
  const dirs = new Map(entries.filter((e) => e.kind === "dir").map((e) => [e.name, e]));
  const usedDirs = new Set<string>();
  const pages: Page[] = [];
  for (const entry of entries) {
    if (entry.kind !== "file") continue;
    // The folder of the same name holds the page's sub-pages; empty, it stays a folder of its own, or a new one would seem not created.
    const same = dirs.get(entry.name);
    const folder = same && ((same.children ?? []).length > 0 || isBasePath(entry.path)) ? same : undefined;
    if (folder) usedDirs.add(folder.name);
    const children = folder ? toPages(folder.children ?? [], tasks, isBasePath(entry.path)) : [];
    pages.push({ key: entry.path, name: entry.name, notePath: entry.path, children, task: tasks.has(entry.path), presentation: entry.presentation, icon: entry.icon, title: entry.title, row: rows && entry.path.endsWith(".md") });
  }
  const folders = entries
    .filter((e) => e.kind === "dir" && !usedDirs.has(e.name))
    .map((e) => ({ key: e.path, name: e.name, notePath: null, children: toPages(e.children ?? [], tasks) }));
  return [...folders, ...pages];
}

/** The tree without the entries the app shows elsewhere (the reading list). */
function withoutPaths(entries: VaultEntry[], hidden: Set<string>): VaultEntry[] {
  return entries.filter((e) => !hidden.has(e.path)).map((e) => (e.kind === "dir" && e.children ? { ...e, children: withoutPaths(e.children, hidden) } : e));
}

function containsPath(page: Page, path: string): boolean {
  return page.notePath === path || page.children.some((child) => containsPath(child, path));
}

/** Emoji of the page, or the icon of its kind (folder when `path` is null). */
export function PageIcon({ path, icon, task, presentation, row, size = 14 }: { path: string | null; icon?: string | null; task?: boolean; presentation?: boolean; row?: boolean; size?: number }) {
  if (icon) {
    return (
      <span className="page-emoji" style={{ fontSize: size, width: size + 2 }}>
        {icon}
      </span>
    );
  }
  const name: IconName = path === null ? "folder" : isDrawingPath(path) ? "drawing" : isMindmapPath(path) ? "mindmap" : isCanvasPath(path) ? "canvas" : isDashboardPath(path) ? "blocks" : isBasePath(path) ? "database" : task ? "task" : presentation ? "slides" : row ? "baseRow" : "doc";
  return <Icon name={name} size={size} />;
}

export interface MenuItem {
  label: string;
  icon: IconName;
  danger?: boolean;
  /** The current choice among the items, or an option that is on, marked on the right. */
  checked?: boolean;
  /** Its keyboard shortcut, shown on the right ("⌘⇧M"). */
  shortcut?: string;
  /** A group title ("Affichage"), shown above the first item of each group. */
  section?: string;
  run: () => void;
}

/**
 * A small menu under the button that opened it (or the pointer, for a right
 * click), above it when there is no room below, and ending at the button's
 * right edge when there is no room on the right; closes on Escape or a click
 * outside.
 */
export function PopoverMenu({ anchor, items, onClose }: { anchor: DOMRect; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose, { escape: true });
  const [place, setPlace] = useState({ top: anchor.bottom + 4, left: anchor.left });
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0;
    const width = ref.current?.offsetWidth ?? 0;
    setPlace({
      top: anchor.bottom + 4 + height > window.innerHeight - 8 ? Math.max(8, anchor.top - 4 - height) : anchor.bottom + 4,
      left: Math.max(8, anchor.left + width > window.innerWidth - 8 ? Math.min(anchor.right, window.innerWidth - 8) - width : anchor.left),
    });
  }, [anchor]);
  return (
    <div ref={ref} className="sidebar-menu" role="menu" style={place}>
      {items.map((item, i) => (
        <Fragment key={item.label}>
          {item.section && item.section !== items[i - 1]?.section && (
            <div className={i === 0 ? "menu-section first" : "menu-section"} role="presentation">
              {item.section}
            </div>
          )}
          <button
            role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={item.checked}
            className={item.danger ? "danger" : undefined}
            onClick={() => {
              onClose();
              item.run();
            }}
          >
            <Icon name={item.icon} size={14} />
            <span className="menu-label">{item.label}</span>
            {item.shortcut && <kbd>{keys(item.shortcut)}</kbd>}
            <span className="menu-check">{item.checked && <Icon name="check" size={14} />}</span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}

/** A view of the app as an icon in a row (views under the search, Git, settings and help at the bottom); its name in the tooltip. */
function IconTab({ icon, label, shortcut, active, badge, onClick, menu }: { icon: IconName; label: string; shortcut?: string; active?: boolean; badge?: number | null; onClick: (event: React.MouseEvent) => void; menu?: boolean }) {
  return (
    <button
      className={active ? "sidebar-icon active" : "sidebar-icon"}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      aria-haspopup={menu ? "menu" : undefined}
      title={shortcut ? `${label} (${keys(shortcut)})` : label}
    >
      <Icon name={icon} size={16} />
      {badge ? <span className="sidebar-badge">{badge > 99 ? "99+" : badge}</span> : null}
    </button>
  );
}

/** What is dragged in the tree: a page (its note) or a plain folder. */
interface DragItem {
  path: string;
  folder: boolean;
  label: string;
  icon: React.ReactNode;
}

/** Distance (px) the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 4;
/** A collapsed folder hovered this long (ms) during a drag opens. */
const OPEN_DELAY = 600;

interface Props {
  vaultName: string;
  tree: VaultEntry[];
  selected?: string;
  /** What the active tab shows when it is not a page. */
  view: "home" | "tasks" | "graph" | "reading" | "settings" | "docs" | null;
  /** The notes that are tasks (TaskNotes), shown with their icon. */
  taskPaths: Set<string>;
  /** Paths left out of the tree: the reading list has its own view. */
  hidden: string[];
  /** Live icon of the open page (its front matter may not be saved yet). */
  liveIcon?: { path: string; icon: string | null; title: string | null };
  /** Pages named by their title (else by their file name), and the button switching it. */
  showTitles: boolean;
  onToggleTitles: () => void;
  /** Order of the tree, the times of the files it sorts by, and the menu changing it. */
  pageSort: PageSort;
  fileTimes: FileTimes;
  onPageSort: (sort: PageSort) => void;
  /** Number of changed files, or null when the vault has no Git repository. */
  gitChanges: number | null;
  gitOpen: boolean;
  /** Opens a page; `newTab` with ⌘-click. */
  onSelect: (path: string, newTab: boolean) => void;
  /** Opens a page on the right of the split view (⌥-click). */
  onOpenRight: (path: string) => void;
  onNewPage: (parentNote: string | null) => void;
  onNewPageInFolder: (folder: string) => void;
  onDelete: (notePath: string) => void;
  /** New empty folder in `parent` ("" is the vault root). */
  onNewFolder: (parent: string) => void;
  onRenameFolder: (folder: string) => void;
  onDeleteFolder: (folder: string) => void;
  /** Obsidian's bookmarked files, shown above the tree. */
  favorites: string[];
  /** The vault's tags, nested (section "Tags"). */
  tags: TagNode[];
  /** Searches the notes carrying a tag (or one of its nested tags). */
  onTag: (tag: string) => void;
  /** A copy of the page next to it. */
  onDuplicate: (notePath: string) => void;
  /** Merges the note into another. */
  onMerge: (notePath: string) => void;
  /** Copies a `[[link]]` to the page. */
  onCopyLink: (notePath: string) => void;
  /** Shows a page or folder in the Finder; absent outside the desktop app. */
  onReveal?: (path: string) => void;
  /** Moves a page (with its sub-pages) or a folder into `target` ("" is the vault root). */
  onMove: (item: { path: string; folder: boolean }, target: string) => void;
  onRename: (notePath: string) => void;
  onSearch: () => void;
  onHome: (newTab: boolean) => void;
  onTasks: (newTab: boolean) => void;
  onGraph: (newTab: boolean) => void;
  onReading: (newTab: boolean) => void;
  onDocs: (newTab: boolean) => void;
  onGit: () => void;
  onSettings: (newTab: boolean) => void;
  onHelp: () => void;
  onChangeVault: () => void;
  /** Other vaults opened recently (desktop app), to switch in one click. */
  otherVaults: { root: string; name: string }[];
  onSwitchVault: (root: string) => void;
  /** Picks another vault folder; absent outside the desktop app. */
  onPickVault?: () => void;
}

/**
 * Memoized: the app passes stable handlers (useHandlers), so typing in a note
 * does not draw the tree again.
 */
export const Sidebar = memo(function Sidebar(props: Props) {
  const { vaultName, tree, selected, view, liveIcon, gitChanges, gitOpen } = props;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ anchor: DOMRect; items: MenuItem[] } | null>(null);
  const label = (page: Page) => (page.notePath ? (props.showTitles && page.title ? page.title : noteTitle(page.notePath)) : page.name);
  const sorted = (list: Page[]): Page[] =>
    sortPages(list.map((page) => ({ page, path: page.notePath, label: label(page) })), props.pageSort, props.fileTimes).map(({ page }) => ({ ...page, children: sorted(page.children) }));
  const pages = sorted(toPages(withoutPaths(tree, new Set(props.hidden)), props.taskPaths));
  /** What the tree knows of each note (icon, presentation), for the favorites. */
  const entries = new Map<string, VaultEntry>();
  const index = (list: VaultEntry[]) => list.forEach((e) => (e.kind === "file" ? entries.set(e.path, e) : index(e.children ?? [])));
  index(tree);
  /** The dragged item, the pointer, and where it would land (null: nowhere valid). */
  const [drag, setDrag] = useState<{ item: DragItem; x: number; y: number; target: string | null } | null>(null);
  /** A drag just ended: the click that follows the release must not open the page. */
  const dragged = useRef(false);
  const treeRef = useRef<HTMLDivElement>(null);

  // Reveal the selected page; not for a view of the app kept in a file (the tasks' views in TaskNotes/Views).
  useEffect(() => {
    if (!selected || view !== null) return;
    const open = new Set(expanded);
    const walk = (list: Page[]) =>
      list.forEach((page) => {
        if (page.children.some((child) => containsPath(child, selected))) {
          open.add(page.key);
          walk(page.children);
        }
      });
    walk(pages);
    if (open.size !== expanded.size) setExpanded(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, tree, view]);

  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  };

  const openMenu = (event: React.MouseEvent, items: MenuItem[]) => {
    event.stopPropagation();
    setMenu({ anchor: (event.currentTarget as HTMLElement).getBoundingClientRect(), items });
  };

  /** Right click on a row: the same menu as its "…" button, at the pointer. */
  const openContextMenu = (event: React.MouseEvent, items: MenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ anchor: new DOMRect(event.clientX, event.clientY - 4, 0, 0), items });
  };

  const pageMenu = (path: string): MenuItem[] => pageMenuItems(path, props);

  /** Where an item may be dropped: a plain folder other than its own (and not inside itself), or the root. */

  const dropTarget = (item: DragItem, target: string | null): string | null => {
    if (target === null || target === dirname(item.path)) return null;
    if (item.folder && (target === item.path || target.startsWith(`${item.path}/`))) return null;
    return target;
  };

  /** The folder under the pointer: a folder row, the tree's empty space or the "Pages" title (root), else null. */
  const folderAt = (x: number, y: number): string | null => {
    const element = document.elementFromPoint(x, y);
    const row = element?.closest<HTMLElement>(".page-row");
    if (row) return row.dataset.folder ?? null;
    return element?.closest(".sidebar-tree, .sidebar-section") ? "" : null;
  };

  /**
   * Drag with pointer events (WebKit refuses HTML5 drag on buttons): a press
   * becomes a drag past a few pixels; collapsed folders open when hovered;
   * the tree scrolls near its edges; Escape cancels.
   */
  const startDrag = (event: React.PointerEvent, item: DragItem) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
    const start = { x: event.clientX, y: event.clientY };
    let active = false;
    let hovered: string | null = null;
    let timer = 0;
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key, true);
      window.clearTimeout(timer);
      document.body.classList.remove("tree-dragging");
      setDrag(null);
    };
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
        active = true;
        window.getSelection()?.removeAllRanges();
        document.body.classList.add("tree-dragging");
      }
      const over = folderAt(ev.clientX, ev.clientY);
      if (over !== hovered) {
        hovered = over;
        window.clearTimeout(timer);
        if (over) timer = window.setTimeout(() => setExpanded((open) => new Set(open).add(over)), OPEN_DELAY);
      }
      const box = treeRef.current?.getBoundingClientRect();
      if (box && ev.clientX >= box.left && ev.clientX <= box.right) {
        if (ev.clientY < box.top + 24) treeRef.current!.scrollTop -= 8;
        else if (ev.clientY > box.bottom - 24) treeRef.current!.scrollTop += 8;
      }
      setDrag({ item, x: ev.clientX, y: ev.clientY, target: dropTarget(item, over) });
    };
    const up = (ev: PointerEvent) => {
      finish();
      if (!active) return;
      dragged.current = true;
      window.setTimeout(() => (dragged.current = false), 0);
      const target = dropTarget(item, folderAt(ev.clientX, ev.clientY));
      if (target !== null) props.onMove({ path: item.path, folder: item.folder }, target);
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || !active) return;
      ev.stopPropagation();
      active = false;
      finish();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key, true);
  };

  const folderMenu = (folder: string): MenuItem[] =>
    folderMenuItems(folder, {
      ...props,
      // The folder opens to show its new sub-folder.
      onNewFolder: (parent) => {
        setExpanded((open) => new Set(open).add(parent));
        props.onNewFolder(parent);
      },
    });

  const render = (list: Page[], depth: number) => (
    <ul className="tree">
      {list.map((page) => {
        const open = expanded.has(page.key);
        const live = page.notePath !== null && liveIcon?.path === page.notePath;
        const icon = live ? liveIcon!.icon : page.icon;
        const shownTitle = live ? liveIcon!.title : (page.title ?? null);
        return (
          <li key={page.key}>
            <div
              className={[
                "page-row",
                page.notePath === selected && view === null ? "selected" : "",
                drag?.item.path === (page.notePath ?? page.key) ? "dragging" : "",
                drag && !page.notePath && drag.target === page.key ? "drop-target" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ paddingLeft: depth * 14 + 4 }}
              data-folder={page.notePath ? undefined : page.key}
              onPointerDown={(event) =>
                startDrag(event, {
                  path: page.notePath ?? page.key,
                  folder: !page.notePath,
                  label: page.notePath ? noteTitle(page.notePath) : page.name,
                  icon: <PageIcon path={page.notePath} icon={icon} task={page.task} presentation={page.presentation} row={page.row} />,
                })
              }
              onContextMenu={(event) => openContextMenu(event, page.notePath ? pageMenu(page.notePath) : folderMenu(page.key))}
            >
              <button className="page-toggle" onClick={() => toggle(page.key)} aria-label={open ? "Replier" : "Déplier"} disabled={page.children.length === 0}>
                {page.children.length > 0 && <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />}
              </button>
              <button
                className="page-name"
                onClick={(event) => (page.notePath ? (event.altKey ? props.onOpenRight(page.notePath) : props.onSelect(page.notePath, event.metaKey || event.ctrlKey)) : toggle(page.key))}
                onAuxClick={(event) => event.button === 1 && page.notePath && props.onSelect(page.notePath, true)}
              >
                <span className="page-icon">
                  <PageIcon path={page.notePath} icon={icon} task={page.task} presentation={page.presentation} row={page.row} />
                </span>
                <span className="page-label" title={page.notePath ? (props.showTitles ? `Fichier : ${noteTitle(page.notePath)}` : (shownTitle ?? undefined)) : undefined}>
                  {page.notePath ? (props.showTitles && shownTitle ? shownTitle : noteTitle(page.notePath)) : page.name}
                </span>
              </button>
              <button
                className="page-add"
                title="Renommer, supprimer…"
                aria-label="Plus d'actions"
                onClick={(event) => openMenu(event, page.notePath ? pageMenu(page.notePath) : folderMenu(page.key))}
              >
                <Icon name="more" size={14} />
              </button>
              <button
                className="page-add"
                title={page.notePath ? "Ajouter une sous-page" : "Nouvelle page dans ce dossier"}
                aria-label={page.notePath ? "Ajouter une sous-page" : "Nouvelle page dans ce dossier"}
                onClick={() => (page.notePath ? props.onNewPage(page.notePath) : props.onNewPageInFolder(page.key))}
              >
                <Icon name="plus" size={14} />
              </button>
            </div>
            {open && page.children.length > 0 && render(page.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-resize" onPointerDown={startSidebarResize} aria-hidden="true" />
      <div className="sidebar-header">
        <button
          className="vault-switcher"
          aria-haspopup="menu"
          aria-label={`Vault ${vaultName}`}
          onClick={(event) =>
            openMenu(event, [
              ...props.otherVaults.map((other): MenuItem => ({ label: other.name, icon: "folder", run: () => props.onSwitchVault(other.root) })),
              ...(props.onPickVault ? [{ label: "Ouvrir un autre vault…", icon: "folderAdd" as IconName, run: props.onPickVault }] : []),
              { label: "Changer de vault…", icon: "open", run: props.onChangeVault },
              { label: "Réglages", icon: "sliders", run: () => props.onSettings(false) },
            ])
          }
        >
          <span className="vault-avatar">{vaultName.slice(0, 1).toUpperCase()}</span>
          <span className="vault-name">{vaultName}</span>
          <Icon name="chevronDown" size={12} />
        </button>
        <button className="sidebar-compose" onClick={() => props.onNewPage(null)} aria-label="Nouvelle page" title={keys("Nouvelle page (⌘N)")}>
          <Icon name="compose" size={16} />
        </button>
      </div>
      <button className="sidebar-search" onClick={props.onSearch}>
        <Icon name="search" size={14} />
        <span>Rechercher</span>
        <kbd>{keys("⌘P")}</kbd>
      </button>
      <nav className="sidebar-views" aria-label="Vues">
        <IconTab icon="home" label="Accueil" active={view === "home"} onClick={(event) => props.onHome(event.metaKey || event.ctrlKey)} />
        <IconTab icon="task" label="Tâches" active={view === "tasks"} onClick={(event) => props.onTasks(event.metaKey || event.ctrlKey)} />
        <IconTab icon="bookmark" label="Lectures" active={view === "reading"} onClick={(event) => props.onReading(event.metaKey || event.ctrlKey)} />
        <IconTab icon="graph" label="Graphe" active={view === "graph"} onClick={(event) => props.onGraph(event.metaKey || event.ctrlKey)} />
      </nav>
      {props.favorites.length > 0 && (
        <FavoritesSection>
          <ul className="tree sidebar-favorites">
            {props.favorites.map((path) => (
              <li key={path}>
                <div
                  className={path === selected && view === null ? "page-row selected" : "page-row"}
                  style={{ paddingLeft: 4 }}
                  onContextMenu={(event) => openContextMenu(event, pageMenu(path))}
                >
                  <span className="page-toggle" aria-hidden="true" />
                  <button className="page-name" onClick={(event) => (event.altKey ? props.onOpenRight(path) : props.onSelect(path, event.metaKey || event.ctrlKey))} onAuxClick={(event) => event.button === 1 && props.onSelect(path, true)}>
                    <span className="page-icon">
                      <PageIcon
                        path={path}
                        icon={path === liveIcon?.path ? liveIcon.icon : entries.get(path)?.icon}
                        task={props.taskPaths.has(path)}
                        presentation={entries.get(path)?.presentation}
                      />
                    </span>
                    <span className="page-label">
                      {props.showTitles ? ((path === liveIcon?.path ? liveIcon.title : entries.get(path)?.title) ?? noteTitle(path)) : noteTitle(path)}
                    </span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </FavoritesSection>
      )}
      <div className="sidebar-section">
        Pages
        <button
          className={props.showTitles ? "sidebar-section-add active" : "sidebar-section-add"}
          onClick={props.onToggleTitles}
          aria-pressed={props.showTitles}
          title={props.showTitles ? "Afficher les noms de fichier" : "Afficher les titres des pages"}
        >
          <Icon name="text" size={14} />
        </button>
        <button
          className="sidebar-section-add"
          onClick={(event) => openMenu(event, PAGE_SORTS.map(([sort, text]) => ({ label: text, icon: sort.startsWith("name") ? "text" : "clock", checked: sort === props.pageSort, run: () => props.onPageSort(sort) })))}
          aria-label="Trier les pages"
          title="Trier les pages"
        >
          <Icon name="sort" size={14} />
        </button>
        <button className="sidebar-section-add" onClick={() => props.onNewFolder("")} aria-label="Nouveau dossier" title="Nouveau dossier">
          <Icon name="folderAdd" size={14} />
        </button>
      </div>
      <div
        ref={treeRef}
        className={drag?.target === "" ? "sidebar-tree drop-root" : "sidebar-tree"}
        onClickCapture={(event) => {
          if (!dragged.current) return;
          event.stopPropagation();
          event.preventDefault();
        }}
        onContextMenu={(event) =>
          // Right click in the empty space of the tree: create at the vault root.
          openContextMenu(event, rootMenu(props))
        }
      >
        {render(pages, 0)}
      </div>
      {props.tags.length > 0 && <TagsSection tags={props.tags} onTag={props.onTag} />}
      <div className="sidebar-footer">
        {gitChanges !== null && <IconTab icon="branch" label="Git" shortcut="⌘⇧G" active={gitOpen} badge={gitChanges} onClick={props.onGit} />}
        <IconTab icon="sliders" label="Réglages" shortcut="⌘," active={view === "settings"} onClick={(event) => props.onSettings(event.metaKey || event.ctrlKey)} />
        <IconTab
          icon="question"
          label="Aide"
          menu
          active={view === "docs"}
          onClick={(event) =>
            openMenu(event, [
              { label: "Documentation", icon: "book", run: () => props.onDocs(event.metaKey || event.ctrlKey) },
              { label: "Raccourcis clavier", icon: "question", shortcut: "⌘/", run: props.onHelp },
            ])
          }
        />
      </div>
      {drag && (
        <div className={drag.target === null ? "tree-drag-ghost refused" : "tree-drag-ghost"} style={{ left: drag.x + 12, top: drag.y + 8 }} aria-hidden="true">
          {drag.item.icon}
          <span>{drag.item.label}</span>
        </div>
      )}
      {menu && <PopoverMenu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
    </aside>
  );
});

const SIDEBAR_WIDTH_KEY = "flownote:sidebar-width";
const clampWidth = (width: number) => Math.min(480, Math.max(200, Math.round(width)));
const applyWidth = (width: number) => document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
try {
  const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (saved) applyWidth(clampWidth(saved));
} catch {
  // default width
}

/** Dragging the sidebar's right edge sets its width (remembered). */
function startSidebarResize(event: React.PointerEvent) {
  event.preventDefault();
  const left = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect().left;
  let width = 0;
  document.body.classList.add("sidebar-resizing");
  const move = (ev: PointerEvent) => applyWidth((width = clampWidth(ev.clientX - left)));
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    document.body.classList.remove("sidebar-resizing");
    try {
      if (width) localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
    } catch {
      // not remembered
    }
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/** "Favoris", folded on its title (open at first, remembered). */
function FavoritesSection({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = usePersistentFlag("flownote:favorites-section", true, ["shown", "hidden"]);
  return (
    <>
      <button className="sidebar-section sidebar-section-toggle" onClick={() => setShown(!shown)} aria-expanded={shown}>
        Favoris
        <Icon name={shown ? "chevronDown" : "chevronRight"} size={12} />
      </button>
      {shown && children}
    </>
  );
}

/**
 * The vault's tags as a tree, below the pages, like Obsidian's tag pane: each
 * with the number of notes carrying it (nested tags included); a click
 * searches those notes. The section opens on its title (folded at first, remembered).
 */
function TagsSection({ tags, onTag }: { tags: TagNode[]; onTag: (tag: string) => void }) {
  const [shown, setShown] = usePersistentFlag("flownote:tags-section", false, ["shown", "hidden"]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (tag: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(tag)) next.add(tag);
      return next;
    });
  const render = (list: TagNode[], depth: number) => (
    <ul className="tree">
      {list.map((node) => {
        const open = expanded.has(node.tag);
        return (
          <li key={node.tag}>
            <div className="page-row tag-row" style={{ paddingLeft: depth * 14 + 4 }}>
              <button className="page-toggle" onClick={() => toggle(node.tag)} aria-label={open ? "Replier" : "Déplier"} disabled={node.children.length === 0}>
                {node.children.length > 0 && <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />}
              </button>
              <button className="page-name" onClick={() => onTag(node.tag)} title={`Rechercher les notes #${node.tag}`}>
                <span className="page-icon tag-hash" aria-hidden="true">
                  #
                </span>
                <span className="page-label">{node.name}</span>
                <span className="tag-count">{node.count}</span>
              </button>
            </div>
            {open && node.children.length > 0 && render(node.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );
  return (
    <>
      <button className="sidebar-section sidebar-section-toggle" onClick={() => setShown(!shown)} aria-expanded={shown}>
        Tags
        <Icon name={shown ? "chevronDown" : "chevronRight"} size={12} />
      </button>
      {shown && <div className="sidebar-tags">{render(tags, 0)}</div>}
    </>
  );
}
