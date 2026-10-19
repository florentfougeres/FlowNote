import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { element, updateAttrs } from "./dom";

/** List items, with a clickable checkbox for tasks. */
export const listItemView: NodeViewRenderer = ({ node, editor, getPos }) => {
  const dom = element("li");
  const content = element("div", "li-content");
  let checkbox: HTMLElement | null = null;

  const render = (n: PMNode) => {
    const task = n.attrs.checked !== null;
    dom.className = task ? "task" : "";
    if (task) dom.dataset.checked = String(n.attrs.checked);
    else delete dom.dataset.checked;
    if (task && !checkbox) {
      checkbox = element("span", "checkbox");
      checkbox.contentEditable = "false";
      checkbox.addEventListener("mousedown", (event) => {
        event.preventDefault();
        const current = editor.state.doc.nodeAt(getPos() ?? -1);
        if (!current) return;
        const checked = !current.attrs.checked;
        updateAttrs(editor, getPos, { checked, checkChar: checked ? "x" : " " });
      });
      dom.prepend(checkbox);
    } else if (!task && checkbox) {
      checkbox.remove();
      checkbox = null;
    }
  };

  dom.append(content);
  render(node);
  return {
    dom,
    contentDOM: content,
    update: (n) => {
      if (n.type !== node.type) return false;
      render(n);
      return true;
    },
    ignoreMutation: (mutation) => checkbox !== null && checkbox.contains(mutation.target as Node),
  };
};
