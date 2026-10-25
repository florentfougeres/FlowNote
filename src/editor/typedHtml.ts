import { Plugin } from "@tiptap/pm/state";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { parseFragment } from "../markdown/parse";
import type { PMJSON } from "../markdown/types";

/**
 * HTML typed in a paragraph (`<h3>Thaïlande</h3>`, `du <u>souligné</u>`) is
 * read as HTML once the cursor leaves the paragraph, as the parser reads it
 * on the next opening: a block shown rendered, or text with its tags. Until
 * then it stays text, so it can be typed. Only paragraphs of plain text are
 * looked at: formatting made with the toolbar is never undone.
 */

const TAG = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>/i;

function hasHtml(json: PMJSON): boolean {
  if (json.type === "rawBlock" || json.type === "inlineRaw") return json.attrs?.kind === "html";
  if (json.marks?.some((m) => m.type === "inlineHtml")) return true;
  return json.content?.some(hasHtml) ?? false;
}

/** The blocks a plain-text paragraph becomes when its text is read as Markdown, if that gives HTML. */
export function htmlBlocksOf(paragraph: PMNode): PMJSON[] | null {
  if (paragraph.type.name !== "paragraph" || paragraph.childCount === 0) return null;
  let plain = true;
  paragraph.forEach((child) => {
    if (!child.isText || child.marks.length > 0) plain = false;
  });
  const text = paragraph.textContent;
  if (!plain || !TAG.test(text)) return null;
  const blocks = parseFragment(text);
  return blocks.some(hasHtml) ? blocks : null;
}

export function typedHtmlPlugin(): Plugin {
  return new Plugin({
    appendTransaction(trs, old, state) {
      if (!trs.some((t) => t.docChanged || t.selectionSet)) return null;
      const { $from } = old.selection;
      if ($from.parent.type.name !== "paragraph") return null;
      // Where the paragraph the cursor was in is now; still holding the cursor: nothing yet.
      let pos = $from.before();
      for (const tr of trs) pos = tr.mapping.map(pos, 1);
      const paragraph = state.doc.nodeAt(pos);
      if (!paragraph || paragraph.type.name !== "paragraph") return null;
      const { from, to } = state.selection;
      if (from >= pos && to <= pos + paragraph.nodeSize) return null;
      const blocks = htmlBlocksOf(paragraph);
      if (!blocks) return null;
      const nodes = Fragment.from(blocks.map((json) => state.schema.nodeFromJSON(json)));
      // A table cell holds one paragraph only: HTML typed there stays text.
      const $pos = state.doc.resolve(pos);
      if (!$pos.parent.canReplace($pos.index(), $pos.index() + 1, nodes)) return null;
      return state.tr.replaceWith(pos, pos + paragraph.nodeSize, nodes);
    },
  });
}
