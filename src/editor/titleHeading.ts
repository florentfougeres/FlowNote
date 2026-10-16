import type { Node as PMNode } from "@tiptap/pm/model";
import { AllSelection, Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * A note's title is its first `# heading`, like a document's: the page shows
 * it in place of the file name, and changing the title writes that line only
 * (added at the top when missing): the file keeps its name. In the editor the
 * heading is hidden and the cursor never enters it.
 */

/** The first block, when it is a level-1 heading. */
function titleNode(doc: PMNode): PMNode | null {
  const first = doc.firstChild;
  return first?.type.name === "heading" && Number(first.attrs.level) === 1 ? first : null;
}

/** Text shown for an inline leaf (a wiki link shows its alias or target). */
function leafText(leaf: PMNode): string {
  if (leaf.type.name === "wikilink") return String(leaf.attrs.alias ?? leaf.attrs.target);
  return leaf.textContent;
}

/** The note's title from its first `# heading`, or null (the title is then the file name). */
export function titleHeadingOf(doc: PMNode): string | null {
  const node = titleNode(doc);
  if (!node) return null;
  const text = node.textBetween(0, node.content.size, "", leafText).trim();
  return text || null;
}

/** Writes the title heading (added at the top when missing); null when the title is empty or unchanged. */
export function setTitleHeading(state: EditorState, title: string): Transaction | null {
  const node = titleNode(state.doc);
  const text = title.trim();
  if (!text || text === titleHeadingOf(state.doc)) return null;
  if (!node) return state.tr.insert(0, state.schema.nodes.heading.create({ level: 1 }, state.schema.text(text)));
  return state.tr.replaceWith(1, 1 + node.content.size, state.schema.text(text));
}

/** The first place to write after a title heading, if there is one. */
export function afterTitleHeading(doc: PMNode): Selection | undefined {
  const node = titleHeadingOf(doc) !== null ? titleNode(doc) : null;
  return node ? (TextSelection.findFrom(doc.resolve(node.nodeSize), 1) ?? undefined) : undefined;
}

const key = new PluginKey("titleHeading");

/** Hides the title heading and keeps the cursor out of it, when `enabled` (pages showing a title). */
export function titleHeadingPlugin(enabled: { current: boolean }): Plugin {
  const hidden = (state: EditorState) => (enabled.current && titleHeadingOf(state.doc) !== null ? titleNode(state.doc) : null);
  return new Plugin({
    key,
    props: {
      decorations: (state) => {
        const node = hidden(state);
        return node ? DecorationSet.create(state.doc, [Decoration.node(0, node.nodeSize, { class: "title-heading" })]) : null;
      },
      handleKeyDown: (view, event) => {
        // Backspace at the start of the first visible block would merge it into the title.
        const node = hidden(view.state);
        const { $from, empty } = view.state.selection;
        if (!node || event.key !== "Backspace" || !empty || $from.depth !== 1 || $from.parentOffset !== 0) return false;
        return $from.before(1) === node.nodeSize;
      },
    },
    appendTransaction: (_transactions, _old, state) => {
      const node = hidden(state);
      const { selection } = state;
      if (!node || selection instanceof AllSelection || selection.from >= node.nodeSize) return null;
      const tr = state.tr;
      // A note holding only its title: a line to write in, under it.
      if (state.doc.childCount === 1) tr.insert(node.nodeSize, state.schema.nodes.paragraph.create());
      const target = TextSelection.findFrom(tr.doc.resolve(node.nodeSize), 1);
      if (!target) return null;
      return tr.setSelection(selection.to <= node.nodeSize ? target : TextSelection.create(tr.doc, target.from, selection.to));
    },
  });
}
