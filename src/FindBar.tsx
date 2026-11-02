import { useEffect, useReducer, useRef, useState } from "react";
import { keys } from "./keys";
import type { Editor } from "@tiptap/core";
import { clearFind, findKey, findState, findStep, replaceAll, replaceCurrent, reveal, selectCurrent, setFindQuery } from "./editor/find";
import { Icon } from "./Icon";

export interface FindRequest {
  query: string;
  replace?: boolean;
  /** Jump to this occurrence (opened from the vault search). */
  occurrence?: number;
  /** Changes on every request, so the same query can be asked again. */
  nonce: number;
}

/** What the find bar searches: the note's editor, or the raw Markdown. */
export interface FindTarget {
  /** Shows the matches of `query` (none when empty); `occurrence` makes that one current and goes to it. */
  search(query: string, caseSensitive: boolean, occurrence?: number): void;
  counts(): { total: number; current: number };
  step(direction: 1 | -1): void;
  replaceCurrent(text: string): void;
  replaceAll(text: string): void;
  /** Hides the matches and gives the focus back to the text; with `select`, the current match is selected. */
  close(select: boolean): void;
  editable(): boolean;
  /** Calls `listener` after every change (edits, steps); returns what stops it and hides the matches. */
  subscribe(listener: () => void): () => void;
}

/** The find bar on the note's editor (matches drawn as decorations). */
export function editorFindTarget(editor: Editor): FindTarget {
  const { view } = editor;
  return {
    search(query, caseSensitive, occurrence) {
      setFindQuery(view, query, caseSensitive);
      if (occurrence === undefined) return;
      const { matches } = findState(view.state);
      const target = Math.min(occurrence, matches.length - 1);
      if (target >= 0) view.dispatch(view.state.tr.setMeta(findKey, { current: target }).setMeta("addToHistory", false));
      // Opening the note sets its scroll position on the next frames (top, or where its tab was): go to the match after
      // that, at once (a smooth scroll is cut short while the page is still being laid out).
      requestAnimationFrame(() => requestAnimationFrame(() => !editor.isDestroyed && reveal(view, true)));
    },
    counts() {
      const { matches, current } = findState(view.state);
      return { total: matches.length, current };
    },
    step: (direction) => findStep(view, direction),
    replaceCurrent: (text) => replaceCurrent(view, text),
    replaceAll: (text) => void replaceAll(view, text),
    close(select) {
      if (editor.isDestroyed) return;
      if (select) selectCurrent(view);
      clearFind(view);
      view.focus();
    },
    editable: () => editor.isEditable,
    subscribe(listener) {
      editor.on("transaction", listener);
      return () => {
        editor.off("transaction", listener);
        if (!editor.isDestroyed) clearFind(view);
      };
    },
  };
}

/** ⌘F: find (and replace with ⌘⌥F) in the open note, rendered or raw. */
export function FindBar({ target, request, onClose }: { target: FindTarget | null; request: FindRequest; onClose: () => void }) {
  const [query, setQuery] = useState(request.query);
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(Boolean(request.replace));
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const input = useRef<HTMLInputElement>(null);

  // A new request (⌘F again, or a vault search result) refocuses the field.
  useEffect(() => {
    setQuery(request.query);
    if (request.replace) setShowReplace(true);
    input.current?.focus();
    input.current?.select();
  }, [request.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!target) return;
    target.search(query, caseSensitive, request.occurrence !== undefined && query === request.query ? request.occurrence : undefined);
    rerender();
  }, [target, query, caseSensitive, request.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Counter follows edits made while the bar is open.
  useEffect(() => target?.subscribe(rerender), [target]);

  const close = (select: boolean) => {
    target?.close(select);
    onClose();
  };

  const counts = target?.counts();
  const total = counts?.total ?? 0;
  const editable = target?.editable() ?? false;
  const step = (direction: 1 | -1) => target?.step(direction);

  return (
    <div className="find-bar-anchor">
      <div className="find-bar" role="search" onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), close(true))}>
        <div className="find-row">
          <button className="find-toggle" onClick={() => setShowReplace(!showReplace)} aria-label="Remplacer" aria-expanded={showReplace} title={keys("Remplacer (⌘⌥F)")}>
            <Icon name={showReplace ? "chevronDown" : "chevronRight"} size={12} />
          </button>
          <input
            ref={input}
            value={query}
            placeholder="Rechercher dans la note"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              step(e.shiftKey ? -1 : 1);
            }}
            spellCheck={false}
          />
          <div className="find-actions">
            <span className="find-count">{query ? (total ? `${(counts?.current ?? 0) + 1}/${total}` : "0") : ""}</span>
            <button className={caseSensitive ? "find-option active" : "find-option"} onClick={() => setCaseSensitive(!caseSensitive)} title="Respecter la casse" aria-pressed={caseSensitive}>
              Aa
            </button>
            <button onClick={() => step(-1)} disabled={!total} aria-label="Précédent (⇧↵)">
              <Icon name="chevronUp" size={12} />
            </button>
            <button onClick={() => step(1)} disabled={!total} aria-label="Suivant (↵)">
              <Icon name="chevronDown" size={12} />
            </button>
            <button onClick={() => close(false)} aria-label="Fermer (Échap)">
              <Icon name="close" size={12} />
            </button>
          </div>
        </div>
        {showReplace && (
          <div className="find-row">
            <span className="find-toggle-spacer" />
            <input
              value={replacement}
              placeholder="Remplacer par"
              onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !target) return;
                e.preventDefault();
                if (e.metaKey || e.ctrlKey) target.replaceAll(replacement);
                else target.replaceCurrent(replacement);
              }}
              readOnly={!editable}
              spellCheck={false}
            />
            <div className="find-actions">
              <button className="find-text" onClick={() => target?.replaceCurrent(replacement)} disabled={!total || !editable} title="Remplacer (↵)">
                Remplacer
              </button>
              <button className="find-text" onClick={() => target?.replaceAll(replacement)} disabled={!total || !editable} title={keys("Tout remplacer (⌘↵)")}>
                Tout
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
