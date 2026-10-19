import { Plugin, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Inline code from a backtick, beyond the input rule that closes `code`:
 * - typed over selected text, the text becomes code instead of being replaced;
 * - typed before a word already followed by a backtick, the text between becomes code;
 * - typed after a word already preceded by one (the input rule's case, redone
 *   here for the dead key).
 *
 * On a French Mac keyboard the backtick is a dead key: it arrives through a
 * composition (or, in WebKit, sometimes as a plain change of the page), not
 * as typed text. So every change of the document is also looked at once no
 * composition is going on (`codeFromChange`).
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
function codeFromSelection(state: EditorState, from: number, to: number): Transaction | null {
  const text = plainText(state, from, to);
  if (text === null || text.includes("`")) return null;
  const tr = state.tr.replaceWith(from, to, state.schema.text(text, [state.schema.marks.code.create()]));
  return tr.setSelection(TextSelection.create(tr.doc, from + text.length)).removeStoredMark(state.schema.marks.code);
}

/**
 * A backtick at `pos` (already typed when `typed`) before text that a backtick
 * closes, on the same line: that text becomes inline code.
 */
function codeFromFollowing(state: EditorState, pos: number, typed = false): Transaction | null {
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

/** A backtick at `at` (already typed) after text that a backtick opens, on the same line: that text becomes inline code. */
export function codeFromPreceding(state: EditorState, at: number): Transaction | null {
  const $at = state.doc.resolve(at);
  const parent = $at.parent;
  if (!parent.isTextblock || parent.type.spec.code) return null;
  const before = parent.textBetween(0, $at.parentOffset, undefined, OBJECT);
  const match = /(?:^|[^`])`([^`\s￼][^`￼\n]*?)$/.exec(before);
  if (!match) return null;
  const start = at - match[1].length;
  const text = plainText(state, start - 1, at);
  if (text === null) return null;
  const tr = state.tr.delete(at, at + 1).replaceWith(start, at, state.schema.text(match[1], [state.schema.marks.code.create()])).delete(start - 1, start);
  return tr.setSelection(TextSelection.create(tr.doc, at - 1)).removeStoredMark(state.schema.marks.code);
}

/**
 * Code made from a backtick that `before` did not have and `doc` has: the
 * text between it and another backtick, or the text it replaced. Null when the
 * change is not one or two typed characters with a backtick.
 */
function codeFromChange(before: PMNode, state: EditorState): Transaction | null {
  const { doc } = state;
  const start = before.content.findDiffStart(doc.content);
  const end = before.content.findDiffEnd(doc.content);
  if (start == null || !end) return null;
  const endA = Math.max(end.a, start);
  const endB = Math.max(end.b, start);
  if (endB - start < 1 || endB - start > 3) return null;
  const typed = doc.textBetween(start, endB, undefined, OBJECT);
  const at = start + typed.indexOf("`");
  if (at < start) return null;
  const cursor = state.selection.from;
  let tr: Transaction | null = null;
  if (endA > start && typed === "`") {
    // A backtick typed over a selection (a dead key replaces it): that text becomes code.
    const replaced = before.textBetween(start, endA, undefined, OBJECT);
    const $at = doc.resolve(at);
    if (replaced && !/[`\n￼]/.test(replaced) && $at.parent.isTextblock && !$at.parent.type.spec.code) {
      tr = state.tr.replaceWith(at, at + 1, state.schema.text(replaced, [state.schema.marks.code.create()]));
      return tr.setSelection(TextSelection.create(tr.doc, at + replaced.length)).removeStoredMark(state.schema.marks.code);
    }
  }
  tr = codeFromFollowing(state, at, true) ?? codeFromPreceding(state, at);
  if (!tr) return null;
  // The cursor stays where it is, unless it was right after the backtick.
  if (cursor !== at + 1 && state.selection.empty) tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(cursor)));
  return tr;
}

export function backtickPlugin(): Plugin {
  /** The document when last looked at, outside a composition. */
  let baseline: PMNode | null = null;
  /** The next change is a paste or a drop: left as it is. */
  let inserting = false;

  /**
   * Looks at what changed since the last time, once no composition is going
   * on: whatever way the backtick came (key, dead key, input method), a
   * backtick that closes or opens code makes it.
   */
  const check = (view: EditorView) => {
    if (view.composing || view.isDestroyed) return;
    const { doc } = view.state;
    const before = baseline;
    baseline = doc;
    if (!before || before === doc) return;
    if (inserting) {
      inserting = false;
      return;
    }
    const tr = codeFromChange(before, view.state);
    // Not dispatched from inside an update.
    if (tr) void Promise.resolve().then(() => view.state.doc === doc && !view.isDestroyed && view.dispatch(tr));
  };

  return new Plugin({
    view: (view) => {
      baseline = view.state.doc;
      return { update: check };
    },
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== "`") return false;
        const tr = from !== to ? codeFromSelection(view.state, from, to) : codeFromFollowing(view.state, from);
        if (!tr) return false;
        view.dispatch(tr);
        return true;
      },
      // Pasted or dropped text is left as it is.
      handlePaste() {
        inserting = true;
        return false;
      },
      handleDrop() {
        inserting = true;
        return false;
      },
      handleDOMEvents: {
        compositionend(view) {
          // WebKit may end the composition before its text reaches the document.
          setTimeout(() => check(view), 30);
          setTimeout(() => check(view), 120);
          return false;
        },
      },
    },
  });
}
