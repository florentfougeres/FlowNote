import { useEffect, useRef, useState } from "react";
import { dirname, noteTitle } from "./vault/links";
import { Icon } from "./Icon";
import type { ReactNode } from "react";
import { PageIcon } from "./Sidebar";

/**
 * Location of the open page, navigable: a folder opens its folder note
 * ("Projets.md" next to "Projets/", or "Projets/Projets.md") when there is one,
 * otherwise lists the pages it contains.
 */
export function Breadcrumbs({
  vaultName,
  path,
  files,
  onOpen,
  onRename,
  iconOf,
}: {
  vaultName: string;
  path: string;
  files: string[];
  onOpen: (path: string) => void;
  /** Double-click on the page name renames it (resolves to false when refused). */
  onRename?: (title: string) => Promise<boolean>;
  /** Icon of a page (its emoji, ticket…), for the folder menus. */
  iconOf?: (path: string) => ReactNode;
}) {
  const [menu, setMenu] = useState<{ folder: string; left: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const parts = path.split("/");
  const folders = parts.slice(0, -1);

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && setMenu(null);
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [menu]);

  const openFolder = (folder: string, element: HTMLElement) => {
    const name = folder.split("/").pop()!;
    const folderNote = [`${folder}.md`, `${folder}/${name}.md`].find((candidate) => files.includes(candidate));
    if (folderNote && folderNote !== path) return onOpen(folderNote);
    const box = ref.current!.getBoundingClientRect();
    setMenu({ folder, left: element.getBoundingClientRect().left - box.left });
  };

  const pagesIn = (folder: string) =>
    files.filter((f) => (f.endsWith(".md") || f.endsWith(".base") || f.endsWith(".canvas")) && dirname(f) === folder).sort((a, b) => noteTitle(a).localeCompare(noteTitle(b), "fr"));

  return (
    <div className="breadcrumbs" ref={ref}>
      <button className="crumb" onClick={(e) => (menu?.folder === "" ? setMenu(null) : openFolder("", e.currentTarget))} title="Pages à la racine du vault">
        {vaultName}
      </button>
      {folders.map((name, i) => {
        const folder = folders.slice(0, i + 1).join("/");
        return (
          <span key={folder} className="crumb-item">
            <span className="crumb-separator">›</span>
            <button className="crumb" onClick={(e) => (menu?.folder === folder ? setMenu(null) : openFolder(folder, e.currentTarget))}>
              {name}
            </button>
          </span>
        );
      })}
      <span className="crumb-separator">›</span>
      {editing !== null ? (
        <input
          className="crumb-rename"
          autoFocus
          value={editing}
          size={Math.max(editing.length, 4)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setEditing(e.target.value)}
          onBlur={() => {
            const title = editing.trim();
            setEditing(null);
            if (title && title !== noteTitle(path)) void onRename?.(title);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") setEditing(null);
          }}
        />
      ) : (
        <span className="crumb current" title={onRename ? `${path} · double-cliquer pour renommer` : path} onDoubleClick={() => onRename && setEditing(noteTitle(path))}>
          {noteTitle(path)}
        </span>
      )}
      {menu && (
        <div className="crumb-menu" role="menu" style={{ left: menu.left }}>
          <div className="crumb-menu-title">{menu.folder === "" ? vaultName : menu.folder.split("/").pop()}</div>
          {pagesIn(menu.folder).length === 0 && <span className="crumb-menu-empty">Aucune page dans ce dossier.</span>}
          {pagesIn(menu.folder).map((page) => (
            <button
              key={page}
              role="menuitem"
              className={page === path ? "crumb-menu-item current" : "crumb-menu-item"}
              onClick={() => {
                setMenu(null);
                onOpen(page);
              }}
            >
              {iconOf ? iconOf(page) : <PageIcon path={page} />}
              <span>{noteTitle(page)}</span>
              {page === path && <Icon name="check" size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
