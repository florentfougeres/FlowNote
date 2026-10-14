import { useEffect, useRef, useState } from "react";
import type { VaultEntry } from "./vault/vault";
import { Icon, type IconName } from "./Icon";
import { isDrawingPath } from "./drawing/format";
import { isMindmapPath } from "./mindmap/format";
import { noteTitle } from "./vault/links";
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
}

export function toPages(entries: VaultEntry[]): Page[] {
  const dirs = new Map(entries.filter((e) => e.kind === "dir").map((e) => [e.name, e]));
  const usedDirs = new Set<string>();
  const pages: Page[] = [];
  for (const entry of entries) {
    if (entry.kind !== "file") continue;
    const folder = dirs.get(entry.name);
    if (folder) usedDirs.add(folder.name);
    pages.push({ key: entry.path, name: entry.name, notePath: entry.path, children: folder ? toPages(folder.children ?? []) : [], ticket: entry.ticket, presentation: entry.presentation, icon: entry.icon });
  }
  const folders = entries
    .filter((e) => e.kind === "dir" && !usedDirs.has(e.name))
    .map((e) => ({ key: e.path, name: e.name, notePath: null, children: toPages(e.children ?? []) }));
  return [...folders, ...pages];
}

function containsPath(page: Page, path: string): boolean {
  return page.notePath === path || page.children.some((child) => containsPath(child, path));
}

/** Emoji of the page, or the icon of its kind (folder when `path` is null). */
export function PageIcon({ path, icon, ticket, presentation, size = 14 }: { path: string | null; icon?: string | null; ticket?: boolean; presentation?: boolean; size?: number }) {
  if (icon) {
    return (
      <span className="page-emoji" style={{ fontSize: size, width: size + 2 }}>
        {icon}
      </span>
    );
  }
  const name: IconName = path === null ? "folder" : isDrawingPath(path) ? "drawing" : isMindmapPath(path) ? "mindmap" : ticket ? "ticket" : presentation ? "slides" : "doc";
  return <Icon name={name} size={size} />;
}

interface MenuItem {
  label: string;
  icon: IconName;
  danger?: boolean;
  run: () => void;
}

/** A small menu under the button that opened it; closes on Escape or a click outside. */
function PopoverMenu({ anchor, items, onClose }: { anchor: DOMRect; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
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
    <div ref={ref} className="sidebar-menu" role="menu" style={{ top: anchor.bottom + 4, left: Math.max(8, Math.min(anchor.left, window.innerWidth - 240)) }}>
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

interface Props {
  vaultName: string;
  tree: VaultEntry[];
  selected?: string;
  /** What the active tab shows when it is not a page. */
  view: "home" | "tickets" | "graph" | "reading" | null;
  /** Live icon of the open page (its front matter may not be saved yet). */
  liveIcon?: { path: string; icon: string | null };
  /** Number of changed files, or null when the vault has no Git repository. */
  gitChanges: number | null;
  gitOpen: boolean;
  /** Opens a page; `newTab` with ⌘-click. */
  onSelect: (path: string, newTab: boolean) => void;
  onNewPage: (parentNote: string | null) => void;
  onNewPageInFolder: (folder: string) => void;
  onDelete: (notePath: string) => void;
  onRename: (notePath: string) => void;
  onSearch: () => void;
  onVaultSearch: () => void;
  onHome: (newTab: boolean) => void;
  onTickets: (newTab: boolean) => void;
  onGraph: (newTab: boolean) => void;
  onReading: (newTab: boolean) => void;
  onGit: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onChangeVault: () => void;
}

export function Sidebar(props: Props) {
  const { vaultName, tree, selected, view, liveIcon, gitChanges, gitOpen } = props;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ anchor: DOMRect; items: MenuItem[] } | null>(null);
  const pages = toPages(tree);

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

  const pageMenu = (path: string): MenuItem[] => [
    { label: "Ouvrir dans un nouvel onglet", icon: "open", run: () => props.onSelect(path, true) },
    { label: "Ajouter une sous-page", icon: "plus", run: () => props.onNewPage(path) },
    { label: "Renommer", icon: "pencil", run: () => props.onRename(path) },
    { label: "Supprimer", icon: "trash", danger: true, run: () => props.onDelete(path) },
  ];

  const render = (list: Page[], depth: number) => (
    <ul className="tree">
      {list.map((page) => {
        const open = expanded.has(page.key);
        const icon = page.notePath && liveIcon?.path === page.notePath ? liveIcon.icon : page.icon;
        return (
          <li key={page.key}>
            <div className={page.notePath === selected && view === null ? "page-row selected" : "page-row"} style={{ paddingLeft: depth * 14 + 4 }}>
              <button className="page-toggle" onClick={() => toggle(page.key)} aria-label={open ? "Replier" : "Déplier"} disabled={page.children.length === 0}>
                {page.children.length > 0 && <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />}
              </button>
              <button
                className="page-name"
                onClick={(event) => (page.notePath ? props.onSelect(page.notePath, event.metaKey || event.ctrlKey) : toggle(page.key))}
                onAuxClick={(event) => event.button === 1 && page.notePath && props.onSelect(page.notePath, true)}
              >
                <span className="page-icon">
                  <PageIcon path={page.notePath} icon={icon} ticket={page.ticket} presentation={page.presentation} />
                </span>
                <span className="page-label">{page.notePath ? noteTitle(page.notePath) : page.name}</span>
              </button>
              {page.notePath && (
                <button className="page-add" title="Renommer, supprimer…" aria-label="Plus d'actions" onClick={(event) => openMenu(event, pageMenu(page.notePath!))}>
                  <Icon name="more" size={14} />
                </button>
              )}
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
              { label: "Changer de vault…", icon: "folder", run: props.onChangeVault },
              { label: "Réglages", icon: "sliders", run: props.onSettings },
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
        <NavRow icon="search" label="Rechercher" shortcut="⌘P" onClick={props.onSearch} />
        <NavRow icon="replace" label="Rechercher dans les notes" shortcut="⌘⇧F" onClick={props.onVaultSearch} />
        <NavRow icon="home" label="Accueil" active={view === "home"} onClick={(event) => props.onHome(event.metaKey || event.ctrlKey)} />
        <NavRow icon="ticket" label="Tickets" active={view === "tickets"} onClick={(event) => props.onTickets(event.metaKey || event.ctrlKey)} />
        <NavRow icon="bookmark" label="Lectures" active={view === "reading"} onClick={(event) => props.onReading(event.metaKey || event.ctrlKey)} />
        <NavRow icon="graph" label="Graphe" active={view === "graph"} onClick={(event) => props.onGraph(event.metaKey || event.ctrlKey)} />
      </nav>
      <div className="sidebar-section">Pages</div>
      <div className="sidebar-tree">{render(pages, 0)}</div>
      <div className="sidebar-footer">
        {gitChanges !== null && <NavRow icon="branch" label="Git" shortcut="⌘⇧G" active={gitOpen} badge={gitChanges} onClick={props.onGit} />}
        <NavRow icon="sliders" label="Réglages" onClick={props.onSettings} />
        <NavRow icon="question" label="Aide et raccourcis" shortcut="⌘/" onClick={props.onHelp} />
      </div>
      {menu && <PopoverMenu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
    </aside>
  );
}
