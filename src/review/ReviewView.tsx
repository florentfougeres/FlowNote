import { useCallback, useEffect, useMemo, useState } from "react";
import type { Vault } from "../vault/vault";
import { readAllNotes } from "../vault/vault";
import { noteTitle } from "../vault/links";
import { NoteEditor } from "../editor/NoteEditor";
import type { VaultBridge } from "../editor/bridge";
import { isDue, nextSchedule, noteCards, scheduleOf, withSchedule, type Card, type Response } from "./cards";

const RESPONSES: { response: Response; label: string; key: string }[] = [
  { response: "hard", label: "Difficile", key: "1" },
  { response: "good", label: "Correct", key: "2" },
  { response: "easy", label: "Facile", key: "3" },
];

/** A deck's name as shown: `flashcards/anglais` is "anglais", `flashcards` "Cartes". */
const deckName = (deck: string) => (deck === "flashcards" ? "Cartes" : deck.slice("flashcards/".length));

const days = (n: number) => (n === 1 ? "1 jour" : n < 31 ? `${n} jours` : n < 365 ? `${Math.round(n / 30)} mois` : `${Math.round(n / 365)} an${n >= 730 ? "s" : ""}`);

/** Due cards first (the most late first), then new ones in the notes' order. */
function queueOf(cards: Card[], today: Date): Card[] {
  const due = cards.filter((c) => isDue(c, today));
  return [...due.filter((c) => scheduleOf(c)).sort((a, b) => scheduleOf(a)!.due.localeCompare(scheduleOf(b)!.due)), ...due.filter((c) => !scheduleOf(c))];
}

/** A card's question or answer, drawn like a note (read only); its links resolve from its note. */
function CardText({ text, path, bridge }: { text: string; path: string; bridge: VaultBridge }) {
  const inner = useMemo(() => Object.create(bridge, { notePath: { value: path } }) as VaultBridge, [bridge, path]);
  return <NoteEditor source={text} onMarkdown={() => {}} bridge={inner} editable={false} properties={false} />;
}

/**
 * The "Révisions" view: the flashcards of the vault (Spaced Repetition
 * plugin's format), by deck, then a review session: the question, the answer
 * on demand (space), then Difficile, Correct or Facile (1, 2, 3), which
 * writes the next review date in the note.
 */
