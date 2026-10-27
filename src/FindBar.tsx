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

/** ⌘F: find (and replace with ⌘⌥F) in the open note. */
export function FindBar({ editor, request, onClose }: { editor: Editor | null; request: FindRequest; onClose: () => void }) {
  const [query, setQuery] = useState(request.query);
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(Boolean(request.replace));
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const input = useRef<HTMLInputElement>(null);
  const live = editor && !editor.isDestroyed ? editor : null;

  // A new request (⌘F again, or a vault search result) refocuses the field.
  useEffect(() => {
    setQuery(request.query);
    if (request.replace) setShowReplace(true);
    input.current?.focus();
    input.current?.select();
  }, [request.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!live) return;
    setFindQuery(live.view, query, caseSensitive);
    if (request.occurrence !== undefined && query === request.query) {
      const { matches } = findState(live.state);
      const target = Math.min(request.occurrence, matches.length - 1);
      if (target >= 0) live.view.dispatch(live.state.tr.setMeta(findKey, { current: target }).setMeta("addToHistory", false));
      // Opening the note sets its scroll position on the next frames (top, or where its tab was): go to the match after
      // that, at once (a smooth scroll is cut short while the page is still being laid out).
      requestAnimationFrame(() => requestAnimationFrame(() => !live.isDestroyed && reveal(live.view, true)));
    }
    rerender();
  }, [live, query, caseSensitive, request.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Counter follows edits made while the bar is open.
  useEffect(() => {
    if (!live) return;
    live.on("transaction", rerender);
    return () => {
      live.off("transaction", rerender);
      if (!live.isDestroyed) clearFind(live.view);
    };
  }, [live]);

  const close = (select: boolean) => {
    if (live) {
      if (select) selectCurrent(live.view);
      clearFind(live.view);
      live.view.focus();
    }
    onClose();
  };

  const state = live ? findState(live.state) : null;
  const total = state?.matches.length ?? 0;
  const step = (direction: 1 | -1) => live && findStep(live.view, direction);

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
          <span className="find-count">{query ? (total ? `${(state?.current ?? 0) + 1}/${total}` : "0") : ""}</span>
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
            ×
          </button>
        </div>
        {showReplace && (
          <div className="find-row">
            <span className="find-toggle-spacer" />
            <input
              value={replacement}
              placeholder="Remplacer par"
              onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !live) return;
                e.preventDefault();
                if (e.metaKey || e.ctrlKey) replaceAll(live.view, replacement);
                else replaceCurrent(live.view, replacement);
              }}
              readOnly={live ? !live.isEditable : true}
              spellCheck={false}
            />
            <button className="find-text" onClick={() => live && replaceCurrent(live.view, replacement)} disabled={!total || !live?.isEditable} title="Remplacer (↵)">
              Remplacer
            </button>
            <button className="find-text" onClick={() => live && replaceAll(live.view, replacement)} disabled={!total || !live?.isEditable} title={keys("Tout remplacer (⌘↵)")}>
              Tout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
