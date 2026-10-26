import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Foldable headings, like Obsidian's: an arrow left of a heading (shown on
 * hover, kept while folded) hides its section, the blocks down to the next
 * heading of the same or a higher level. Only the display changes: the file
 * is untouched and the folds are forgotten when the note is closed. The
 * page's title (a first `# heading`) is not foldable. A cursor landing in a
 * folded section (search, undo) unfolds it.
 */

const key = new PluginKey<FoldState>("headingFold");

interface Section {
  /** Position right before the heading. */
  pos: number;
  /** End of its section (position after its last block). */
  end: number;
}

/** The top-level headings with something under them, and the extent of their sections. */
function sections(doc: PMNode): Section[] {
  const headings: { pos: number; level: number; size: number }[] = [];
  doc.forEach((node, pos, index) => {
    if (node.type.name === "heading" && !(index === 0 && Number(node.attrs.level) === 1)) headings.push({ pos, level: Number(node.attrs.level), size: node.nodeSize });
  });
  return headings.flatMap((h, i) => {
    const next = headings.slice(i + 1).find((other) => other.level <= h.level);
    const end = next ? next.pos : doc.content.size;
    return end > h.pos + h.size ? [{ pos: h.pos, end }] : [];
  });
}

function arrow(folded: boolean): HTMLElement {
  const button = document.createElement("button");
  button.className = "heading-fold";
  button.type = "button";
  button.tabIndex = -1;
  button.contentEditable = "false";
  button.title = folded ? "Déplier la section" : "Replier la section";
  button.setAttribute("aria-label", button.title);
  button.setAttribute("aria-expanded", String(!folded));
  return button;
}

function decorations(state: EditorState, folded: number[]): DecorationSet {
  const decos: Decoration[] = [];
  for (const section of sections(state.doc)) {
    const isFolded = folded.includes(section.pos);
    const headingEnd = section.pos + state.doc.nodeAt(section.pos)!.nodeSize;
    decos.push(Decoration.node(section.pos, headingEnd, { class: isFolded ? "foldable folded" : "foldable" }));
    decos.push(Decoration.widget(section.pos + 1, () => arrow(isFolded), { side: -1, key: `fold-${isFolded}`, ignoreSelection: true }));
    if (!isFolded) continue;
    state.doc.nodesBetween(headingEnd, section.end, (node, pos) => {
      decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "fold-hidden" }));
      return false;
    });
  }
  return DecorationSet.create(state.doc, decos);
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

/** Whether a change may alter the sections: it touches a top-level heading (before or after), or adds or removes top-level blocks. */
function changesSections(tr: Transaction): boolean {
  if (tr.before.childCount !== tr.doc.childCount) return true;
  const headingIn = (doc: PMNode, from: number, to: number) => {
    let found = false;
    doc.nodesBetween(Math.max(0, Math.min(from, doc.content.size)), Math.max(0, Math.min(to, doc.content.size)), (node) => {
      if (node.type.name === "heading") found = true;
      return false;
    });
    return found;
  };
  return tr.mapping.maps.some((map, i) => {
    const before = tr.mapping.slice(0, i).invert();
    const after = tr.mapping.slice(i + 1);
    let touched = false;
    map.forEach((oldStart, oldEnd, newStart, newEnd) => {
      touched ||= headingIn(tr.before, before.map(oldStart, -1), before.map(oldEnd, 1)) || headingIn(tr.doc, after.map(newStart, -1), after.map(newEnd, 1));
    });
    return touched;
  });
}

export function headingFoldPlugin(): Plugin<FoldState> {
  return new Plugin<FoldState>({
    key,
    state: {
      init: (_config, state) => ({ folded: [], decorations: decorations(state, []) }),
      apply(tr, value, _old, state) {
        const toggled = tr.getMeta(key) as number | undefined;
        const head = state.selection.head;
        const mapped = value.folded.map((p) => tr.mapping.map(p, 1));
        const insideFolded = tr.selectionSet && mapped.length > 0 && sections(state.doc).some((s) => mapped.includes(s.pos) && head > s.pos + state.doc.nodeAt(s.pos)!.nodeSize && head < s.end);
        if (toggled === undefined && !insideFolded && (!tr.docChanged || !changesSections(tr))) {
          // Typing in a paragraph: the arrows and hidden blocks just move.
          return tr.docChanged ? { folded: mapped, decorations: value.decorations.map(tr.mapping, tr.doc) } : value;
        }
        let folded = value.folded.map((p) => tr.mapping.mapResult(p, 1)).flatMap((r) => (r.deleted ? [] : [r.pos]));
        if (toggled !== undefined) folded = folded.includes(toggled) ? folded.filter((p) => p !== toggled) : [...folded, toggled];
        // Only headings with a section stay folded; a cursor moved inside a folded section opens it.
        folded = sections(state.doc)
          .filter((s) => folded.includes(s.pos))
          .filter((s) => !(tr.selectionSet && head > s.pos + state.doc.nodeAt(s.pos)!.nodeSize && head < s.end))
          .map((s) => s.pos);
        return { folded, decorations: decorations(state, folded) };
      },
    },
    props: {
      decorations: (state) => key.getState(state)?.decorations,
      handleDOMEvents: {
        mousedown(view, event) {
          const button = (event.target as HTMLElement).closest(".heading-fold");
          if (!button) return false;
          event.preventDefault();
          const pos = view.posAtDOM(button, 0) - 1;
          if (view.state.doc.nodeAt(pos)?.type.name === "heading") view.dispatch(toggleFold(view.state, pos));
          return true;
        },
      },
    },
  });
}
