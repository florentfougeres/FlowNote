import type { NodeViewRenderer } from "@tiptap/core";
import { element, updateAttrs } from "./dom";

/**
 * Markdown kept verbatim (tables, HTML, math...): double-click to edit its
 * source. A footnote's text (`[^1]: text`) shows as a footnote: its number,
 * then its text.
 */
export const rawBlockView: NodeViewRenderer = ({ node, editor, getPos }) => {
  const dom = element("div", "raw-block");
  dom.dataset.kind = node.attrs.kind;
  const footnote = node.attrs.kind === "footnoteDefinition";
  const pre = element(footnote ? "div" : "pre", footnote ? "footnote-def" : undefined);
  let source = node.attrs.source as string;
  const paint = () => {
    const match = footnote ? /^\[\^([^\]]+)\]:[ \t]*([\s\S]*)$/.exec(source) : null;
    if (!match) {
      pre.textContent = source;
      return;
    }
    pre.dataset.label = match[1];
    const text = match[2].replace(/\n[ \t]+/g, "\n").trim();
    const body = element("span", text ? "footnote-text" : "footnote-text empty");
    // `code` in the note's text is shown as code; the rest as written.
    if (!text) body.textContent = "Double-cliquez pour écrire la note.";
    else text.split(/(`[^`\n]+`)/).forEach((part, i) => body.append(i % 2 ? Object.assign(element("code"), { textContent: part.slice(1, -1) }) : part));
    pre.replaceChildren(Object.assign(element("span", "footnote-label"), { textContent: match[1] }), body);
  };
  paint();
  let textarea: HTMLTextAreaElement | null = null;

  const stopEditing = (commit: boolean) => {
    if (!textarea) return;
    const value = textarea.value;
    textarea.replaceWith(pre);
    textarea = null;
    if (commit && value !== source) updateAttrs(editor, getPos, { source: value });
    editor.commands.focus();
  };
  dom.addEventListener("dblclick", () => {
    if (textarea || !editor.isEditable) return;
    textarea = element("textarea");
    textarea.value = source;
    textarea.rows = Math.max(2, source.split("\n").length);
    textarea.spellcheck = false;
    textarea.addEventListener("blur", () => stopEditing(true));
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") stopEditing(false);
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) stopEditing(true);
    });
    pre.replaceWith(textarea);
    textarea.focus();
  });
  dom.append(pre);
  dom.title = "Double-cliquez pour modifier le Markdown";
  return {
    dom,
    update: (n) => {
      if (n.type !== node.type || n.attrs.kind !== node.attrs.kind) return false;
      source = n.attrs.source;
      if (!textarea) paint();
      return true;
    },
    stopEvent: (event) => textarea !== null && event.target === textarea,
    ignoreMutation: () => true,
  };
};
