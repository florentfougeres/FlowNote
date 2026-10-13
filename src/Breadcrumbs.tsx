import { useEffect, useRef, useState } from "react";
import { dirname, noteTitle } from "./vault/links";

/**
 * Location of the open page, navigable: a folder opens its folder note
 * ("Projets.md" next to "Projets/", or "Projets/Projets.md") when there is one,
 * otherwise lists the pages it contains.
 */
export function Breadcrumbs({ vaultName, path, files, onOpen }: { vaultName: string; path: string; files: string[]; onOpen: (path: string) => void }) {
  const [menu, setMenu] = useState<{ folder: string; left: number } | null>(null);
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

  const pagesIn = (folder: string) => files.filter((f) => f.endsWith(".md") && dirname(f) === folder).sort((a, b) => a.localeCompare(b, "fr"));

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
      <span className="crumb current" title={path}>
        {noteTitle(path)}
      </span>
      {menu && (
        <div className="crumb-menu" style={{ left: menu.left }}>
          {pagesIn(menu.folder).length === 0 && <span className="git-none">Aucune page dans ce dossier.</span>}
          {pagesIn(menu.folder).map((page) => (
            <button
              key={page}
              className={page === path ? "crumb-menu-item current" : "crumb-menu-item"}
              onClick={() => {
                setMenu(null);
                onOpen(page);
              }}
            >
              {noteTitle(page)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
