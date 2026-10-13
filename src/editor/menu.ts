import type { Range } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import type { SuggestionOptions } from "@tiptap/suggestion";

/** Shared pieces of the suggestion menus (slash commands, links). */

export interface MenuItem {
  key: string;
  title: string;
  description: string;
  icon: string;
}

export interface MenuState<T extends MenuItem = MenuItem> {
  items: T[];
  index: number;
  rect: DOMRect | null;
  heading: string;
  select: (item: T) => void;
}

export class MenuStore<T extends MenuItem = MenuItem> {
  state: MenuState<T> | null = null;
  private listeners = new Set<() => void>();
  set(state: MenuState<T> | null) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
}

/**
 * Position at which a menu was dismissed with Escape, so it does not reopen
 * while the user keeps typing after the trigger.
 */
export function dismissPlugin(key: PluginKey<number | null>): Plugin<number | null> {
  return new Plugin<number | null>({
    key,
    state: {
      init: () => null,
      apply(tr, value) {
        const meta = tr.getMeta(key) as number | null | undefined;
        if (meta !== undefined) return meta;
        if (value === null) return null;
        const mapped = tr.mapping.mapResult(value);
        return mapped.deleted ? null : mapped.pos;
      },
    },
  });
}

export function isDismissed(key: PluginKey<number | null>, state: EditorState, from: number): boolean {
  return key.getState(state) === from;
}

interface RendererOptions<T extends MenuItem> {
  store: MenuStore<T>;
  heading: string;
  /** Closes the menu; receives the range of the trigger and query. */
  close: (range: Range) => void;
  /** Closes the menu after this many letters typed without any result. */
  closeAfterMisses?: number;
}

/** Suggestion renderer feeding a MenuStore, with keyboard navigation. */
export function menuRenderer<T extends MenuItem>({ store, heading, close, closeAfterMisses }: RendererOptions<T>): SuggestionOptions<T, T>["render"] {
  return () => {
    let command: ((item: T) => void) | null = null;
    let lengthAtLastResult = 0;
    let range: Range = { from: 0, to: 0 };
    const show = (props: { items: T[]; query: string; range: Range; clientRect?: (() => DOMRect | null) | null; command: (item: T) => void }) => {
      command = props.command;
      range = props.range;
      if (props.items.length > 0) lengthAtLastResult = props.query.length;
      else if (closeAfterMisses !== undefined && props.query.length - lengthAtLastResult > closeAfterMisses) return void setTimeout(() => close(range));
      store.set({ items: props.items, index: 0, rect: props.clientRect?.() ?? null, heading, select: props.command });
    };
    return {
      onStart: show,
      onUpdate: show,
      onExit: () => store.set(null),
      onKeyDown: ({ event }) => {
        const state = store.state;
        if (event.key === "Escape") {
          close(range);
          return true;
        }
        if (!state || state.items.length === 0) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const delta = event.key === "ArrowDown" ? 1 : -1;
          store.set({ ...state, index: (state.index + delta + state.items.length) % state.items.length });
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          command?.(state.items[state.index]);
          return true;
        }
        return false;
      },
    };
  };
}

export const normalizeText = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
