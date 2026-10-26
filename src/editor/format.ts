import { getMarkRange, type Editor } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";
import { Plugin, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Formatting commands of the selection toolbar (FormatBar.tsx). */

/** The `<u>` mark of the selection, if it has one (underline is written as HTML, Markdown has none). */
function underlineMark(state: EditorState): Mark | null {
  const { from, to, empty, $from } = state.selection;
  const type = state.schema.marks.inlineHtml;
  const marks: Mark[] = [];
  if (empty) marks.push(...$from.marks());
  else state.doc.nodesBetween(from, to, (node) => void marks.push(...node.marks));
  return marks.find((m) => m.type === type && m.attrs.tag === "u") ?? null;
}

export function isUnderlined(state: EditorState): boolean {
  return underlineMark(state) !== null;
}

export function toggleUnderline(editor: Editor) {
  const { state } = editor;
  const { from, to } = state.selection;
  const existing = underlineMark(state);
  const tr = existing ? state.tr.removeMark(from, to, existing) : state.tr.addMark(from, to, state.schema.marks.inlineHtml.create({ tag: "u", open: "<u>" }));
  editor.view.dispatch(tr);
}

/** Formatting removed by the eraser; links stay. */
const FORMATTING = ["bold", "italic", "strike", "highlight", "inlineHtml", "code"];

export function clearFormatting(editor: Editor) {
  const { state } = editor;
  const { from, to } = state.selection;
  const tr = state.tr;
  for (const name of FORMATTING) tr.removeMark(from, to, state.schema.marks[name]);
  editor.view.dispatch(tr);
}

/** The highlight under the cursor or the selection: its range and colour. */
export function highlightAt(state: EditorState): { from: number; to: number; color: string | null } | null {
  const type = state.schema.marks.highlight;
  const { selection } = state;
  if (!selection.empty) {
    let color: string | null | undefined;
    state.doc.nodesBetween(selection.from, selection.to, (node) => {
      const mark = node.marks.find((m) => m.type === type);
      if (mark && color === undefined) color = mark.attrs.color;
    });
    return color === undefined ? null : { from: selection.from, to: selection.to, color };
  }
  // The highlight around the cursor (or right before it, at its end).
  for (const $pos of [selection.$from, state.doc.resolve(Math.max(selection.from - 1, 0))]) {
    const mark = $pos.marks().find((m) => m.type === type) ?? $pos.nodeAfter?.marks.find((m) => m.type === type);
    if (!mark) continue;
    const range = getMarkRange(selection.$from, type, mark.attrs) ?? getMarkRange($pos, type, mark.attrs);
    if (range) return { ...range, color: mark.attrs.color };
  }
  return null;
}

/** Highlights the selection (or recolours the highlight around the cursor); `color` null is the default yellow. */
export function setHighlight(editor: Editor, color: string | null) {
  const { state } = editor;
  const type = state.schema.marks.highlight;
  const target = state.selection.empty ? highlightAt(state) : state.selection;
  if (!target) return;
  editor.view.dispatch(state.tr.removeMark(target.from, target.to, type).addMark(target.from, target.to, type.create({ color })));
}

export function removeHighlight(editor: Editor) {
  const { state } = editor;
  const target = state.selection.empty ? highlightAt(state) : state.selection;
  if (target) editor.view.dispatch(state.tr.removeMark(target.from, target.to, state.schema.marks.highlight));
}

/** Event sent by the pencil to the selection toolbar, which opens the colours under it. */
export const HIGHLIGHT_PENCIL_EVENT = "flownote:highlight-colors";

/**
 * With the cursor in a highlight (nothing selected), a pencil at
 * its start, in the text, opens its colours (FormatBar.tsx).
 */
export function highlightPencilPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        if (!state.selection.empty) return null;
        const highlight = highlightAt(state);
        if (!highlight) return null;
        const widget = Decoration.widget(
          highlight.from,
          (view) => {
            const button = document.createElement("button");
            button.className = "highlight-pencil";
            button.contentEditable = "false";
            button.title = "Couleur du fluo";
            button.setAttribute("aria-label", "Couleur du fluo");
            button.innerHTML = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 2.5l3 3-8 8H2.5v-3z M9 4l3 3"/></svg>';
            button.addEventListener("mousedown", (event) => {
              event.preventDefault();
              view.dom.dispatchEvent(new CustomEvent(HIGHLIGHT_PENCIL_EVENT, { detail: button.getBoundingClientRect() }));
            });
            return button;
          },
          { side: 1, key: "highlight-pencil", ignoreSelection: true },
        );
        return DecorationSet.create(state.doc, [widget]);
      },
    },
  });
}
