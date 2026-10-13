import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Find and replace inside the note. Matches are decorations; replacing goes
 * through normal text insertion, so only the edited blocks are re-serialized.
 */

export interface Match {
  from: number;
  to: number;
}

export interface FindState {
  query: string;
  caseSensitive: boolean;
  matches: Match[];
  /** Index of the current match, -1 when there is none. */
  current: number;
}

const EMPTY: FindState = { query: "", caseSensitive: false, matches: [], current: -1 };

export const findKey = new PluginKey<FindState>("find");

/** Inline atoms (wikilinks, images...) take one position: they become one placeholder character. */
function search(doc: PMNode, query: string, caseSensitive: boolean): Match[] {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: Match[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = "";
    node.forEach((child) => (text += child.isText ? child.text! : "￼".repeat(child.nodeSize)));
    const haystack = caseSensitive ? text : text.toLowerCase();
    if (haystack.length !== text.length) return false;
    for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
      matches.push({ from: pos + 1 + at, to: pos + 1 + at + needle.length });
    }
    return false;
  });
  return matches;
}

/** The first match at or after `pos`. */
function nearest(matches: Match[], pos: number): number {
  if (matches.length === 0) return -1;
  const index = matches.findIndex((m) => m.from >= pos);
  return index === -1 ? 0 : index;
}

type Meta = { query: string; caseSensitive: boolean } | { current: number };

export function findPlugin(): Plugin {
  return new Plugin<FindState>({
    key: findKey,
    state: {
      init: () => EMPTY,
      apply(tr, value, _old, state) {
        const meta = tr.getMeta(findKey) as Meta | undefined;
        if (meta && "query" in meta) {
          const matches = search(tr.doc, meta.query, meta.caseSensitive);
          return { query: meta.query, caseSensitive: meta.caseSensitive, matches, current: nearest(matches, state.selection.from) };
        }
        if (meta && "current" in meta) return { ...value, current: meta.current };
        if (tr.docChanged && value.query) {
          const matches = search(tr.doc, value.query, value.caseSensitive);
          const anchor = value.matches[value.current] ? tr.mapping.map(value.matches[value.current].from) : 0;
          return { ...value, matches, current: nearest(matches, anchor) };
        }
        return value;
      },
    },
    props: {
      decorations(state) {
        const { matches, current } = findKey.getState(state) ?? EMPTY;
        if (matches.length === 0) return null;
        return DecorationSet.create(
          state.doc,
          matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === current ? "find-match current" : "find-match" })),
        );
      },
    },
  });
}

export function findState(state: EditorState): FindState {
  return findKey.getState(state) ?? EMPTY;
}

export function setFindQuery(view: EditorView, query: string, caseSensitive: boolean) {
  view.dispatch(view.state.tr.setMeta(findKey, { query, caseSensitive }).setMeta("addToHistory", false));
  reveal(view);
}

/** Scrolls the current match into view without moving the focus out of the find field. */
function reveal(view: EditorView) {
  const { matches, current } = findState(view.state);
  const match = matches[current];
  if (!match) return;
  const dom = view.domAtPos(match.from).node;
  const element = dom instanceof Element ? dom : dom.parentElement;
  element?.scrollIntoView?.({ block: "center", behavior: "smooth" });
}

export function findStep(view: EditorView, direction: 1 | -1) {
  const { matches, current } = findState(view.state);
  if (matches.length === 0) return;
  const next = (current + direction + matches.length) % matches.length;
  view.dispatch(view.state.tr.setMeta(findKey, { current: next }).setMeta("addToHistory", false));
  reveal(view);
}

/** Puts the text cursor on the current match (when the find bar closes). */
export function selectCurrent(view: EditorView) {
  const { matches, current } = findState(view.state);
  const match = matches[current];
  if (match) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)).scrollIntoView());
}

function replaceRange(tr: Transaction, match: Match, text: string) {
  if (text) tr.insertText(text, match.from, match.to);
  else tr.delete(match.from, match.to);
}

export function replaceCurrent(view: EditorView, text: string) {
  const { matches, current } = findState(view.state);
  const match = matches[current];
  if (!match) return;
  const tr = view.state.tr;
  replaceRange(tr, match, text);
  view.dispatch(tr);
  reveal(view);
}

export function replaceAll(view: EditorView, text: string): number {
  const { matches } = findState(view.state);
  if (matches.length === 0) return 0;
  const tr = view.state.tr;
  for (const match of [...matches].reverse()) replaceRange(tr, match, text);
  view.dispatch(tr);
  return matches.length;
}

/** Hides the matches. */
export function clearFind(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(findKey, { query: "", caseSensitive: false }).setMeta("addToHistory", false));
}
