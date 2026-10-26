import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { DateField, formatDateValue } from "./DatePicker";
import type { Vault } from "./vault/vault";
import { matchesIn, searchNotes, searchVault, SEARCH_LIMIT, type SearchHit } from "./vault/search";
import { extractFilters, filterChoices, filterLabel, matchesFilters, modifiedPresets, noteFacts, sameFilter, type NoteFacts, type SearchFilter } from "./vault/searchFilters";
import { noteTitle } from "./vault/links";

/** Every note with what the filters look at, read once per opening of the search. */
interface NoteIndex {
  facts: NoteFacts[];
  texts: Map<string, string>;
  /** The vault knows modification dates (otherwise no date filter). */
  dated: boolean;
}

async function loadIndex(vault: Vault): Promise<NoteIndex> {
  const [notes, stats] = await Promise.all([vault.readNotes?.() ?? Promise.resolve([] as [string, string][]), vault.stats?.().catch(() => []) ?? Promise.resolve([])]);
  const mtimes = new Map(stats.map((s) => [s.path, s.mtime]));
  return {
    facts: notes.map(([path, text]) => noteFacts(path, text, mtimes.get(path) ?? null)),
    texts: new Map(notes),
    dated: stats.length > 0,
  };
}

const FILTER_ICONS: Record<SearchFilter["kind"], IconName> = { tag: "hash", folder: "folder", property: "list", modified: "clock" };

