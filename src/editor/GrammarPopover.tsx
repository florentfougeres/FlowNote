import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { addToDictionary, applySuggestion, grammarPopover, ignoreError } from "./grammar";

/** Message and suggestions of the clicked grammar or spelling error. */
export function GrammarPopover() {
  const request = useSyncExternalStore(
    (listener) => grammarPopover.subscribe(listener),
    () => grammarPopover.state,
  );

  useEffect(() => {
    if (!request) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !(event.target instanceof Element && event.target.closest(".grammar-popover"))) grammarPopover.open(null);
    };
    const onEdit = () => grammarPopover.open(null);
    document.addEventListener("mousedown", close, true);
    document.addEventListener("keydown", close, true);
    request.view.dom.addEventListener("input", onEdit);
    return () => {
      document.removeEventListener("mousedown", close, true);
      document.removeEventListener("keydown", close, true);
      request.view.dom.removeEventListener("input", onEdit);
    };
  }, [request]);

  if (!request) return null;
  const { placed, view, x, y } = request;
  const word = placed.text.slice(placed.error.start, placed.error.end);
  const done = (action: () => void) => () => {
    grammarPopover.open(null);
    action();
  };

  return createPortal(
    <div className={`block-menu grammar-popover ${placed.kind}`} style={{ left: Math.min(x, window.innerWidth - 300), top: Math.min(y, window.innerHeight - 220) }}>
      <div className="grammar-message">{placed.kind === "spelling" ? `Mot inconnu : « ${word} »` : placed.error.message}</div>
      {placed.error.suggestions.length > 0 && (
        <div className="grammar-suggestions">
          {placed.error.suggestions.slice(0, 6).map((suggestion) => (
            <button key={suggestion} className="grammar-suggestion" onClick={done(() => applySuggestion(view, placed, suggestion))}>
              {suggestion}
            </button>
          ))}
        </div>
      )}
      <div className="block-menu-sub">
        <button onClick={done(() => ignoreError(placed))}>Ignorer</button>
        {placed.kind === "spelling" && <button onClick={done(() => addToDictionary(word))}>Ajouter « {word} » au dictionnaire</button>}
      </div>
    </div>,
    document.body,
  );
}
