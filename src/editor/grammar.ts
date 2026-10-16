import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * French grammar and spelling checking (Grammalecte, run by the desktop app).
 * Errors are decorations only: nothing changes in the note until a suggestion
 * is accepted. Paragraphs are checked after a pause in typing, and only when
 * their text changed (results are cached by text).
 */

export interface GrammarError {
  start: number;
  end: number;
  message?: string;
  word?: string;
  suggestions: string[];
  rule?: string;
}

export interface ParagraphResult {
  grammar: GrammarError[];
  spelling: GrammarError[];
}

export type GrammarChecker = (paragraphs: string[]) => Promise<ParagraphResult[]>;

/** An error placed in the document. */
export interface PlacedError {
  from: number;
  to: number;
  kind: "spelling" | "grammar";
  error: GrammarError;
  text: string;
}

let checker: GrammarChecker | null = null;
let systemSpellcheck = true;
const results = new Map<string, ParagraphResult>();
const pending = new Set<string>();
const views = new Set<EditorView>();
const ignored = new Set<string>();
const DICTIONARY_KEY = "flownote:dictionary";
let dictionary = new Set<string>();
let version = 0;

try {
  dictionary = new Set(JSON.parse(localStorage.getItem(DICTIONARY_KEY) ?? "[]") as string[]);
} catch {
  // empty dictionary
}

/** Turns checking on (desktop app) or off; editors update immediately. */
export function setGrammarChecker(next: GrammarChecker | null) {
  checker = next;
  version++;
  views.forEach(applySpellcheck);
  views.forEach((view) => refresh(view));
  if (next) views.forEach(schedule);
}

/** The system's spell checker (never together with Grammalecte, which would underline twice). */
export function setSystemSpellcheck(on: boolean) {
  systemSpellcheck = on;
  views.forEach(applySpellcheck);
}

/** Never in a read-only editor (reading mode, documentation): nothing to correct there. */
function applySpellcheck(view: EditorView) {
  view.dom.spellcheck = view.editable && systemSpellcheck && !checker;
}

const key = new PluginKey<DecorationSet>("grammar");

function refresh(view: EditorView) {
  if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, "refresh").setMeta("addToHistory", false));
}

function changed() {
  version++;
  views.forEach(refresh);
}

/** "Ignorer": this error, in this sentence, for the session. */
export function ignoreError(placed: PlacedError) {
  ignored.add(ignoreKey(placed.error, placed.text));
  changed();
}

/** Adds the word to the personal dictionary (kept across sessions). */
export function addToDictionary(word: string) {
  dictionary.add(word);
  try {
    localStorage.setItem(DICTIONARY_KEY, JSON.stringify([...dictionary]));
  } catch {
    // kept for the session only
  }
  changed();
}

const ignoreKey = (error: GrammarError, text: string) => `${error.rule ?? "spell"}|${text.slice(error.start, error.end)}|${text}`;

/** Text of a block as checked: one character per position (inline atoms become a space). */
function blockText(block: PMNode): { text: string; excluded: [number, number][] } {
  let text = "";
  const excluded: [number, number][] = [];
  block.forEach((child) => {
    const start = text.length;
    if (child.isText) {
      text += child.text!;
      if (child.marks.some((m) => m.type.name === "code" || m.type.spec.code)) excluded.push([start, text.length]);
    } else {
      text += " ".repeat(child.nodeSize);
      excluded.push([start, text.length]);
    }
  });
  // URLs, #tags and :emoji: shortcodes are not prose.
  for (const match of text.matchAll(/https?:\/\/\S+|(?<![\p{L}\p{N}])#[\p{L}\p{N}_/-]+|:[a-z0-9_+-]{2,}:/giu)) excluded.push([match.index, match.index + match[0].length]);
  return { text, excluded };
}

const checkable = (block: PMNode) => block.isTextblock && !block.type.spec.code;
const worthChecking = (text: string) => text.trim().length >= 2 && /\p{L}/u.test(text);

const placedCache = new WeakMap<PMNode, { version: number; errors: Omit<PlacedError, "from" | "to">[]; offsets: [number, number][] }>();

function blockErrors(block: PMNode) {
  const cached = placedCache.get(block);
  if (cached && cached.version === version) return cached;
  const { text, excluded } = blockText(block);
  const result = results.get(text);
  const errors: Omit<PlacedError, "from" | "to">[] = [];
  const offsets: [number, number][] = [];
  if (result) {
    const add = (kind: "spelling" | "grammar", error: GrammarError) => {
      if (error.end <= error.start || excluded.some(([a, b]) => error.start < b && error.end > a)) return;
      if (kind === "spelling" && dictionary.has(text.slice(error.start, error.end))) return;
      if (ignored.has(ignoreKey(error, text))) return;
      errors.push({ kind, error, text });
      offsets.push([error.start, error.end]);
    };
    result.spelling.forEach((e) => add("spelling", e));
    result.grammar.forEach((e) => add("grammar", e));
  }
  const entry = { version, errors, offsets };
  placedCache.set(block, entry);
  return entry;
}

/** Every error currently shown in the document. */
export function placedErrors(doc: PMNode): PlacedError[] {
  const placed: PlacedError[] = [];
  if (!checker) return placed;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (checkable(node)) {
      const { errors, offsets } = blockErrors(node);
      errors.forEach((e, i) => placed.push({ ...e, from: pos + 1 + offsets[i][0], to: pos + 1 + offsets[i][1] }));
    }
    return false;
  });
  return placed;
}

