import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { VaultEntry } from "./vault/vault";
import { Icon, type IconName } from "./Icon";
import { isDrawingPath } from "./drawing/format";
import { isMindmapPath } from "./mindmap/format";
import { isBasePath } from "./base/baseFile";
import { dirname, noteTitle } from "./vault/links";
import { keys } from "./keys";

/**
 * Sidebar, laid out like Notion's: the vault (with its menu) and a "new page"
 * button at the top, navigation rows, the page tree, then Git, settings and
 * help at the bottom.
 *
 * Page tree: a note and the folder of the same name next to it ("Projet.md" +
 * "Projet/") are shown as one page whose children are the folder's content,
 * like nested pages in Notion.
 */

interface Page {
  key: string;
  name: string;
  /** Note opened by clicking the row; null for a plain folder. */
  notePath: string | null;
  children: Page[];
  ticket?: boolean;
  presentation?: boolean;
  icon?: string;
  /** A row of the base next to its folder (`X.base` + `X/`). */
  row?: boolean;
}

export function toPages(entries: VaultEntry[], rows = false): Page[] {
  const dirs = new Map(entries.filter((e) => e.kind === "dir").map((e) => [e.name, e]));
  const usedDirs = new Set<string>();
  const pages: Page[] = [];
  for (const entry of entries) {
    if (entry.kind !== "file") continue;
    const folder = dirs.get(entry.name);
    if (folder) usedDirs.add(folder.name);
    const children = folder ? toPages(folder.children ?? [], isBasePath(entry.path)) : [];
    pages.push({ key: entry.path, name: entry.name, notePath: entry.path, children, ticket: entry.ticket, presentation: entry.presentation, icon: entry.icon, row: rows && entry.path.endsWith(".md") });
  }
  const folders = entries
    .filter((e) => e.kind === "dir" && !usedDirs.has(e.name))
    .map((e) => ({ key: e.path, name: e.name, notePath: null, children: toPages(e.children ?? []) }));
  return [...folders, ...pages];
}

/** The tree without the entries the app shows elsewhere (tickets folder, reading list). */
export function withoutPaths(entries: VaultEntry[], hidden: Set<string>): VaultEntry[] {
  return entries.filter((e) => !hidden.has(e.path)).map((e) => (e.kind === "dir" && e.children ? { ...e, children: withoutPaths(e.children, hidden) } : e));
}

function containsPath(page: Page, path: string): boolean {
  return page.notePath === path || page.children.some((child) => containsPath(child, path));
}

/** Emoji of the page, or the icon of its kind (folder when `path` is null). */
export function PageIcon({ path, icon, ticket, presentation, row, size = 14 }: { path: string | null; icon?: string | null; ticket?: boolean; presentation?: boolean; row?: boolean; size?: number }) {
  if (icon) {
    return (
      <span className="page-emoji" style={{ fontSize: size, width: size + 2 }}>
        {icon}
      </span>
    );
  }
  const name: IconName = path === null ? "folder" : isDrawingPath(path) ? "drawing" : isMindmapPath(path) ? "mindmap" : isBasePath(path) ? "database" : ticket ? "ticket" : presentation ? "slides" : row ? "baseRow" : "doc";
  return <Icon name={name} size={size} />;
}

export interface MenuItem {
  label: string;
  icon: IconName;
  danger?: boolean;
  run: () => void;
}

/**
 * A small menu under the button that opened it (or the pointer, for a right
 * click), above it when there is no room below; closes on Escape or a click
 * outside.
 */
export function PopoverMenu({ anchor, items, onClose }: { anchor: DOMRect; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchor.bottom + 4);
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0;
    setTop(anchor.bottom + 4 + height > window.innerHeight - 8 ? Math.max(8, anchor.top - 4 - height) : anchor.bottom + 4);
  }, [anchor]);
  useEffect(() => {
    const down = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && onClose();
    const key = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="sidebar-menu" role="menu" style={{ top, left: Math.max(8, Math.min(anchor.left, window.innerWidth - 240)) }}>
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          className={item.danger ? "danger" : undefined}
          onClick={() => {
            onClose();
            item.run();
          }}
        >
          <Icon name={item.icon} size={14} />
          {item.label}
        </button>
      ))}
    </div>
  );
}

