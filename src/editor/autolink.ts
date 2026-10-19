import { Plugin, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { Mark, Node as PMNode } from "@tiptap/pm/model";
import { changedRanges } from "./views";

/**
 * Web addresses typed in text become links once the cursor leaves them, as the
 * parser reads them on the next opening (GFM literal links: the file keeps the
 * bare address). Only blocks a transaction changes are looked at, so a note
 * that is just opened is never touched.
 */

const URL_START = /(?<![\p{L}\p{N}_/.@-])(?:https?:\/\/|www\.)[^\s<>]+/giu;
/** Trailing characters that end a sentence rather than the address (GFM). */
const TRAILING = /[?!.,:;*_~'"]+$/;

/** Addresses in a text, without trailing punctuation or an unbalanced `)` or `]`. */
export function findUrls(text: string): { from: number; to: number; href: string }[] {
  const urls: { from: number; to: number; href: string }[] = [];
  for (const match of text.matchAll(URL_START)) {
    let url = match[0];
    for (;;) {
      url = url.replace(TRAILING, "");
      const last = url.slice(-1);
      const open = last === ")" ? "(" : last === "]" ? "[" : null;
      if (open === null || url.split(open).length >= url.split(last).length) break;
      url = url.slice(0, -1);
    }
    // A domain needs a dot between two letters or digits.
    if (!/[\p{L}\p{N}]\.[\p{L}\p{N}]/u.test(url)) continue;
    const from = match.index;
    urls.push({ from, to: from + url.length, href: /^www\./i.test(url) ? `http://${url}` : url });
  }
  return urls;
}

const isLiteral = (mark: Mark) => mark.type.name === "link" && mark.attrs.kind === "literal";

/** Text a literal link may cover: no code, no link written with brackets. */
function eligible(node: PMNode): boolean {
  return node.isText && !node.marks.some((m) => m.type.name === "code" || (m.type.name === "link" && !isLiteral(m)));
}

function linkTextblock(tr: Transaction, state: EditorState, block: PMNode, start: number) {
  const link = state.schema.marks.link;
  // Runs of eligible text, each scanned on its own.
  const runs: { from: number; text: string }[] = [];
  block.forEach((child, offset) => {
    const pos = start + offset;
    const last = runs[runs.length - 1];
    if (!eligible(child)) runs.push({ from: pos + child.nodeSize, text: "" });
    else if (last && last.from + last.text.length === pos) last.text += child.text;
    else runs.push({ from: pos, text: child.text! });
  });
  for (const run of runs) {
    if (!run.text) continue;
    const end = run.from + run.text.length;
    const urls = findUrls(run.text).map((u) => ({ ...u, from: run.from + u.from, to: run.from + u.to }));
    // An address still being typed is left as it is, its old link included.
    const typing = urls.find((u) => u.to === state.selection.head);
    const wanted = urls.filter((u) => u !== typing);
    const covers = (url: { from: number; to: number; href: string }, pos: number, size: number) => url.from <= pos && pos + size <= url.to;
    // Literal links that no longer match their text go away.
    state.doc.nodesBetween(run.from, end, (node, pos) => {
      const mark = node.marks.find(isLiteral);
      if (!mark || (typing && pos < typing.to && pos + node.nodeSize > typing.from)) return;
      const url = wanted.find((u) => covers(u, pos, node.nodeSize));
      if (!url || mark.attrs.href !== url.href) tr.removeMark(Math.max(pos, run.from), Math.min(pos + node.nodeSize, end), mark);
    });
    for (const url of wanted) {
      let linked = true;
      state.doc.nodesBetween(url.from, url.to, (node) => {
        if (node.isText && !node.marks.some((m) => isLiteral(m) && m.attrs.href === url.href)) linked = false;
      });
      if (!linked) tr.addMark(url.from, url.to, link.create({ href: url.href, title: null, kind: "literal" }));
    }
  }
}

export function autolinkPlugin(): Plugin {
  return new Plugin({
    appendTransaction(trs, _old, state) {
      if (!trs.some((t) => t.docChanged) || !state.schema.marks.link) return null;
      const tr = state.tr;
      const seen = new Set<number>();
      trs.forEach((t, i) => {
        const later = trs.slice(i + 1);
        for (const range of changedRanges(t)) {
          const [from, to] = later.reduce(([a, b], next) => [next.mapping.map(a, -1), next.mapping.map(b, 1)], range);
          // One position around the change: Enter leaves the address at the end of the block above.
          state.doc.nodesBetween(Math.max(0, from - 1), Math.min(state.doc.content.size, to + 1), (node, pos) => {
            if (!node.isTextblock) return true;
            if (!node.type.spec.code && !seen.has(pos)) {
              seen.add(pos);
              linkTextblock(tr, state, node, pos + 1);
            }
            return false;
          });
        }
      });
      return tr.steps.length > 0 ? tr : null;
    },
  });
}
