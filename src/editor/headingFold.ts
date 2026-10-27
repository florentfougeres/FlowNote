import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { sectionOf, type Section } from "./sections";

/**
 * Foldable headings, like Obsidian's: an arrow left of a heading (shown on
 * hover, kept while folded) hides its section, the blocks down to the next
 * heading of the same or a higher level. Only the display changes: the file
 * is untouched and the folds are forgotten when the note is closed. The
 * page's title (a first `# heading`) is not foldable. A cursor landing in a
 * folded section (search, undo) unfolds it.
 *
 * The arrow is drawn by CSS on every heading (`::before`, editor.css), not as
 * a decoration: a long note has thousands of headings, and decorating each one
 * made every keystroke slow. Only folded sections are decorated.
 */

const key = new PluginKey<FoldState>("headingFold");

/** The section of the top-level heading at `pos`, if there is something under it to fold. */
function sectionAt(doc: PMNode, pos: number): Section | null {
  const section = sectionOf(doc, pos);
  return section && section.end > pos + doc.nodeAt(pos)!.nodeSize ? section : null;
}

function decorations(doc: PMNode, folded: number[]): DecorationSet {
  if (folded.length === 0) return DecorationSet.empty;
  const decos: Decoration[] = [];
  for (const pos of folded) {
    const section = sectionAt(doc, pos);
    if (!section) continue;
    const headingEnd = pos + doc.nodeAt(pos)!.nodeSize;
    decos.push(Decoration.node(pos, headingEnd, { class: "folded" }));
    doc.nodesBetween(headingEnd, section.end, (node, at) => {
      decos.push(Decoration.node(at, at + node.nodeSize, { class: "fold-hidden" }));
      return false;
    });
  }
  return DecorationSet.create(doc, decos);
}

/** Folds or unfolds the heading right after `pos`. */
export function toggleFold(state: EditorState, pos: number) {
  return state.tr.setMeta(key, pos);
}

interface FoldState {
  /** Positions of the folded headings. */
  folded: number[];
  decorations: DecorationSet;
}

export function headingFoldPlugin(): Plugin<FoldState> {
  return new Plugin<FoldState>({
    key,
    state: {
      init: () => ({ folded: [], decorations: DecorationSet.empty }),
      apply(tr: Transaction, value, _old, state) {
        const toggled = tr.getMeta(key) as number | undefined;
        // Nothing folded: nothing to follow, typing costs nothing.
        if (toggled === undefined && value.folded.length === 0) return value;
        let folded = value.folded.map((p) => tr.mapping.mapResult(p, 1)).flatMap((r) => (r.deleted ? [] : [r.pos]));
        if (toggled !== undefined && sectionAt(state.doc, toggled)) folded = folded.includes(toggled) ? folded.filter((p) => p !== toggled) : [...folded, toggled];
        // Only headings with a section stay folded; a cursor moved inside a folded section opens it.
        const head = state.selection.head;
        folded = folded.filter((p) => {
          const section = sectionAt(state.doc, p);
          return section !== null && !(tr.selectionSet && head > p + state.doc.nodeAt(p)!.nodeSize && head < section.end);
        });
        return { folded, decorations: decorations(state.doc, folded) };
      },
    },
    props: {
      decorations: (state) => key.getState(state)?.decorations,
      handleDOMEvents: {
        // A press in the arrow, left of a top-level heading.
        mousedown(view, event) {
          const heading = (event.target as HTMLElement).closest("h1, h2, h3, h4, h5, h6");
          if (!heading || heading.parentElement !== view.dom || event.clientX >= heading.getBoundingClientRect().left) return false;
          const pos = view.posAtDOM(heading, 0) - 1;
          if (!sectionAt(view.state.doc, pos)) return false;
          event.preventDefault();
          view.dispatch(toggleFold(view.state, pos));
          return true;
        },
      },
    },
  });
}
