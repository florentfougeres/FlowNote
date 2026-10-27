import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

/**
 * Sections of a note: a top-level heading and the blocks under it, down to the
 * next heading of the same or a higher level. Folded by `headingFold.ts`,
 * moved from the outline panel.
 */

export interface Section {
  /** Position right before the heading. */
  pos: number;
  /** End of its section (position after its last block). */
  end: number;
}

/** The page's title, a first `# heading`: it has no section. */
export const isTitle = (node: PMNode, index: number) => index === 0 && Number(node.attrs.level) === 1;

/** The section of the top-level heading at `pos` (null: not a heading, or the title). */
export function sectionOf(doc: PMNode, pos: number): Section | null {
  if (pos < 0 || pos >= doc.content.size) return null;
  const $pos = doc.resolve(pos);
  const heading = doc.nodeAt(pos);
  if ($pos.depth !== 0 || heading?.type.name !== "heading" || isTitle(heading, $pos.index())) return null;
  const level = Number(heading.attrs.level);
  let end = pos + heading.nodeSize;
  for (let i = $pos.index() + 1; i < doc.childCount; i++) {
    const next = doc.child(i);
    if (next.type.name === "heading" && Number(next.attrs.level) <= level) break;
    end += next.nodeSize;
  }
  return { pos, end };
}

/**
 * Moves the section of the heading at `pos` to `target`, a position between
 * top-level blocks (before another heading, or the end of the note). Null when
 * nothing would move: no section, a target inside it, or above the title.
 * The heading keeps its level; the cursor lands at its start.
 */
export function moveSection(state: EditorState, pos: number, target: number): Transaction | null {
  const { doc } = state;
  const section = sectionOf(doc, pos);
  if (!section || (target >= section.pos && target <= section.end) || target < 0 || target > doc.content.size) return null;
  const $target = doc.resolve(target);
  if ($target.depth !== 0 || ($target.index() === 0 && doc.firstChild && isTitle(doc.firstChild, 0))) return null;
  const slice = doc.slice(section.pos, section.end);
  const tr = state.tr.delete(section.pos, section.end);
  const at = tr.mapping.map(target);
  tr.insert(at, slice.content);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1))).scrollIntoView();
}
