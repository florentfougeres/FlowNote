import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { usePersistentFlag } from "../hooks/usePersistentFlag";
import type { Vault } from "../vault/vault";
import { parseReadingList, readingTagsOf, setChecked, setTags, siteOf, tagKey, type ReadingItem } from "./readingList";
import { TagInput } from "./TagInput";
import { openUrl } from "./web";

/**
 * The reading list as a page: themes as collapsible sections with their
 * progress, links opened in the browser, checked once read, tagged and
 * filtered by tags. The list itself is a plain note (see readingList.ts).
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
  /** Tags every visible link must have (compared without case). */
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  /** Line of the link whose tags are being edited. */
  const [editing, setEditing] = useState<number | null>(null);
  const filterBox = useOutside(filterOpen, () => setFilterOpen(false));
  const editBox = useOutside(editing !== null, () => setEditing(null));

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

  const save = async (change: (text: string) => string) => {
    if (text === null) return;
    const next = change(text);
    if (next === text) return;
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

  const toggle = (item: ReadingItem) => save((t) => setChecked(t, item.line, !item.checked));
  const retag = (item: ReadingItem, tags: string[]) => save((t) => setTags(t, item.line, tags));

  const sections = text ? parseReadingList(text) : [];
  const all = sections.flatMap((s) => s.items);
  const unread = all.filter((i) => !i.checked);
  const allTags = readingTagsOf(sections);
  const countOf = (tag: string) => all.filter((i) => i.tags.some((t) => tagKey(t) === tagKey(tag))).length;
  const filtering = tagFilter.length > 0;
  const toggleFilter = (tag: string) => {
    const key = tagKey(tag);
    setTagFilter((f) => (f.includes(key) ? f.filter((k) => k !== key) : [...f, key]));
  };
  const q = query.trim().toLowerCase().replace(/^#/, "");
  const visible = (i: ReadingItem) =>
    (!hideRead || !i.checked) &&
    (!q || i.title.toLowerCase().includes(q) || i.url.toLowerCase().includes(q) || i.tags.some((t) => tagKey(t).includes(q))) &&
    tagFilter.every((key) => i.tags.some((t) => tagKey(t) === key));
  const shown = all.filter(visible);
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
        <div className="db-popover-anchor" ref={filterBox}>
          <button className={filtering ? "reading-tags-button active" : "reading-tags-button"} aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}>
            <Icon name="tag" size={13} /> Tags{filtering && <span className="reading-tags-count">{tagFilter.length}</span>}
          </button>
          {filterOpen && (
            <div className="db-popover db-menu db-menu-right reading-tags-menu">
              {allTags.length === 0 ? (
                <p className="reading-tags-empty">Aucun tag. Ajoutez-en sur un lien avec l'icône étiquette.</p>
              ) : (
                <>
                  <small>Afficher les liens avec tous ces tags</small>
                  {allTags.map((tag) => (
                    <button key={tag} className={tagFilter.includes(tagKey(tag)) ? "selected" : ""} onClick={() => toggleFilter(tag)}>
                      <Icon name={tagFilter.includes(tagKey(tag)) ? "check" : "tag"} size={13} />
                      <span>#{tag}</span>
                      <span className="reading-tags-menu-count">{countOf(tag)}</span>
                    </button>
                  ))}
                  {filtering && (
                    <>
                      <hr />
                      <button onClick={() => setTagFilter([])}>
                        <Icon name="close" size={13} /> Effacer le filtre
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <button onClick={random} disabled={unread.length === 0} title="Ouvrir un lien non lu au hasard">
          Au hasard
        </button>
      </div>
      {filtering && (
        <div className="reading-filter">
          {tagFilter.map((key) => (
            <span key={key} className="chip tag-chip">
              #{allTags.find((t) => tagKey(t) === key) ?? key}
              <button aria-label={`Retirer #${key} du filtre`} onClick={() => setTagFilter((f) => f.filter((k) => k !== key))}>
                <Icon name="close" size={10} />
              </button>
            </span>
          ))}
          <span className="dash-muted">
            {shown.length} lien{shown.length > 1 ? "s" : ""}
          </span>
          <button className="dash-inline" onClick={() => setTagFilter([])}>
            Effacer
          </button>
        </div>
      )}
      {error && <p className="status warning">{error}</p>}
      {text !== null && all.length === 0 ? (
        <div className="tickets-empty">
          <Icon name="bookmark" size={22} />
          <p>Aucun lien pour l'instant. Ajoutez-en un avec « Ajouter un lien » ou ⌘⇧L.</p>
        </div>
      ) : text !== null && shown.length === 0 && (filtering || q) ? (
        <div className="tickets-empty">
          <Icon name="tag" size={22} />
          <p>{filtering ? "Aucun lien avec ces tags." : "Aucun lien ne correspond à la recherche."}</p>
        </div>
      ) : (
        sections.map((section) => {
          const key = section.title ?? "";
          const items = section.items.filter(visible);
          if (items.length === 0 && (q || hideRead || filtering)) return null;
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
                    {item.tags.length > 0 && (
                      <span className="reading-item-tags">
                        {item.tags.map((tag) => (
                          <button
                            key={tag}
                            className={tagFilter.includes(tagKey(tag)) ? "chip tag-chip active" : "chip tag-chip"}
                            title={tagFilter.includes(tagKey(tag)) ? "Retirer du filtre" : "Filtrer par ce tag"}
                            onClick={() => toggleFilter(tag)}
                          >
                            #{tag}
                          </button>
                        ))}
                      </span>
                    )}
                    <div className="db-popover-anchor" ref={editing === item.line ? editBox : undefined}>
                      <button
                        className={editing === item.line ? "reading-tag-edit open" : "reading-tag-edit"}
                        aria-label="Modifier les tags"
                        title="Modifier les tags"
                        onClick={() => setEditing(editing === item.line ? null : item.line)}
                      >
                        <Icon name="tag" size={13} />
                      </button>
                      {editing === item.line && (
                        <div className="db-popover db-menu-right reading-tag-editor" onKeyDown={(e) => e.key === "Escape" && setEditing(null)}>
                          <TagInput autoFocus tags={item.tags} suggestions={allTags} onChange={(tags) => void retag(item, tags)} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </section>
          );
        })
      )}
    </div>
  );
}

/** A popover's box, closed by a click outside it. */
function useOutside(open: boolean, onClose: () => void) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose();
    window.addEventListener("mousedown", down);
    return () => window.removeEventListener("mousedown", down);
  }, [open, onClose]);
  return box;
}
