import type { NodeViewRenderer } from "@tiptap/core";
import type { BridgeRef } from "../editor/bridge";
import { cellInfo, isCellInfo, setCellAttribute } from "./format";

/**
 * A marimo cell in a notebook page: a fenced code block shown as a cell, with
 * its language, the variable receiving a SQL result, and folded code when the
 * cell asks for it (`hide_code`). Execution controls come with the kernel.
 */

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

/** In a notebook page, cells use this view; anything else keeps the plain code block view. */
export const isCellNode = (bridge: BridgeRef, attrs: Record<string, unknown>) => bridge.current.notebook && isCellInfo(String(attrs.language ?? ""), String(attrs.meta ?? ""));

export const cellView =
  (bridge: BridgeRef): NodeViewRenderer =>
  ({ node, editor, getPos }) => {
    const dom = element("div", "notebook-cell");
    const header = element("div", "cell-header");
    header.contentEditable = "false";
    const badge = element("span", "cell-language");
    const query = element("label", "cell-query");
    const queryArrow = element("span");
    queryArrow.textContent = "→";
    const queryInput = element("input");
    queryInput.spellcheck = false;
    queryInput.placeholder = "_df";
    queryInput.title = "Variable Python qui reçoit le résultat de la requête";
    query.append(queryArrow, queryInput);
    const fold = element("button", "cell-fold");
    fold.tabIndex = -1;
    header.append(badge, query, element("span", "cell-spacer"), fold);
    const pre = element("pre");
    const code = element("code");
    pre.append(code);
    dom.append(header, pre);

    let current = node;
    let shown = false;

    const render = () => {
      const info = cellInfo(current.attrs.language, current.attrs.meta);
      dom.dataset.language = info.language;
      badge.textContent = info.language === "sql" ? "SQL" : "Python";
      query.hidden = info.language !== "sql";
      if (document.activeElement !== queryInput) queryInput.value = info.query === "_df" ? "" : info.query;
      const folded = info.hideCode && !shown;
      dom.classList.toggle("folded", folded);
      fold.hidden = !info.hideCode;
      fold.textContent = folded ? `Code masqué · ${current.textContent.split("\n")[0] || "vide"}` : "Masquer le code";
    };

    // The variable name is written in the cell's info string: ```sql {.marimo query="ventes"}.
    queryInput.addEventListener("change", () => {
      const pos = getPos();
      if (typeof pos !== "number") return;
      const name = queryInput.value.trim();
      const valid = name === "" || /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
      if (!valid) return render();
      const meta = setCellAttribute(current.attrs.meta, "query", name === "" ? null : name);
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, meta }));
    });
    queryInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        queryInput.blur();
        editor.commands.focus();
      }
    });
    fold.addEventListener("mousedown", (event) => {
      event.preventDefault();
      shown = !shown;
      render();
    });

    render();
    return {
      dom,
      contentDOM: code,
      update: (next) => {
        if (next.type !== node.type || !isCellNode(bridge, next.attrs)) return false;
        current = next;
        render();
        return true;
      },
      stopEvent: (event) => header.contains(event.target as Node),
      ignoreMutation: (mutation) => header.contains(mutation.target as Node) || mutation.type === "attributes",
    };
  };
