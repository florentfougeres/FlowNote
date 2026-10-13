import { useEffect, useState } from "react";
import type { VaultEntry } from "./vault/vault";

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
  gitChanges: number | null;
  gitActive: boolean;
  onToggleGit: () => void;
}

export function Sidebar({ vaultName, tree, selected, onSelect, onNewPage, gitChanges, gitActive, onToggleGit }: Props) {
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
                {page.children.length === 0 ? "" : open ? "▾" : "▸"}
              </button>
              <button className="page-name" onClick={() => (page.notePath ? onSelect(page.notePath) : toggle(page.key))}>
                <span className="page-icon">{page.notePath ? "📄" : "📁"}</span>
                {page.name}
              </button>
              {page.notePath && (
                <button className="page-add" title="Ajouter une sous-page" onClick={() => onNewPage(page.notePath)}>
                  +
                </button>
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
      <div className="vault-name">{vaultName}</div>
      {render(pages, 0)}
      <button className="new-page" onClick={() => onNewPage(null)}>
        + Nouvelle page
      </button>
      {gitChanges !== null && (
        <button className={gitActive ? "git-button active" : "git-button"} onClick={onToggleGit}>
          <span>⎇ Git</span>
          {gitChanges > 0 && <span className="git-badge">{gitChanges}</span>}
        </button>
      )}
    </aside>
  );
}
