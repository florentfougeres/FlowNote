import { useEffect, useState } from "react";
import type { VaultEntry } from "./vault/vault";
import { Icon } from "./Icon";

/**
 * Page tree. A note and the folder of the same name next to it ("Projet.md" +
 * "Projet/") are shown as one page whose children are the folder's content,
 * like nested pages in Notion.
 */

interface Page {
  key: string;
  name: string;
  /** Note opened by clicking the row; null for a plain folder. */
  notePath: string | null;
  children: Page[];
}

export function toPages(entries: VaultEntry[]): Page[] {
  const dirs = new Map(entries.filter((e) => e.kind === "dir").map((e) => [e.name, e]));
  const usedDirs = new Set<string>();
  const pages: Page[] = [];
  for (const entry of entries) {
    if (entry.kind !== "file") continue;
    const folder = dirs.get(entry.name);
    if (folder) usedDirs.add(folder.name);
    pages.push({ key: entry.path, name: entry.name, notePath: entry.path, children: folder ? toPages(folder.children ?? []) : [] });
  }
  const folders = entries
    .filter((e) => e.kind === "dir" && !usedDirs.has(e.name))
    .map((e) => ({ key: e.path, name: e.name, notePath: null, children: toPages(e.children ?? []) }));
  return [...folders, ...pages];
}

function containsPath(page: Page, path: string): boolean {
  return page.notePath === path || page.children.some((child) => containsPath(child, path));
}

interface Props {
  vaultName: string;
  tree: VaultEntry[];
  selected?: string;
  onSelect: (path: string) => void;
  onNewPage: (parentNote: string | null) => void;
  /** Number of changed files, or null when the vault has no Git repository. */
  onDelete: (notePath: string) => void;
  onSearch: () => void;
  onNewPageInFolder: (folder: string) => void;
}

export function Sidebar({ vaultName, tree, selected, onSelect, onNewPage, onDelete, onSearch, onNewPageInFolder }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  const render = (list: Page[], depth: number) => (
    <ul className="tree">
      {list.map((page) => {
        const open = expanded.has(page.key);
        return (
          <li key={page.key}>
            <div className={page.notePath === selected ? "page-row selected" : "page-row"} style={{ paddingLeft: depth * 14 + 4 }}>
              <button className="page-toggle" onClick={() => toggle(page.key)} aria-label={open ? "Replier" : "Déplier"} disabled={page.children.length === 0}>
                {page.children.length > 0 && <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />}
              </button>
              <button className="page-name" onClick={() => (page.notePath ? onSelect(page.notePath) : toggle(page.key))}>
                <span className="page-icon">
                  <Icon name={page.notePath ? "doc" : "folder"} />
                </span>
                {page.name}
              </button>
              {!page.notePath && (
                <button className="page-add" title="Nouvelle page dans ce dossier" aria-label="Nouvelle page dans ce dossier" onClick={() => onNewPageInFolder(page.key)}>
                  <Icon name="plus" size={14} />
                </button>
              )}
              {page.notePath && (
                <>
                  <button className="page-add" title="Supprimer la page" aria-label="Supprimer la page" onClick={() => onDelete(page.notePath!)}>
                    <Icon name="trash" size={14} />
                  </button>
                  <button className="page-add" title="Ajouter une sous-page" aria-label="Ajouter une sous-page" onClick={() => onNewPage(page.notePath)}>
                    <Icon name="plus" size={14} />
                  </button>
                </>
              )}
            </div>
            {open && page.children.length > 0 && render(page.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-header" data-tauri-drag-region>
        <span className="vault-name">{vaultName}</span>
      </div>
      <button className="sidebar-search" onClick={onSearch}>
        <span>
          <Icon name="search" size={14} /> Rechercher
        </span>
        <kbd>⌘P</kbd>
      </button>
      {render(pages, 0)}
      <button className="new-page" onClick={() => onNewPage(null)}>
        <Icon name="plus" size={14} /> Nouvelle page
      </button>
    </aside>
  );
}
