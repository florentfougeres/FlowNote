import type { NodeViewRenderer } from "@tiptap/core";
import type { BridgeRef } from "../editor/bridge";
import { cellInfo, isCellInfo, setCellAttribute } from "./format";
import { cellIdAt } from "./cellIds";
import { frozenRange } from "./freeze";
import { formatElapsed, renderOutputs } from "./outputs";
import type { CellRun, NotebookRuntime } from "./runtime";

/**
 * A marimo cell in a notebook page: a fenced code block shown as a cell, with
 * its language, the variable receiving a SQL result, and folded code when the
 * cell asks for it (`hide_code`), a Run button with the cell's state, and its
 * outputs (kept by the notebook runtime, never written in the document).
 */

const STATE_LABELS: Record<CellRun["state"], string> = {
  idle: "",
  queued: "En attente",
  running: "En cours…",
  ok: "",
  error: "Erreur",
  interrupted: "Interrompue",
  cancelled: "Annulée",
};

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
    const run = element("button", "cell-run");
    run.tabIndex = -1;
    run.title = "Exécuter la cellule (⌘↵)";
    run.setAttribute("aria-label", "Exécuter la cellule");
    run.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.75v10.5L13 8z" fill="currentColor"/></svg>';
    const status = element("span", "cell-status");
    header.append(run, badge, query, element("span", "cell-spacer"), status, fold);
    const pre = element("pre");
    const code = element("code");
    pre.append(code);
    const output = element("div", "cell-output");
    output.contentEditable = "false";
    output.hidden = true;
    dom.append(header, pre, output);

    let current = node;
    let shown = false;
    let runtime: NotebookRuntime | null = null;
    let unsubscribe: (() => void) | null = null;

    const cellId = () => {
      const pos = getPos();
      return typeof pos === "number" ? cellIdAt(editor.state, pos) : null;
    };

    /** Output and state of this cell, from the notebook runtime. */
    const renderRun = () => {
      const id = cellId();
      const state = runtime && id ? runtime.run(id) : null;
      run.hidden = !bridge.current.runCell;
      dom.dataset.state = state?.state ?? "idle";
      if (!state || state.state === "idle") {
        status.textContent = "";
      } else if (state.state === "ok") {
        status.textContent = `✓ ${formatElapsed(state.elapsedMs)}`;
      } else {
        status.textContent = STATE_LABELS[state.state] + (state.elapsedMs !== undefined && state.state !== "running" && state.state !== "queued" ? ` · ${formatElapsed(state.elapsedMs)}` : "");
      }
      if (!state || !runtime || !id) {
        output.replaceChildren();
        output.hidden = true;
        return;
      }
      const pos = getPos();
      const frozen = typeof pos === "number" && frozenRange(editor.state.doc, pos) !== null;
      const freeze = bridge.current.freezeCell;
      renderOutputs(output, state, {
        page: (offset) => void runtime?.page(id, offset).then(renderRun),
        frozen,
        freeze: freeze && editor.isEditable ? () => typeof getPos() === "number" && freeze(getPos() as number) : undefined,
        unfreeze: freeze && editor.isEditable ? () => typeof getPos() === "number" && freeze(getPos() as number, true) : undefined,
      });
    };

    const subscribe = () => {
      const next = bridge.current.runtime ?? null;
      if (next === runtime) return;
      unsubscribe?.();
      runtime = next;
      unsubscribe = runtime ? runtime.subscribe(renderRun) : null;
    };

    run.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const pos = getPos();
      if (typeof pos === "number") bridge.current.runCell?.(pos);
    });

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
      dom.classList.toggle("disabled", info.disabled);
      run.disabled = info.disabled;
      if (info.disabled) run.title = "Cellule désactivée (disabled)";
      subscribe();
      renderRun();
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
      stopEvent: (event) => header.contains(event.target as Node) || output.contains(event.target as Node),
      ignoreMutation: (mutation) => header.contains(mutation.target as Node) || output.contains(mutation.target as Node) || mutation.type === "attributes",
      destroy: () => unsubscribe?.(),
    };
  };
