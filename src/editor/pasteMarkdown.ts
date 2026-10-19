import { Fragment, Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { parseFragment } from "../markdown/parse";

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
  // Open at both ends: a single paragraph goes inline, into the one holding the cursor.
  const slice = Slice.maxOpen(Fragment.fromJSON(view.state.schema, blocks));
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
  return true;
}