function decorations(state: EditorState): DecorationSet {
  const placed = placedErrors(state.doc);
  if (placed.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    state.doc,
    placed.map((p) => Decoration.inline(p.from, p.to, { class: p.kind === "spelling" ? "gc-error gc-spelling" : "gc-error gc-grammar" }, { placed: p })),
  );
}

const timers = new WeakMap<EditorView, number>();
const BATCH = 40;

/** Checks the blocks whose text has no result yet, after a pause in typing. */
function schedule(view: EditorView) {
  window.clearTimeout(timers.get(view));
  timers.set(
    view,
    window.setTimeout(() => {
      if (!checker || view.isDestroyed) return;
      const texts: string[] = [];
      view.state.doc.descendants((node) => {
        if (!node.isTextblock) return true;
        if (checkable(node)) {
          const { text } = blockText(node);
          if (worthChecking(text) && !results.has(text) && !pending.has(text) && !texts.includes(text)) texts.push(text);
        }
        return false;
      });
      for (let i = 0; i < texts.length; i += BATCH) {
        const batch = texts.slice(i, i + BATCH);
        batch.forEach((t) => pending.add(t));
        const current = checker;
        current(batch)
          .then((found) => {
            batch.forEach((t, j) => found[j] && results.set(t, found[j]));
            changed();
          })
          .catch((error: unknown) => console.warn("Grammalecte :", error))
          .finally(() => batch.forEach((t) => pending.delete(t)));
      }
    }, 700),
  );
}

export interface PopoverRequest {
  x: number;
  y: number;
  placed: PlacedError;
  view: EditorView;
}

class PopoverStore {
  state: PopoverRequest | null = null;
  private listeners = new Set<() => void>();
  open(request: PopoverRequest | null) {
    this.state = request;
    this.listeners.forEach((l) => l());
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
}

export const grammarPopover = new PopoverStore();

/** Replaces the error by a suggestion, if the text there did not change meanwhile. */
export function applySuggestion(view: EditorView, placed: PlacedError, suggestion: string) {
  const current = placedErrors(view.state.doc).find((p) => p.error === placed.error);
  if (!current) return;
  view.dispatch(view.state.tr.insertText(suggestion, current.from, current.to));
  view.focus();
}

export function grammarPlugin(): Plugin {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => decorations(state),
      apply: (tr, set, _old, state) => (tr.docChanged || tr.getMeta(key) ? decorations(state) : set),
    },
    view(view) {
      views.add(view);
      applySpellcheck(view);
      if (checker) schedule(view);
      return {
        update(updated, previous) {
          applySpellcheck(updated);
          if (checker && !updated.state.doc.eq(previous.doc)) schedule(updated);
        },
        destroy() {
          views.delete(view);
          window.clearTimeout(timers.get(view));
        },
      };
    },
    props: {
      decorations: (state) => key.getState(state),
      handleClick(view, pos, event) {
        if (!view.editable) return false;
        const found = key.getState(view.state)?.find(pos, pos);
        const placed = found?.[0]?.spec.placed as PlacedError | undefined;
        if (!placed) return false;
        const target = event.target instanceof Element ? event.target.closest(".gc-error") : null;
        const rect = target?.getBoundingClientRect();
        grammarPopover.open({ x: rect?.left ?? event.clientX, y: (rect?.bottom ?? event.clientY) + 6, placed, view });
        return false;
      },
    },
  });
}
