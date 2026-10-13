import { useEffect, useMemo, useRef, useState } from "react";
import type { Vault } from "./vault/vault";
import { matchesIn, searchVault, SEARCH_LIMIT, type SearchHit } from "./vault/search";
import { noteTitle } from "./vault/links";

/** ⌘⇧F: full-text search in every note of the vault. */
export function VaultSearch({ vault, initialQuery, onOpen, onClose }: { vault: Vault; initialQuery: string; onOpen: (hit: SearchHit, occurrence: number, query: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!query.trim()) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchVault(vault, query, caseSensitive)
        .then((found) => !cancelled && (setHits(found), setIndex(0)))
        .catch(() => !cancelled && setHits([]))
        .finally(() => !cancelled && setSearching(false));
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [vault, query, caseSensitive]);

  useEffect(() => {
    list.current?.querySelector(".search-hit.active")?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const groups = useMemo(() => {
    const byFile = new Map<string, { hit: SearchHit; index: number }[]>();
    hits.forEach((hit, i) => byFile.set(hit.path, [...(byFile.get(hit.path) ?? []), { hit, index: i }]));
    return [...byFile.entries()];
  }, [hits]);

  const choose = (i: number) => {
    const hit = hits[i];
    if (!hit) return;
    // Rank of the occurrence in its note, so the note opens on the right one.
    const occurrence = hits.slice(0, i).filter((h) => h.path === hit.path).length;
    onOpen(hit, occurrence, query);
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal switcher vault-search" onMouseDown={(e) => e.stopPropagation()}>
        <div className="vault-search-field">
          <input
            autoFocus
            placeholder="Rechercher dans toutes les notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, hits.length - 1));
              else if (e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
              else if (e.key === "Enter") choose(index);
              else if (e.key === "Escape") onClose();
              else return;
              e.preventDefault();
            }}
            spellCheck={false}
          />
          <button className={caseSensitive ? "find-option active" : "find-option"} onClick={() => setCaseSensitive(!caseSensitive)} title="Respecter la casse" aria-pressed={caseSensitive}>
            Aa
          </button>
        </div>
        <div className="search-summary">
          {searching ? "Recherche…" : query.trim() ? `${hits.length >= SEARCH_LIMIT ? `${SEARCH_LIMIT}+` : hits.length} résultat${hits.length > 1 ? "s" : ""} dans ${groups.length} note${groups.length > 1 ? "s" : ""}` : ""}
        </div>
        <div ref={list} className="switcher-list search-results">
          {groups.map(([path, entries]) => (
            <section key={path}>
              <header>
                <span className="switcher-title">{noteTitle(path)}</span>
                <span className="switcher-folder">{path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""}</span>
              </header>
              {entries.map(({ hit, index: i }) => (
                <div key={i} className={i === index ? "search-hit active" : "search-hit"} onMouseEnter={() => setIndex(i)} onMouseDown={() => choose(i)}>
                  <span className="search-line">{hit.line + 1}</span>
                  <Excerpt hit={hit} query={query} caseSensitive={caseSensitive} />
                </div>
              ))}
            </section>
          ))}
          {!searching && query.trim() && hits.length === 0 && <div className="switcher-empty">Aucun résultat.</div>}
        </div>
      </div>
    </div>
  );
}

/** The line around the match, the match itself highlighted. */
function Excerpt({ hit, query, caseSensitive }: { hit: SearchHit; query: string; caseSensitive: boolean }) {
  const [from, to] = hit.to > hit.from ? [hit.from, hit.to] : (matchesIn(hit.text, query, caseSensitive)[0] ?? [0, 0]);
  const start = Math.max(0, from - 40);
  const before = (start > 0 ? "…" : "") + hit.text.slice(start, from).trimStart();
  const after = hit.text.slice(to, to + 120);
  return (
    <span className="search-excerpt">
      {before}
      <mark>{hit.text.slice(from, to)}</mark>
      {after}
    </span>
  );
}
