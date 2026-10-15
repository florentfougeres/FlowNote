import { Plugin, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/**
 * Inline code from a backtick, beyond the input rule that closes `code`:
 * - typed over selected text, the text becomes code instead of being replaced;
 * - typed before a word already followed by a backtick, the text between becomes code.
 *
 * On a French Mac keyboard the backtick is a dead key: it arrives through a
 * composition, not as typed text, so the change is made when it ends.
 */

const OBJECT = "￼";

/** Can the text between `from` and `to` (one text block, no code) become code? */
function plainText(state: EditorState, from: number, to: number): string | null {
  const $from = state.doc.resolve(from);
  if (!$from.sameParent(state.doc.resolve(to)) || !$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  const code = state.schema.marks.code;
  if (!code || state.doc.rangeHasMark(from, to, code)) return null;
  const text = state.doc.textBetween(from, to, undefined, OBJECT);
  return text && !text.includes(OBJECT) && !text.includes("\n") ? text : null;
}

/** The selected text becomes inline code; the cursor goes after it. */
export function codeFromSelection(state: EditorState, from: number, to: number): Transaction | null {
  const text = plainText(state, from, to);
  if (text === null || text.includes("`")) return null;
  const tr = state.tr.replaceWith(from, to, state.schema.text(text, [state.schema.marks.code.create()]));
  return tr.setSelection(TextSelection.create(tr.doc, from + text.length)).removeStoredMark(state.schema.marks.code);
}

/**
 * A backtick at `pos` (already typed when `typed`) before text that a backtick
 * closes, on the same line: that text becomes inline code.
 */
export function codeFromFollowing(state: EditorState, pos: number, typed = false): Transaction | null {
  const start = typed ? pos + 1 : pos;
  const $start = state.doc.resolve(start);
  const parent = $start.parent;
  if (!parent.isTextblock || parent.type.spec.code) return null;
  const after = parent.textBetween($start.parentOffset, parent.content.size, undefined, OBJECT);
  const match = /^([^`\s￼][^`￼\n]*?)`/.exec(after);
  if (!match) return null;
  const end = start + match[1].length;
  const text = plainText(state, start, end + 1);
  if (text === null) return null;
  const tr = state.tr.delete(end, end + 1).replaceWith(start, end, state.schema.text(match[1], [state.schema.marks.code.create()]));
  if (typed) tr.delete(pos, pos + 1);
  const cursor = typed ? end - 1 : end;
  return tr.setSelection(TextSelection.create(tr.doc, cursor)).removeStoredMark(state.schema.marks.code);
}

export function backtickPlugin(): Plugin {
  /** Selection when a dead key was pressed: the composition is about to replace it. */
  let pending: { from: number; to: number; text: string } | null = null;

  const afterComposition = (view: EditorView) => {
    const saved = pending;
    pending = null;
    const { state } = view;
    const { $cursor } = state.selection as TextSelection;
    if (!$cursor || state.doc.textBetween($cursor.pos - 1, $cursor.pos) !== "`") return;
    const at = $cursor.pos - 1;
    if (saved && at === saved.from) {
      const tr = state.tr.replaceWith(at, at + 1, state.schema.text(saved.text, [state.schema.marks.code.create()]));
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + saved.text.length)).removeStoredMark(state.schema.marks.code));
      return;
    }
    const tr = codeFromFollowing(state, at, true);
    if (tr) view.dispatch(tr);
  };

  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== "`") return false;
        const tr = from !== to ? codeFromSelection(view.state, from, to) : codeFromFollowing(view.state, from);
        if (!tr) return false;
        view.dispatch(tr);
        return true;
      },
      handleKeyDown(view, event) {
        const { from, to, empty } = view.state.selection;
        if (event.key !== "Dead") return false;
        const text = empty ? null : plainText(view.state, from, to);
        pending = text && !text.includes("`") ? { from, to, text } : null;
        return false;
      },
      handleDOMEvents: {
        compositionend(view) {
          // ProseMirror applies the composed text after this event.
          setTimeout(() => afterComposition(view));
          return false;
        },
      },
    },
  });
}
