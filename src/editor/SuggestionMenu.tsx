import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { MenuItem, MenuStore } from "./menu";

const MENU_MAX_HEIGHT = 340;

/** Floating menu for a suggestion store (slash commands, links). `blocks`: the block menu, shown as a grid with that setting. */
export function SuggestionMenu<T extends MenuItem>({ store, blocks = false }: { store: MenuStore<T>; blocks?: boolean }) {
  const state = useSyncExternalStore(
    (listener) => {
      const unsubscribe = store.subscribe(listener);
      return () => void unsubscribe();
    },
    () => store.state,
  );
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  }, [state?.index]);

  if (!state || !state.rect || state.items.length === 0) return null;
  const { rect } = state;
  const below = rect.bottom + 6 + MENU_MAX_HEIGHT < window.innerHeight;
  const style = below ? { left: rect.left, top: rect.bottom + 6 } : { left: rect.left, bottom: window.innerHeight - rect.top + 6 };

  return createPortal(
    <div className={blocks ? "slash-menu blocks" : "slash-menu"} style={{ ...style, maxHeight: MENU_MAX_HEIGHT }} ref={list} role="listbox" onMouseDown={(event) => event.preventDefault()}>
      <div className="slash-menu-title">{state.heading}</div>
      {state.items.map((item, i) => (
        <button
          key={item.key}
          className={i === state.index ? "slash-item active" : "slash-item"}
          role="option"
          aria-selected={i === state.index}
          title={blocks ? item.title : undefined}
          onMouseEnter={() => store.set({ ...state, index: i })}
          onMouseDown={(event) => {
            event.preventDefault();
            state.select(item);
          }}
        >
          <span className="slash-icon">{item.icon}</span>
          <span className="slash-text">
            <span className="slash-label">{item.title}</span>
            <span className="slash-description">{item.description}</span>
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
