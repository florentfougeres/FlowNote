import type { NodeViewRenderer } from "@tiptap/core";
import { element, updateAttrs } from "./dom";

/** Markdown kept verbatim (tables, HTML, math...): double-click to edit its source. */
export const rawBlockView: NodeViewRenderer = ({ node, editor, getPos }) => {
  const dom = element("div", "raw-block");
  dom.dataset.kind = node.attrs.kind;
  const pre = element("pre");
  pre.textContent = node.attrs.source;
  let source = node.attrs.source as string;
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
      if (n.type !== node.type) return false;
      source = n.attrs.source;
      dom.dataset.kind = n.attrs.kind;
      if (!textarea) pre.textContent = source;
      return true;
    },
    stopEvent: (event) => textarea !== null && event.target === textarea,
    ignoreMutation: () => true,
  };
};