function NavRow({
  icon,
  label,
  shortcut,
  active,
  badge,
  onClick,
}: {
  icon: IconName;
  label: string;
  shortcut?: string;
  active?: boolean;
  badge?: number | null;
  onClick: (event: React.MouseEvent) => void;
}) {
  return (
    <button className={active ? "sidebar-row active" : "sidebar-row"} onClick={onClick} aria-current={active ? "page" : undefined}>
      <Icon name={icon} size={15} />
      <span className="sidebar-row-label">{label}</span>
      {badge ? <span className="sidebar-badge">{badge > 99 ? "99+" : badge}</span> : null}
      {shortcut && <kbd>{keys(shortcut)}</kbd>}
    </button>
  );
}

/** What is dragged in the tree: a page (its note) or a plain folder. */
interface DragItem {
  path: string;
  folder: boolean;
  ticket?: boolean;
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
  view: "home" | "tickets" | "graph" | "reading" | "settings" | null;
  /** Folder of the tickets (a setting): numbered by the app, so it never moves nor receives drops. */
  ticketsFolder: string;
  /** Paths left out of the tree: the tickets folder and the reading list have their own views. */
  hidden: string[];
  /** Live icon of the open page (its front matter may not be saved yet). */
  liveIcon?: { path: string; icon: string | null };
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
  /** A copy of the page next to it. */
  onDuplicate: (notePath: string) => void;
  /** Copies a `[[link]]` to the page. */
  onCopyLink: (notePath: string) => void;
  /** Shows a page or folder in the Finder; absent outside the desktop app. */
  onReveal?: (path: string) => void;
  /** Moves a page (with its sub-pages) or a folder into `target` ("" is the vault root). */
  onMove: (item: { path: string; folder: boolean }, target: string) => void;
  onRename: (notePath: string) => void;
  onSearch: () => void;
  onVaultSearch: () => void;
  onHome: (newTab: boolean) => void;
  onTickets: (newTab: boolean) => void;
  onGraph: (newTab: boolean) => void;
  onReading: (newTab: boolean) => void;
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

export function Sidebar(props: Props) {
  const { vaultName, tree, selected, view, liveIcon, gitChanges, gitOpen } = props;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ anchor: DOMRect; items: MenuItem[] } | null>(null);
  const pages = toPages(withoutPaths(tree, new Set(props.hidden)));
  /** What the tree knows of each note (icon, ticket, presentation), for the favorites. */
  const entries = new Map<string, VaultEntry>();
  const index = (list: VaultEntry[]) => list.forEach((e) => (e.kind === "file" ? entries.set(e.path, e) : index(e.children ?? [])));
  index(tree);
  /** The dragged item, the pointer, and where it would land (null: nowhere valid). */
  const [drag, setDrag] = useState<{ item: DragItem; x: number; y: number; target: string | null } | null>(null);
  /** A drag just ended: the click that follows the release must not open the page. */
  const dragged = useRef(false);
  const treeRef = useRef<HTMLDivElement>(null);

  // Reveal the selected page.
  useEffect(() => {
    if (!selected) return;
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
  }, [selected, tree]);

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

  const reveal = (path: string): MenuItem[] => (props.onReveal ? [{ label: "Afficher dans le Finder", icon: "folder", run: () => props.onReveal!(path) }] : []);

  /** Tickets are numbered and bases share their rows' folder: neither is duplicated. */
  const pageMenu = (path: string, ticket = false): MenuItem[] => [
    { label: "Ouvrir dans un nouvel onglet", icon: "open", run: () => props.onSelect(path, true) },
    { label: "Ouvrir à droite", icon: "split", run: () => props.onOpenRight(path) },
    { label: "Ajouter une sous-page", icon: "plus", run: () => props.onNewPage(path) },
    { label: "Copier le lien", icon: "link", run: () => props.onCopyLink(path) },
    ...(ticket || isBasePath(path) ? [] : [{ label: "Dupliquer", icon: "copy" as IconName, run: () => props.onDuplicate(path) }]),
    ...reveal(path),
    { label: "Renommer", icon: "pencil", run: () => props.onRename(path) },
    { label: "Supprimer", icon: "trash", danger: true, run: () => props.onDelete(path) },
  ];

  /** Where an item may be dropped: a plain folder other than its own (and not inside itself), or the root. */
  /** In the tickets folder (the vault root holds everything, so it does not count). */
  const inTickets = (path: string) => props.ticketsFolder !== "" && (path === props.ticketsFolder || path.startsWith(`${props.ticketsFolder}/`));

