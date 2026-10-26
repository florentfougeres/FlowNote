import { useEffect, useState, type ReactNode } from "react";
import { reportError } from "./errors";
import { backlinksTo, type Backlink } from "./vault/backlinks";
import { noteTitle } from "./vault/links";
import { readAllNotes, type Vault } from "./vault/vault";

/**
 * Under a note: "Notes liées", the pages linking to it with the line of the
 * link. Hidden when there is none.
 */
export function Backlinks({
  vault,
  files,
  path,
  iconOf,
  onOpen,
}: {
  vault: Vault;
  files: string[];
  path: string;
  iconOf: (path: string) => ReactNode;
  onOpen: (path: string, newTab: boolean) => void;
}) {
  const [found, setFound] = useState<{ path: string; links: Backlink[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readAllNotes(vault, files)
      .then((notes) => !cancelled && setFound({ path, links: backlinksTo(path, notes, files) }))
      .catch(reportError);
    return () => {
      cancelled = true;
    };
  }, [vault, files, path]);

  const links = found?.path === path ? found.links : [];
  if (links.length === 0) return null;

  return (
    <section className="backlinks" aria-label="Notes liées">
      <h2>{links.length > 1 ? `${links.length} notes liées` : "1 note liée"}</h2>
      <ul>
        {links.map((item) => (
          <li key={item.path}>
            <button className="backlinks-item" onClick={(event) => onOpen(item.path, event.metaKey || event.ctrlKey)} title={item.path}>
              <span className="backlinks-title">
                {iconOf(item.path)}
                <span>{noteTitle(item.path)}</span>
              </span>
              {item.excerpt && <span className="backlinks-excerpt">{item.excerpt}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
