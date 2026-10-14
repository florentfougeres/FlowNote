import { useEffect, useMemo, useRef, useState } from "react";
import { loadEmojis, searchEmojis, type EmojiEntry } from "./editor/emoji";

/** Emojibase groups shown in the picker, in order (2 is skin tones, never shown). */
const GROUPS: [number, string][] = [
  [0, "Smileys et émotions"],
  [1, "Personnes"],
  [3, "Animaux et nature"],
  [4, "Nourriture et boissons"],
  [5, "Voyages et lieux"],
  [6, "Activités"],
  [7, "Objets"],
  [8, "Symboles"],
  [9, "Drapeaux"],
];

/**
 * Emoji picker for the page icon, like Notion's: a search field (French names
 * and :shortcodes:), every emoji by category, a random pick and "Retirer".
 */
export function IconPicker({ anchor, current, onPick, onClose }: { anchor: DOMRect; current: string | null; onPick: (emoji: string | null) => void; onClose: () => void }) {
  const [entries, setEntries] = useState<EmojiEntry[]>([]);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadEmojis().then(setEntries);
  }, []);
  useEffect(() => {
    const down = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && onClose();
    window.addEventListener("mousedown", down);
    return () => window.removeEventListener("mousedown", down);
  }, [onClose]);

  const results = useMemo(() => (query.trim() ? searchEmojis(query, entries, 160) : null), [query, entries]);
  const groups = useMemo(() => GROUPS.map(([id, label]) => [label, entries.filter((e) => e.group === id)] as const).filter(([, list]) => list.length > 0), [entries]);
  const pick = (emoji: string) => {
    onPick(emoji);
    onClose();
  };
  const grid = (list: readonly EmojiEntry[]) => (
    <div className="icon-picker-grid">
      {list.map((e) => (
        <button key={e.emoji} className={e.emoji === current ? "selected" : undefined} title={e.label} aria-label={e.label} onClick={() => pick(e.emoji)}>
          {e.emoji}
        </button>
      ))}
    </div>
  );

  return (
    <div
      ref={ref}
      className="icon-picker"
      role="dialog"
      aria-label="Icône de la page"
      style={{ top: anchor.bottom + 6, left: Math.max(8, Math.min(anchor.left, window.innerWidth - 360)) }}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <div className="icon-picker-header">
        <input autoFocus placeholder="Rechercher un emoji" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && results?.[0] && pick(results[0].emoji)} />
        <button title="Emoji au hasard" disabled={entries.length === 0} onClick={() => {
            const pool = entries.filter((e) => e.group === 0 || e.group === 3 || e.group === 4 || e.group === 7);
            pick(pool[Math.floor(Math.random() * pool.length)].emoji);
          }}>
          Au hasard
        </button>
        {current && (
          <button
            onClick={() => {
              onPick(null);
              onClose();
            }}
          >
            Retirer
          </button>
        )}
      </div>
      <div className="icon-picker-body">
        {entries.length === 0 ? (
          <p className="icon-picker-empty">Chargement…</p>
        ) : results ? (
          results.length ? grid(results) : <p className="icon-picker-empty">Aucun emoji</p>
        ) : (
          groups.map(([label, list]) => (
            <section key={label}>
              <h4>{label}</h4>
              {grid(list)}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
