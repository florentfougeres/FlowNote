import { Fragment, Slice, type Node } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { parseFragment } from "../markdown/parse";

/** The pasted content's only text block, through single-child wrappers (a list of one item, a quote), or null. */
function onlyTextblock(content: Fragment): Node | null {
  let node: Node | null = content.childCount === 1 ? content.firstChild : null;
  while (node && !node.isTextblock && node.childCount === 1) node = node.firstChild;
  return node?.isTextblock && !node.type.spec.code ? node : null;
}

/**
 * A single block pasted in a line gives only its text (bold, links… kept):
 * the line keeps its kind. A title or a list item copied from a web page, or
 * a `# line` of text, does not turn a paragraph into a heading or a bullet.
 * Several blocks keep theirs.
 */
export function pasteInline(view: EditorView, content: Fragment): boolean {
  const { $from } = view.state.selection;
  const block = onlyTextblock(content);
  if (!block || !$from.parent.isTextblock || $from.parent.type.spec.code) return false;
  view.dispatch(view.state.tr.replaceSelection(new Slice(block.content, 0, 0)).scrollIntoView());
  return true;
}

/**
 * Plain text pasted in a note is read as Markdown, as Obsidian does: a link,
 * an image, a list or a heading copied from a text file becomes one, and the
 * file gets the pasted text. Without this, the text would be inserted as is
 * and saved escaped (`\[texte\]\(…\)`). In a code block, text stays text.
 */
export function pasteMarkdown(view: EditorView, text: string): boolean {
  const { $from } = view.state.selection;
  if (!text || $from.parent.type.spec.code || $from.marks().some((m) => m.type.spec.code)) return false;
  const blocks = parseFragment(text.replace(/\r\n?/g, "\n"));
  if (blocks.length === 0) return false;
  const content = Fragment.fromJSON(view.state.schema, blocks);
  if (pasteInline(view, content)) return true;
  // Open at both ends: the first and last blocks join the lines around the cursor.
  const slice = Slice.maxOpen(content);
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
  return true;
}

/**
 * Markdown inserted as blocks, kept as they are (a template): in place of the
 * empty line holding the cursor, or under the block holding it.
 */
export function insertMarkdownBlocks(view: EditorView, text: string): boolean {
  const blocks = parseFragment(text.replace(/\r\n?/g, "\n"));
  if (blocks.length === 0) return false;
  const content = Fragment.fromJSON(view.state.schema, blocks);
  const { $from } = view.state.selection;
  const top = $from.node(1);
  const start = $from.before(1);
  const tr = view.state.tr;
  if (top.type.name === "paragraph" && top.content.size === 0) tr.replaceWith(start, start + top.nodeSize, content);
  else tr.insert(start + top.nodeSize, content);
  view.dispatch(tr.scrollIntoView());
  return true;
}
