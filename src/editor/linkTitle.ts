import type { EditorView } from "@tiptap/pm/view";

/**
 * A web address pasted alone becomes `[Title of the page](address)`, as the
 * Auto Link Title plugin does: the address is inserted at once (a literal link,
 * as typed), then replaced by the page's title when it arrives. ⌘⇧V pastes the
 * bare address. If the address was edited or removed meanwhile, nothing changes.
 */

const BARE_URL = /^https?:\/\/[^\s<>"]+$/i;

/** The address in pasted text when it is nothing else, or null. */
export function pastedUrl(text: string): string | null {
  const url = text.trim();
  return BARE_URL.test(url) ? url : null;
}

/** Pastes `url` at the cursor, then gives it the page's title. False when it cannot (a selection, code). */
export function pasteUrlWithTitle(view: EditorView, url: string, fetchTitle: (url: string) => Promise<string | null>): boolean {
  const { selection, schema } = view.state;
  const { $from } = selection;
  if (!selection.empty || !$from.parent.isTextblock || $from.parent.type.spec.code || $from.marks().some((m) => m.type.spec.code || m.type === schema.marks.link)) return false;
  const start = selection.from;
  const literal = schema.marks.link.create({ href: url, title: null, kind: "literal" });
  view.dispatch(view.state.tr.insert(start, schema.text(url, [...$from.marks(), literal])).scrollIntoView());
  void fetchTitle(url).then((title) => {
    const clean = title?.replace(/\s+/g, " ").trim();
    if (!clean || view.isDestroyed) return;
    const range = findLiteral(view, url, start);
    if (!range) return;
    const { state } = view;
    const marks = state.doc.resolve(range.from + 1).marks().filter((m) => m.type !== schema.marks.link);
    const link = schema.marks.link.create({ href: url, title: null, kind: "inline" });
    view.dispatch(state.tr.replaceWith(range.from, range.to, schema.text(clean, [...marks, link])));
  });
  return true;
}

/** The pasted address, still untouched (a literal link whose text is the address), closest to where it was pasted. */
function findLiteral(view: EditorView, url: string, near: number): { from: number; to: number } | null {
  let best: { from: number; to: number } | null = null;
  view.state.doc.descendants((node, pos) => {
    if (!node.isText || node.text !== url) return;
    if (!node.marks.some((m) => m.type.name === "link" && m.attrs.kind === "literal" && m.attrs.href === url)) return;
    if (!best || Math.abs(pos - near) < Math.abs(best.from - near)) best = { from: pos, to: pos + node.nodeSize };
  });
  return best;
}
