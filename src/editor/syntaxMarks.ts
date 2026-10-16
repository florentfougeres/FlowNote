import { getMarkRange } from "@tiptap/core";
import { Plugin, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Markdown marks shown around the cursor, to change a heading level or remove
 * inline code without the raw view (like Obsidian's live preview, without
 * ever turning the block back into text):
 * - in a heading, its `##` appear in grey in the margin; at the start of the
 *   heading Backspace removes one (H1 becomes text) and `#` adds one;
 * - in inline code, its backticks appear around it; → at the end steps over
 *   the closing backtick, after which Backspace removes the code (the text
 *   stays), as does Delete before the opening one.
 */

/** The inline code around the cursor (empty selection), with its range. */
export function codeAround(state: EditorState): { from: number; to: number; ticks: number } | null {
  const { selection, schema } = state;
  const code = schema.marks.code;
  if (!selection.empty || !code) return null;
  const range = getMarkRange(selection.$from, code);
  if (!range) return null;
  const mark = state.doc.resolve(range.from + 1).marks().find((m) => m.type === code);
  return { ...range, ticks: Number(mark?.attrs.ticks) || 1 };
}

/** At the end of inline code, has the cursor stepped over the closing backtick? */
function pastCode(state: EditorState): boolean {
  const stored = state.storedMarks;
  return stored !== null && !state.schema.marks.code.isInSet(stored);
}

/** Backspace at the start of a heading: one level less, H1 becoming text. */
export function headingLevelDown(state: EditorState): Transaction | null {
  const { $from, empty } = state.selection;
  const heading = $from.parent;
  if (!empty || heading.type.name !== "heading" || $from.parentOffset !== 0) return null;
  const level = Number(heading.attrs.level);
  const pos = $from.before();
  if (level > 1) return state.tr.setNodeMarkup(pos, undefined, { ...heading.attrs, level: level - 1 });
  return state.tr.setBlockType(pos, pos + heading.nodeSize, state.schema.nodes.paragraph);
}

/** `#` typed at the start of a heading: one level more (up to 6). */
export function headingLevelUp(state: EditorState): Transaction | null {
  const { $from, empty } = state.selection;
  const heading = $from.parent;
  if (!empty || heading.type.name !== "heading" || $from.parentOffset !== 0 || heading.attrs.level >= 6) return null;
  return state.tr.setNodeMarkup($from.before(), undefined, { ...heading.attrs, level: Number(heading.attrs.level) + 1 });
}

/** → at the end of inline code steps over the closing backtick, ← steps back in. */
export function stepOverBacktick(state: EditorState, direction: 1 | -1): Transaction | null {
  const code = codeAround(state);
  if (!code || state.selection.from !== code.to) return null;
  const past = pastCode(state);
  if (direction === 1 && !past) return state.tr.setStoredMarks(state.selection.$from.marks().filter((m) => m.type !== state.schema.marks.code));
  if (direction === -1 && past) return state.tr.setStoredMarks(null);
  return null;
}

/**
 * Backspace after the closing backtick, or Delete before the opening one:
 * the code becomes plain text, the cursor stays.
 */
export function unwrapCode(state: EditorState, key: "Backspace" | "Delete"): Transaction | null {
  const code = codeAround(state);
  if (!code) return null;
  const at = state.selection.from;
  const outsideEnd = key === "Backspace" && at === code.to && pastCode(state);
  const beforeStart = key === "Delete" && at === code.from;
  if (!outsideEnd && !beforeStart) return null;
  return state.tr.removeMark(code.from, code.to, state.schema.marks.code);
}

/** ⌘E in inline code, nothing selected: the whole code becomes plain text. */
export function removeCodeAround(state: EditorState): Transaction | null {
  const code = codeAround(state);
  return code ? state.tr.removeMark(code.from, code.to, state.schema.marks.code) : null;
}

function mark(text: string, className: string): HTMLElement {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  span.setAttribute("aria-hidden", "true");
  span.contentEditable = "false";
  return span;
}

export function syntaxMarksPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const { selection } = state;
        const { $from } = selection;
        const decorations: Decoration[] = [];
        const parent = $from.parent;
        if (parent.type.name === "heading" && $from.sameParent(selection.$to)) {
          const level = Number(parent.attrs.level);
          decorations.push(Decoration.widget($from.start(), () => mark("#".repeat(level), "syntax-mark heading-mark"), { side: -1, key: `h${level}`, ignoreSelection: true }));
        }
        const code = codeAround(state);
        if (code) {
          const ticks = "`".repeat(code.ticks);
          const past = selection.from === code.to && pastCode(state);
          decorations.push(Decoration.widget(code.from, () => mark(ticks, "syntax-mark code-mark"), { side: 1, key: "open", ignoreSelection: true }));
          decorations.push(Decoration.widget(code.to, () => mark(ticks, "syntax-mark code-mark"), { side: past ? -1 : 1, key: past ? "past" : "close", ignoreSelection: true }));
        }
        return decorations.length ? DecorationSet.create(state.doc, decorations) : null;
      },
      handleTextInput(view, from, to, text) {
        if (text !== "#" || from !== to) return false;
        const tr = headingLevelUp(view.state);
        if (!tr) return false;
        view.dispatch(tr);
        return true;
      },
    },
  });
}
