import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icon";
import { usePersistentFlag } from "../hooks/usePersistentFlag";
import type { Vault } from "../vault/vault";
import { parseReadingList, setChecked, siteOf, type ReadingItem } from "./readingList";
import { openUrl } from "./web";

/**
 * The reading list as a page: themes as collapsible sections with their
 * progress, links opened in the browser, checked once read. The list itself
 * is a plain note (see readingList.ts).
 */
export function ReadingView({
  vault,
  path,
  version,
  onAdd,
  onOpenNote,
  onChanged,
}: {
  vault: Vault;
  path: string;
  /** Bumped when the list changed elsewhere (a link was added). */
  version: number;
  onAdd: () => void;
  onOpenNote: (path: string, newTab: boolean) => void;
  onChanged: () => void;
}) {
  /** File text; null while reading, "" when the note does not exist yet. */
  const [text, setText] = useState<string | null>(null);
  const [hideRead, setHideRead] = usePersistentFlag("flownote:reading-hide-read", false, ["on", "off"]);
  const [query, setQuery] = useState("");
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const load = useCallback(() => vault.read(path).catch(() => ""), [vault, path]);
  useEffect(() => {
    let cancelled = false;
    void load().then((t) => !cancelled && setText(t));
    const onFocus = () => void load().then((t) => !cancelled && setText(t));
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [load, version]);

  const toggle = async (item: ReadingItem) => {
    if (text === null) return;
    const next = setChecked(text, item.line, !item.checked);
    setText(next);
    setError("");
    try {
      await vault.write(path, next, text);
      onChanged();
    } catch (e) {
      setError(`Impossible d'enregistrer : ${String(e)}`);
      setText(await load());
    }
  };

  const sections = text ? parseReadingList(text) : [];
  const all = sections.flatMap((s) => s.items);
  const unread = all.filter((i) => !i.checked);
  const q = query.trim().toLowerCase();
  const visible = (i: ReadingItem) => (!hideRead || !i.checked) && (!q || i.title.toLowerCase().includes(q) || i.url.toLowerCase().includes(q));
  const random = () => {
    const pick = unread[Math.floor(Math.random() * unread.length)];
    if (pick) openUrl(pick.url);
  };

  return (
    <div className="reading-view">
      <header className="tickets-header">
        <div>
          <h1>Lectures</h1>
          <p className="dash-muted">{text === null ? "Lecture de la liste…" : `${unread.length} à lire · ${all.length - unread.length} lu${all.length - unread.length > 1 ? "s" : ""}`}</p>
        </div>
        <button onClick={(e) => onOpenNote(path, e.metaKey || e.ctrlKey)} title={path}>
          <Icon name="doc" size={13} /> Ouvrir la note
        </button>
        <button className="primary" onClick={onAdd}>
          <Icon name="plus" size={13} /> Ajouter un lien
        </button>
      </header>
      <div className="tickets-toolbar">
        <label className="tickets-search">
          <Icon name="search" size={14} />
          <input placeholder="Rechercher un lien" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQuery("")} />
        </label>
        <label className="reading-toggle">
          <input type="checkbox" checked={hideRead} onChange={(e) => setHideRead(e.target.checked)} /> Masquer les lus
        </label>
        <button onClick={random} disabled={unread.length === 0} title="Ouvrir un lien non lu au hasard">
          Au hasard
        </button>
      </div>
      {error && <p className="status warning">{error}</p>}
      {text !== null && all.length === 0 ? (
        <div className="tickets-empty">
          <Icon name="bookmark" size={22} />
          <p>Aucun lien pour l'instant. Ajoutez-en un avec « Ajouter un lien » ou ⌘⇧L.</p>
        </div>
      ) : (
        sections.map((section) => {
          const key = section.title ?? "";
          const items = section.items.filter(visible);
          if (items.length === 0 && (q || hideRead)) return null;
          const read = section.items.filter((i) => i.checked).length;
          const open = !folded.has(key);
          return (
            <section key={`${key}-${section.line}`} className="reading-section">
              <button
                className="reading-section-header"
                aria-expanded={open}
                onClick={() => {
                  const next = new Set(folded);
                  if (open) next.add(key);
                  else next.delete(key);
                  setFolded(next);
                }}
              >
                <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />
                <strong>{section.title ?? "Sans thème"}</strong>
                <span className="reading-progress" aria-hidden>
                  <span style={{ width: `${section.items.length ? (read / section.items.length) * 100 : 0}%` }} />
                </span>
                <span className="dash-muted">
                  {read}/{section.items.length} lu{read > 1 ? "s" : ""}
                </span>
              </button>
              {open &&
                items.map((item) => (
                  <div key={item.line} className={item.checked ? "reading-item read" : "reading-item"}>
                    <input type="checkbox" checked={item.checked} onChange={() => void toggle(item)} aria-label={item.checked ? "Marquer comme non lu" : "Marquer comme lu"} />
                    <button className="reading-link" onClick={() => openUrl(item.url)} title={item.url}>
                      <span className="reading-title">{item.title}</span>
                      <span className="reading-site">{siteOf(item.url)}</span>
                    </button>
                  </div>
                ))}
            </section>
          );
        })
      )}
    </div>
  );
}
