import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { backlinksTo, linkMention, unlinkedMentions, type Backlink, type Mention } from "./vault/backlinks";
import { linkTextFor, noteTitle } from "./vault/links";
import { readAllNotes, type Vault } from "./vault/vault";

/** The excerpt with the mentioned name in bold. */
function highlighted(excerpt: string, found: string): ReactNode {
  const at = excerpt.toLowerCase().indexOf(found.toLowerCase());
  if (at < 0) return excerpt;
  return (
    <>
      {excerpt.slice(0, at)}
      <mark>{excerpt.slice(at, at + found.length)}</mark>
      {excerpt.slice(at + found.length)}
    </>
  );
}

/**
 * Under a note: "Notes liées", the pages linking to it with the line of the
 * link, then "Mentions non liées", the pages naming it without a link, each
 * with a button writing the link. Hidden when there is neither.
 */
export function Backlinks({
  vault,
  files,
  path,
  iconOf,
  onOpen,
  onChanged,
}: {
  vault: Vault;
  files: string[];
  path: string;
  iconOf: (path: string) => ReactNode;
  onOpen: (path: string, newTab: boolean) => void;
  /** After a mention was linked (another note was written). */
  onChanged: (path: string) => void;
}) {
  const [found, setFound] = useState<{ path: string; links: Backlink[]; mentions: Mention[] } | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      readAllNotes(vault, files).then((notes) => ({ path, links: backlinksTo(path, notes, files), mentions: unlinkedMentions(path, notes, files) })),
    [vault, files, path],
  );

  useEffect(() => {
    let cancelled = false;
    setShowMentions(false);
    setError(null);
    void load()
      .then((result) => !cancelled && setFound(result))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [load]);

  const link = async (mention: Mention) => {
    try {
      const text = await vault.read(mention.path);
      const next = linkMention(text, mention, linkTextFor(path, files));
      if (next === null) {
        setError("La note a changé : liste mise à jour.");
      } else {
        await vault.write(mention.path, next, text);
        setError(null);
        onChanged(mention.path);
      }
      setFound(await load());
    } catch (cause) {
      setError(`Lien impossible : ${String(cause)}`);
    }
  };

  const current = found?.path === path ? found : null;
  if (!current || (current.links.length === 0 && current.mentions.length === 0)) return null;
  const { links, mentions } = current;
  const count = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

  return (
    <section className="backlinks" aria-label="Notes liées">
      {links.length > 0 && (
        <>
          <h2>{count(links.length, "note liée", "notes liées")}</h2>
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
        </>
      )}
      {mentions.length > 0 && (
        <>
          <h2>
            <button className="backlinks-toggle" onClick={() => setShowMentions(!showMentions)} aria-expanded={showMentions}>
              <Icon name={showMentions ? "chevronDown" : "chevronRight"} size={12} />
              {count(mentions.length, "mention non liée", "mentions non liées")}
            </button>
          </h2>
          {error && <p className="backlinks-error">{error}</p>}
          {showMentions && (
            <ul>
              {mentions.map((mention) => (
                <li key={mention.path} className="backlinks-mention">
                  <button className="backlinks-item" onClick={(event) => onOpen(mention.path, event.metaKey || event.ctrlKey)} title={mention.path}>
                    <span className="backlinks-title">
                      {iconOf(mention.path)}
                      <span>{noteTitle(mention.path)}</span>
                    </span>
                    <span className="backlinks-excerpt">{highlighted(mention.excerpt, mention.found)}</span>
                  </button>
                  <button className="backlinks-link" onClick={() => void link(mention)} title={`Remplacer « ${mention.found} » par un lien vers cette page`}>
                    Lier
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
