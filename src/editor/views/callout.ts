import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { calloutIconSvg, calloutInfo, calloutPicker } from "../callouts";
import { element, updateAttrs } from "./dom";

/**
 * Callouts, with the icon and color of their type (clicking the icon changes
 * the type); foldable ones (`[!type]-` / `[!type]+`) get a toggle arrow.
 */
export const calloutView: NodeViewRenderer = ({ node, editor, getPos }) => {
  const dom = element("div", "callout");
  const toggle = element("button", "callout-fold");
  toggle.contentEditable = "false";
  toggle.tabIndex = -1;
  const icon = element("button", "callout-icon");
  icon.contentEditable = "false";
  icon.tabIndex = -1;
  icon.title = "Changer le type de callout";
  const body = element("div", "callout-body");
  let collapsed = node.attrs.fold === "-";
  let current = node;
  let shownType = "";

  const render = (n: PMNode) => {
    current = n;
    const type = String(n.attrs.calloutType).toLowerCase();
    dom.dataset.callout = type;
    if (type !== shownType) {
      const info = calloutInfo(type);
      dom.style.setProperty("--callout", `rgb(${info.color})`);
      icon.innerHTML = calloutIconSvg(info);
      shownType = type;
    }
    toggle.hidden = !n.attrs.fold;
    dom.classList.toggle("collapsed", Boolean(n.attrs.fold) && collapsed);
  };
  icon.addEventListener("mousedown", (event) => {
    event.preventDefault();
    if (!editor.isEditable) return;
    const rect = icon.getBoundingClientRect();
    calloutPicker.open({
      x: rect.left,
      y: rect.bottom + 6,
      current: String(current.attrs.calloutType),
      onPick: (type) => updateAttrs(editor, getPos, { calloutType: type }),
    });
  });
  toggle.addEventListener("mousedown", (event) => {
    event.preventDefault();
    collapsed = !collapsed;
    dom.classList.toggle("collapsed", collapsed);
  });

  dom.append(toggle, icon, body);
  render(node);
  return {
    dom,
    contentDOM: body,
    update: (n) => {
      if (n.type !== node.type) return false;
      render(n);
      return true;
    },
    stopEvent: (event) => toggle.contains(event.target as Node) || icon.contains(event.target as Node),
    ignoreMutation: (mutation) => toggle.contains(mutation.target as Node) || icon.contains(mutation.target as Node) || mutation.type === "attributes",
  };
};