export function ReviewView({ vault, files, bridge, onOpenNote }: { vault: Vault; files: string[]; bridge: VaultBridge; onOpenNote: (path: string, newTab: boolean) => void }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [session, setSession] = useState<{ queue: Card[]; index: number; answer: boolean; reviewed: number } | null>(null);
  const [error, setError] = useState("");
  const today = useMemo(() => new Date(), []);

  const load = useCallback(async () => {
    const notes = await readAllNotes(vault, files);
    setCards(notes.flatMap(([path, text]) => noteCards(path, text)));
  }, [vault, files]);
  useEffect(() => {
    void load();
  }, [load]);

  const decks = useMemo(() => {
    const byDeck = new Map<string, Card[]>();
    for (const card of cards ?? []) byDeck.set(card.deck, [...(byDeck.get(card.deck) ?? []), card]);
    return [...byDeck]
      .map(([deck, list]) => ({ deck, total: list.length, due: list.filter((c) => isDue(c, today) && scheduleOf(c)).length, fresh: list.filter((c) => !scheduleOf(c)).length }))
      .sort((a, b) => deckName(a.deck).localeCompare(deckName(b.deck), "fr"));
  }, [cards, today]);

  const start = (deck: string | null) => {
    setError("");
    setSession({ queue: queueOf((cards ?? []).filter((c) => deck === null || c.deck === deck), today), index: 0, answer: false, reviewed: 0 });
  };

  const card = session ? session.queue[session.index] : undefined;

  const answer = useCallback(
    async (response: Response) => {
      if (!session || !card) return;
      try {
        // Only the card's review comment changes; refused if the note changed meanwhile.
        const text = await vault.read(card.path);
        const next = withSchedule(text, card, nextSchedule(response, scheduleOf(card), today));
        if (next === null) throw new Error(`${noteTitle(card.path)} a changé : la carte n'est plus à sa place.`);
        await vault.write(card.path, next, text);
        setError("");
        setSession({ ...session, index: session.index + 1, answer: false, reviewed: session.reviewed + 1 });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [session, card, vault, today],
  );

  // Space or ↵ shows the answer, then 1, 2, 3 answer.
  useEffect(() => {
    if (!session || !card) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
      if (!session.answer && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
        setSession({ ...session, answer: true });
      } else if (session.answer) {
        const chosen = RESPONSES.find((r) => r.key === event.key);
        if (chosen) {
          event.preventDefault();
          void answer(chosen.response);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, card, answer]);

  if (cards === null) return null;

  if (session) {
    const back = () => {
      setSession(null);
      void load();
    };
    if (!card) {
      return (
        <div className="review-view">
          <div className="review-done">
            <h1>Révision terminée</h1>
            <p>
              {session.reviewed === 0
                ? "Aucune carte à revoir pour l'instant."
                : `${session.reviewed} carte${session.reviewed > 1 ? "s" : ""} revue${session.reviewed > 1 ? "s" : ""}. Les prochaines dates sont écrites dans les notes.`}
            </p>
            <button type="button" className="review-primary" onClick={back}>
              Retour aux paquets
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="review-view">
        <header className="review-header">
          <button type="button" className="review-back" onClick={back}>
            ← Paquets
          </button>
          <span className="review-progress">
            {session.index + 1} / {session.queue.length}
          </span>
          <button type="button" className="review-source" onClick={(e) => onOpenNote(card.path, e.metaKey || e.ctrlKey)} title="Ouvrir la note (⌘-clic : dans un nouvel onglet)">
            {noteTitle(card.path)}
          </button>
        </header>
        <div className="review-card">
          <CardText key={`${card.path}:${card.from}:${card.side}:front`} text={card.front} path={card.path} bridge={bridge} />
          {session.answer && (
            <>
              <hr />
              <CardText key={`${card.path}:${card.from}:${card.side}:back`} text={card.back} path={card.path} bridge={bridge} />
            </>
          )}
        </div>
        {error && <p className="review-error">{error}</p>}
        <div className="review-actions">
          {session.answer ? (
            RESPONSES.map(({ response, label, key }) => (
              <button key={response} type="button" className={`review-response ${response}`} onClick={() => void answer(response)}>
                <span>{label}</span>
                <small>
                  {days(nextSchedule(response, scheduleOf(card), today).interval)} · <kbd>{key}</kbd>
                </small>
              </button>
            ))
          ) : (
            <button type="button" className="review-primary" onClick={() => setSession({ ...session, answer: true })}>
              Afficher la réponse <kbd>espace</kbd>
            </button>
          )}
        </div>
      </div>
    );
  }

  const dueAll = decks.reduce((n, d) => n + d.due + d.fresh, 0);
  return (
    <div className="review-view">
      <h1>Révisions</h1>
      {decks.length === 0 ? (
        <div className="review-empty">
          <p>Aucune carte de révision dans ce vault.</p>
          <p>
            Ajoutez le tag <code>#flashcards</code> à une note, puis écrivez une carte par ligne, <code>Question::Réponse</code> (<code>:::</code> pour la réviser dans les deux sens), ou sur plusieurs lignes : la question, une
            ligne <code>?</code>, puis la réponse.
          </p>
        </div>
      ) : (
        <>
          <ul className="review-decks">
            {decks.map((d) => (
              <li key={d.deck}>
                <button type="button" onClick={() => start(d.deck)} disabled={d.due + d.fresh === 0}>
                  <span className="review-deck-name">{deckName(d.deck)}</span>
                  <span className="review-count due" title="À revoir aujourd'hui">
                    {d.due}
                  </span>
                  <span className="review-count new" title="Nouvelles">
                    {d.fresh}
                  </span>
                  <span className="review-count" title="En tout">
                    {d.total}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="review-legend">
            <span className="review-count due">à revoir</span> <span className="review-count new">nouvelles</span> <span className="review-count">en tout</span>
          </p>
          <button type="button" className="review-primary" disabled={dueAll === 0} onClick={() => start(null)}>
            {dueAll === 0 ? "Rien à revoir aujourd'hui" : `Tout réviser (${dueAll})`}
          </button>
        </>
      )}
    </div>
  );
}
