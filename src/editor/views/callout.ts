import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { calloutIconSvg, calloutInfo, calloutPicker } from "../callouts";
import { addColumn, removeColumn } from "../columns";
import { element, updateAttrs } from "./dom";

/**
 * Callouts, with the icon and color of their type (clicking the icon changes
 * the type); foldable ones (`[!type]-` / `[!type]+`) get a toggle arrow.
 * Columns (`[!multi-column]`, columns.ts) get a button that adds one, and
 * each column one that removes it (shown by CSS only inside columns).
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
  const addCol = element("button", "columns-add");
  addCol.contentEditable = "false";
  addCol.tabIndex = -1;
  addCol.title = "Ajouter une colonne";
  addCol.textContent = "+";
  const removeCol = element("button", "column-remove");
  removeCol.contentEditable = "false";
  removeCol.tabIndex = -1;
  removeCol.title = "Retirer la colonne";
  removeCol.textContent = "×";
  const run = (make: (pos: number) => ReturnType<typeof addColumn>) => {
    const pos = getPos();
    if (!editor.isEditable || typeof pos !== "number") return;
    const tr = make(pos);
    if (tr) editor.view.dispatch(tr);
    editor.view.focus();
  };
  addCol.addEventListener("mousedown", (event) => {
    event.preventDefault();
    run((pos) => addColumn(editor.state, pos));
  });
  removeCol.addEventListener("mousedown", (event) => {
    event.preventDefault();
    run((pos) => removeColumn(editor.state, pos));
  });
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

  const controls = [toggle, icon, addCol, removeCol];
  dom.append(toggle, icon, body, addCol, removeCol);
  render(node);
  return {
    dom,
    contentDOM: body,
    update: (n) => {
      if (n.type !== node.type) return false;
      render(n);
      return true;
    },
    stopEvent: (event) => controls.some((control) => control.contains(event.target as Node)),
    ignoreMutation: (mutation) => controls.some((control) => control.contains(mutation.target as Node)) || mutation.type === "attributes",
  };
};
