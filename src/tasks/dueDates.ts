import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { isoDay, urgency } from "./agenda";

/**
 * Due dates of tasks (`📅 2026-10-20`, the Obsidian Tasks convention) shown as
 * small chips, colored by urgency. Decorations only: the text is unchanged.
 */

const DATE = /📅️?[ \t]*(\d{4}-\d{2}-\d{2})/g;
const key = new PluginKey<DecorationSet>("dueDates");

function decorations(doc: PMNode): DecorationSet {
  const today = isoDay();
  const found: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    if (node.marks.some((m) => m.type.name === "code")) return false;
    for (const match of node.text.matchAll(DATE)) {
      const from = pos + match.index;
      found.push(Decoration.inline(from, from + match[0].length, { class: `due-chip ${urgency(match[1], today)}` }));
    }
    return false;
  });
  return DecorationSet.create(doc, found);
}

export function dueDatePlugin(): Plugin {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => decorations(state.doc),
      apply: (tr, set) => (tr.docChanged ? decorations(tr.doc) : set),
    },
    props: { decorations: (state) => key.getState(state) },
  });
}