  const dropTarget = (item: DragItem, target: string | null): string | null => {
    if (target === null || target === dirname(item.path) || inTickets(target)) return null;
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
    // Tickets and their folder stay where the app numbers them.
    if (item.ticket || inTickets(item.path)) return;
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

  const folderMenu = (folder: string): MenuItem[] => [
    { label: "Nouvelle page dans ce dossier", icon: "plus", run: () => props.onNewPageInFolder(folder) },
    {
      label: "Nouveau sous-dossier",
      icon: "folderAdd",
      run: () => {
        setExpanded((open) => new Set(open).add(folder));
        props.onNewFolder(folder);
      },
    },
    ...reveal(folder),
    { label: "Renommer", icon: "pencil", run: () => props.onRenameFolder(folder) },
    { label: "Supprimer", icon: "trash", danger: true, run: () => props.onDeleteFolder(folder) },
  ];

  const render = (list: Page[], depth: number) => (
    <ul className="tree">
      {list.map((page) => {
        const open = expanded.has(page.key);
        const icon = page.notePath && liveIcon?.path === page.notePath ? liveIcon.icon : page.icon;
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
                  ticket: page.ticket,
                  label: page.notePath ? noteTitle(page.notePath) : page.name,
                  icon: <PageIcon path={page.notePath} icon={icon} ticket={page.ticket} presentation={page.presentation} row={page.row} />,
                })
              }
              onContextMenu={(event) => openContextMenu(event, page.notePath ? pageMenu(page.notePath, page.ticket) : folderMenu(page.key))}
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
                  <PageIcon path={page.notePath} icon={icon} ticket={page.ticket} presentation={page.presentation} row={page.row} />
                </span>
                <span className="page-label">{page.notePath ? noteTitle(page.notePath) : page.name}</span>
              </button>
              <button
                className="page-add"
                title="Renommer, supprimer…"
                aria-label="Plus d'actions"
                onClick={(event) => openMenu(event, page.notePath ? pageMenu(page.notePath, page.ticket) : folderMenu(page.key))}
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
      <nav className="sidebar-nav" aria-label="Navigation">
        <NavRow icon="home" label="Accueil" active={view === "home"} onClick={(event) => props.onHome(event.metaKey || event.ctrlKey)} />
        <NavRow icon="search" label="Rechercher" shortcut="⌘P" onClick={props.onSearch} />
        <NavRow icon="searchText" label="Rechercher dans les notes" shortcut="⌘⇧F" onClick={props.onVaultSearch} />
        <NavRow icon="ticket" label="Tickets" active={view === "tickets"} onClick={(event) => props.onTickets(event.metaKey || event.ctrlKey)} />
        <NavRow icon="bookmark" label="Lectures" active={view === "reading"} onClick={(event) => props.onReading(event.metaKey || event.ctrlKey)} />
        <NavRow icon="graph" label="Graphe" active={view === "graph"} onClick={(event) => props.onGraph(event.metaKey || event.ctrlKey)} />
      </nav>
      {props.favorites.length > 0 && (
        <>
          <div className="sidebar-section">Favoris</div>
          <ul className="tree sidebar-favorites">
            {props.favorites.map((path) => (
              <li key={path}>
                <div
                  className={path === selected && view === null ? "page-row selected" : "page-row"}
                  style={{ paddingLeft: 4 }}
                  onContextMenu={(event) => openContextMenu(event, pageMenu(path, entries.get(path)?.ticket))}
                >
                  <span className="page-toggle" aria-hidden="true" />
                  <button className="page-name" onClick={(event) => (event.altKey ? props.onOpenRight(path) : props.onSelect(path, event.metaKey || event.ctrlKey))} onAuxClick={(event) => event.button === 1 && props.onSelect(path, true)}>
                    <span className="page-icon">
                      <PageIcon
                        path={path}
                        icon={path === liveIcon?.path ? liveIcon.icon : entries.get(path)?.icon}
                        ticket={entries.get(path)?.ticket}
                        presentation={entries.get(path)?.presentation}
                      />
                    </span>
                    <span className="page-label">{noteTitle(path)}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="sidebar-section">
        Pages
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
          openContextMenu(event, [
            { label: "Nouvelle page", icon: "plus", run: () => props.onNewPageInFolder("") },
            { label: "Nouveau dossier", icon: "folderAdd", run: () => props.onNewFolder("") },
          ])
        }
      >
        {render(pages, 0)}
      </div>
      <div className="sidebar-footer">
        {gitChanges !== null && <NavRow icon="branch" label="Git" shortcut="⌘⇧G" active={gitOpen} badge={gitChanges} onClick={props.onGit} />}
        <NavRow icon="sliders" label="Réglages" shortcut="⌘," active={view === "settings"} onClick={(event) => props.onSettings(event.metaKey || event.ctrlKey)} />
        <NavRow icon="question" label="Aide et raccourcis" shortcut="⌘/" onClick={props.onHelp} />
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
}
