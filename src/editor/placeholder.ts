import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { HEADING_PLACEHOLDERS } from "./syntaxMarks";

/** Placeholders for the empty block holding the cursor, and for empty callout titles. */
export function placeholderPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];
        const { $from, empty } = state.selection;
        const parent = $from.parent;
        const inCell = $from.depth > 0 && ["cell", "header_cell"].includes($from.node(-1).type.spec.tableRole);
        if (empty && parent.isTextblock && parent.content.size === 0 && !inCell) {
          let text: string | null = null;
          if (parent.type.name === "paragraph") text = "Tapez / pour insérer…";
          else if (parent.type.name === "heading") text = HEADING_PLACEHOLDERS[parent.attrs.level - 1];
          if (text) decorations.push(Decoration.node($from.before(), $from.after(), { class: "is-empty", "data-placeholder": text }));
        }
        state.doc.descendants((node, pos) => {
          if (node.type.name === "calloutTitle" && node.content.size === 0) {
            const callout = state.doc.resolve(pos).parent;
            const type = String(callout.attrs.calloutType);
            decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "is-empty", "data-placeholder": type[0].toUpperCase() + type.slice(1) }));
          }
          return node.isBlock && !node.isTextblock;
        });
        return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : null;
      },
    },
  });
}