/** ⌘⇧F: full-text search in every note of the vault, narrowed by filters. */
export function VaultSearch({
  vault,
  initialQuery,
  initialFilters = [],
  iconOf,
  onOpen,
  onOpenPage,
  onClose,
}: {
  vault: Vault;
  initialQuery: string;
  /** Filters already set (a tag clicked in the sidebar). */
  initialFilters?: SearchFilter[];
  /** Icon of a page: its emoji, or the icon of its kind. */
  iconOf: (path: string) => ReactNode;
  onOpen: (hit: SearchHit, occurrence: number, query: string) => void;
  /** Opens a note found by the filters alone (no text searched). */
  onOpenPage: (path: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilter[]>(initialFilters);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [index, setIndex] = useState(0);
  const [menu, setMenu] = useState(false);
  const [notes, setNotes] = useState<NoteIndex | null>(null);
  const loading = useRef<Promise<NoteIndex> | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const needIndex = filters.length > 0 || menu;
  useEffect(() => {
    if (!needIndex || loading.current) return;
    loading.current = loadIndex(vault);
    void loading.current.then(setNotes, () => setNotes({ facts: [], texts: new Map(), dated: false }));
  }, [needIndex, vault]);

  /** Notes left by the filters, last modified first (null: no filter). */
  const kept = useMemo(() => {
    if (filters.length === 0 || !notes) return null;
    return notes.facts.filter((n) => matchesFilters(n, filters)).sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0) || a.path.localeCompare(b.path, "fr"));
  }, [filters, notes]);

  useEffect(() => {
    let cancelled = false;
    if (!query.trim() || (filters.length > 0 && !kept)) {
      setHits([]);
      setSearching(filters.length > 0 && !kept);
      setIndex(0);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      const found = kept
        ? Promise.resolve(
            searchNotes(
              [...kept].sort((a, b) => a.path.localeCompare(b.path)).map((n): [string, string] => [n.path, notes!.texts.get(n.path) ?? ""]),
              query,
              caseSensitive,
            ),
          )
        : searchVault(vault, query, caseSensitive);
      found
        .then((all) => !cancelled && (setHits(all), setIndex(0)))
        .catch(() => !cancelled && setHits([]))
        .finally(() => !cancelled && setSearching(false));
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [vault, query, caseSensitive, filters.length, kept, notes]);

  useEffect(() => {
    list.current?.querySelector(".search-hit.active, li.active")?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const groups = useMemo(() => {
    const byFile = new Map<string, { hit: SearchHit; index: number }[]>();
    hits.forEach((hit, i) => byFile.set(hit.path, [...(byFile.get(hit.path) ?? []), { hit, index: i }]));
    return [...byFile.entries()];
  }, [hits]);

  /** With filters and no text, the results are the notes themselves. */
  const listing = !query.trim() && kept ? kept : null;
  const count = listing ? listing.length : hits.length;

  const addFilters = (added: SearchFilter[]) => setFilters((current) => [...current, ...added.filter((f) => !current.some((c) => sameFilter(c, f)))]);
  const type = (value: string, complete = false) => {
    const { text, filters: typed } = extractFilters(value, complete);
    if (typed.length) addFilters(typed);
    setQuery(text);
    return typed.length > 0;
  };

  const choose = (i: number) => {
    if (listing) {
      const note = listing[i];
      if (!note) return;
      onOpenPage(note.path);
      onClose();
      return;
    }
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
        <div className="switcher-field">
          <Icon name="search" size={16} />
          <input
            ref={field}
            autoFocus
            placeholder={filters.length ? "Rechercher dans ces notes…" : "Rechercher dans toutes les notes…"}
            value={query}
            onChange={(e) => type(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, count - 1));
              else if (e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
              else if (e.key === "Enter") {
                if (!type(query, true)) choose(index);
              } else if (e.key === "Escape") onClose();
              else if (e.key === "Backspace" && filters.length && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) setFilters(filters.slice(0, -1));
              else return;
              e.preventDefault();
            }}
            spellCheck={false}
          />
          <button className={caseSensitive ? "switcher-option active" : "switcher-option"} onClick={() => setCaseSensitive(!caseSensitive)} title="Respecter la casse" aria-pressed={caseSensitive}>
            Aa
          </button>
        </div>
        <div className="search-filters">
          {filters.map((f, i) => (
            <span key={i} className="search-chip">
              <Icon name={FILTER_ICONS[f.kind]} size={12} />
              {filterLabel(f)}
              <button aria-label={`Retirer le filtre ${filterLabel(f)}`} onClick={() => setFilters(filters.filter((_, j) => j !== i))}>
                <Icon name="close" size={10} />
              </button>
            </span>
          ))}
          <span className="db-popover-anchor">
            <button className="search-add-filter" onClick={() => setMenu(!menu)} aria-expanded={menu}>
              <Icon name="plus" size={12} /> Filtre
            </button>
            {menu && (
              <FilterMenu
                index={notes}
                onAdd={(f) => {
                  addFilters([f]);
                  setMenu(false);
                  field.current?.focus();
                }}
                onClose={() => setMenu(false)}
              />
            )}
          </span>
          {filters.length === 0 && (
            <span className="search-filters-hint">
              ou tapez <code>tag:#projet</code> <code>path:Dossier</code> <code>[statut:fait]</code>
            </span>
          )}
        </div>
        <div ref={list} className="switcher-list search-results">
          {listing ? (
            <ul className="search-notes">
              {listing.map((note, i) => (
                <li key={note.path} className={i === index ? "active" : undefined} onMouseEnter={() => setIndex(i)} onMouseDown={() => choose(i)}>
                  <span className="switcher-icon">{iconOf(note.path)}</span>
                  <span className="switcher-title">{noteTitle(note.path)}</span>
                  <span className="switcher-folder">
                    {note.path.includes("/") ? note.path.slice(0, note.path.lastIndexOf("/")) : ""}
                    {note.mtime !== null && <span className="search-date">{new Date(note.mtime).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            groups.map(([path, entries]) => (
              <section key={path}>
                <header>
                  <span className="switcher-icon">{iconOf(path)}</span>
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
            ))
          )}
          {!searching && (query.trim() || kept) && count === 0 && <div className="switcher-empty">{kept?.length === 0 ? "Aucune note ne correspond à ces filtres." : filters.length ? "Aucun résultat dans ces notes." : "Aucun résultat."}</div>}
        </div>
        <footer className="switcher-footer">
          <span className="name-dialog-hint">
            <kbd>↑↓</kbd> naviguer <kbd>↵</kbd> ouvrir <kbd>esc</kbd> fermer
          </span>
          <span>
            {searching
              ? "Recherche…"
              : listing
                ? `${count} note${count > 1 ? "s" : ""}`
                : query.trim()
                  ? `${hits.length >= SEARCH_LIMIT ? `${SEARCH_LIMIT}+` : hits.length} résultat${hits.length > 1 ? "s" : ""} dans ${groups.length} note${groups.length > 1 ? "s" : ""}`
                  : ""}
          </span>
        </footer>
      </div>
    </div>
  );
}

type Step = "root" | "tag" | "folder" | "property" | "date" | { key: string };

/** "+ Filtre": the kind of filter, then its value among those of the vault. */
function FilterMenu({ index, onAdd, onClose }: { index: NoteIndex | null; onAdd: (filter: SearchFilter) => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>("root");
  const [narrow, setNarrow] = useState("");
  const [period, setPeriod] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const box = useRef<HTMLDivElement>(null);
  const choices = useMemo(() => (index ? filterChoices(index.facts) : null), [index]);

  useEffect(() => {
    // The date picker is a portal: a click there is not a click outside.
    const down = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !(e.target as Element).closest?.(".date-picker") && onClose();
    window.addEventListener("mousedown", down);
    return () => window.removeEventListener("mousedown", down);
  }, [onClose]);

  const go = (next: Step) => {
    setStep(next);
    setNarrow("");
  };
  const matches = (text: string) => text.toLowerCase().includes(narrow.trim().toLowerCase());
  const back = (
    <button onClick={() => go(typeof step === "object" ? "property" : "root")}>
      <Icon name="chevronLeft" size={14} /> {typeof step === "object" ? step.key : "Filtres"}
    </button>
  );
  const search = (placeholder: string) => <input className="db-menu-input" autoFocus placeholder={placeholder} value={narrow} onChange={(e) => setNarrow(e.target.value)} />;

  let body: ReactNode;
  if (!choices) body = <p className="dash-muted">Lecture des notes…</p>;
  else if (step === "root")
    body = (
      <>
        <small>Filtrer par</small>
        <button onClick={() => go("tag")}>
          <Icon name="hash" size={14} /> Tag
        </button>
        <button onClick={() => go("folder")}>
          <Icon name="folder" size={14} /> Dossier
        </button>
        <button onClick={() => go("property")}>
          <Icon name="list" size={14} /> Propriété
        </button>
        {index?.dated && (
          <button onClick={() => go("date")}>
            <Icon name="clock" size={14} /> Date de modification
          </button>
        )}
      </>
    );
  else if (step === "tag") {
    const tags = choices.tags.filter(([t]) => matches(t));
    body = (
      <>
        {back}
        {search("Chercher un tag…")}
        <div className="search-menu-list">
          {tags.map(([tag, n]) => (
            <button key={tag} onClick={() => onAdd({ kind: "tag", tag })}>
              <Icon name="hash" size={14} /> {tag}
              <span className="search-menu-count">{n}</span>
            </button>
          ))}
          {tags.length === 0 && <p className="dash-muted">Aucun tag.</p>}
        </div>
      </>
    );
  } else if (step === "folder") {
    const folders = choices.folders.filter(matches);
    body = (
      <>
        {back}
        {search("Chercher un dossier…")}
        <div className="search-menu-list">
          {folders.map((folder) => (
            <button key={folder} onClick={() => onAdd({ kind: "folder", folder })}>
              <Icon name="folder" size={14} /> {folder}
            </button>
          ))}
          {folders.length === 0 && <p className="dash-muted">Aucun dossier.</p>}
        </div>
      </>
    );
  } else if (step === "property") {
    const keys = [...choices.properties.keys()].filter(matches);
    body = (
      <>
        {back}
        {search("Chercher une propriété…")}
        <div className="search-menu-list">
          {keys.map((key) => (
            <button key={key} onClick={() => go({ key })}>
              <Icon name="list" size={14} /> {key}
              <span className="search-menu-more">
                <Icon name="chevronRight" size={12} />
              </span>
            </button>
          ))}
          {keys.length === 0 && <p className="dash-muted">Aucune propriété.</p>}
        </div>
      </>
    );
  } else if (step === "date") {
    body = (
      <>
        {back}
        {modifiedPresets().map((preset) => (
          <button key={preset.label} onClick={() => onAdd(preset)}>
            <Icon name="clock" size={14} /> {preset.label}
          </button>
        ))}
        <hr />
        <small>Période</small>
        <div className="search-period">
          <span>Du</span>
          <DateField value={period.from} placeholder="Début" onChange={(from) => setPeriod({ ...period, from })} />
          <span>au</span>
          <DateField value={period.to} placeholder="Aujourd'hui" onChange={(to) => setPeriod({ ...period, to })} />
        </div>
        <button
          className="db-menu-primary"
          disabled={!period.from && !period.to}
          onClick={() => {
            const { from, to } = period.from && period.to && period.from > period.to ? { from: period.to, to: period.from } : period;
            const label = from && to ? `Du ${formatDateValue(from)} au ${formatDateValue(to)}` : from ? `Depuis le ${formatDateValue(from)}` : `Jusqu'au ${formatDateValue(to)}`;
            onAdd({ kind: "modified", from, to, label });
          }}
        >
          Appliquer
        </button>
      </>
    );
  } else {
    const { key } = step;
    const values = (choices.properties.get(key) ?? []).filter(matches);
    body = (
      <>
        {back}
        {search("Chercher une valeur…")}
        <div className="search-menu-list">
          <button onClick={() => onAdd({ kind: "property", key, value: null })}>
            <Icon name="check" size={14} /> Est renseignée
          </button>
          {values.map((value) => (
            <button key={value} onClick={() => onAdd({ kind: "property", key, value })}>
              <span className="search-menu-value">{value}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <div ref={box} className="db-popover db-menu search-filter-menu">
      {body}
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
