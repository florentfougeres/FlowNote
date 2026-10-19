import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Obsidian tags (`#tag`, `#nested/tag`, not only digits), highlighted in text. */
const TAG = /(^|\s)(#[\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

function tagDecorations(doc: PMNode, from: number, to: number): Decoration[] {
  const decorations: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    node.forEach((child, offset) => {
      if (!child.isText || child.marks.some((m) => m.type.name === "code" || m.type.name === "link")) return;
      for (const match of child.text!.matchAll(TAG)) {
        const start = pos + 1 + offset + match.index! + match[1].length;
        decorations.push(Decoration.inline(start, start + match[2].length, { class: "tag" }));
      }
    });
    return false;
  });
  return decorations;
}

/** Ranges of the new document touched by a transaction. */
export function changedRanges(tr: Transaction): [number, number][] {
  const ranges: [number, number][] = [];
  tr.mapping.maps.forEach((map, i) => {
    const rest = tr.mapping.slice(i + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => ranges.push([rest.map(newStart, -1), rest.map(newEnd, 1)]));
  });
  return ranges;
}

const tagKey = new PluginKey<DecorationSet>("tags");

/**
 * Obsidian tags highlighted in text. Decorations are kept in the plugin state
 * and only recomputed for the text blocks a transaction touches, so typing
 * stays fast in long notes.
 */
export function tagPlugin(): Plugin {
  return new Plugin<DecorationSet>({
    key: tagKey,
    state: {
      init: (_config, state) => DecorationSet.create(state.doc, tagDecorations(state.doc, 0, state.doc.content.size)),
      apply(tr, set) {
        if (!tr.docChanged) return set;
        let next = set.map(tr.mapping, tr.doc);
        for (const [from, to] of changedRanges(tr)) {
          // Recompute whole text blocks around the change.
          const start = Math.max(0, Math.min(from, tr.doc.content.size));
          const end = Math.max(start, Math.min(to, tr.doc.content.size));
          let blockFrom = start;
          let blockTo = end;
          tr.doc.nodesBetween(start, end, (node, pos) => {
            if (node.isTextblock) {
              blockFrom = Math.min(blockFrom, pos);
              blockTo = Math.max(blockTo, pos + node.nodeSize);
              return false;
            }
            return true;
          });
          const $start = tr.doc.resolve(start);
          if ($start.parent.isTextblock) {
            blockFrom = Math.min(blockFrom, $start.before());
            blockTo = Math.max(blockTo, $start.after());
          }
          next = next.remove(next.find(blockFrom, blockTo)).add(tr.doc, tagDecorations(tr.doc, blockFrom, blockTo));
        }
        return next;
      },
    },
    props: {
      decorations: (state) => tagKey.getState(state),
    },
  });
}
