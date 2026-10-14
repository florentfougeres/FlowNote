import type { CellRun, TableData } from "./runtime";

/**
 * Output area of a cell, built as plain DOM (the cell is a ProseMirror node
 * view): console, error with its traceback, rich outputs (text, images, HTML
 * in a sandboxed frame) and paginated tables with "Figer".
 */

export interface OutputActions {
  page(offset: number): void;
  /** Absent when freezing is not possible (no editor, read-only). */
  freeze?: () => void;
  unfreeze?: () => void;
  /** A frozen table exists under the cell. */
  frozen: boolean;
}

const PAGE = 25;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const formatNumber = (n: number) => n.toLocaleString("fr-FR");

export function formatElapsed(ms: number | undefined): string {
  if (ms === undefined) return "";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
}

const NUMERIC = /^(U?Int|Float|Decimal)/;

function renderTable(table: TableData, actions: OutputActions): HTMLElement {
  const box = el("div", "cell-table");
  const scroll = el("div", "cell-table-scroll");
  const grid = el("table");
  const head = el("thead");
  const headRow = el("tr");
  for (const column of table.columns) {
    const th = el("th");
    th.append(el("span", "cell-table-name", column.name), el("span", "cell-table-type", column.dtype));
    if (NUMERIC.test(column.dtype)) th.classList.add("numeric");
    headRow.append(th);
  }
  head.append(headRow);
  const body = el("tbody");
  for (const row of table.rows) {
    const tr = el("tr");
    row.forEach((value, i) => {
      const td = el("td");
      if (value === null || value === undefined) {
        td.textContent = "null";
        td.className = "null";
      } else td.textContent = String(value);
      if (NUMERIC.test(table.columns[i]?.dtype ?? "")) td.classList.add("numeric");
      tr.append(td);
    });
    body.append(tr);
  }
  grid.append(head, body);
  scroll.append(grid);

  const footer = el("div", "cell-table-footer");
  const first = table.total === 0 ? 0 : table.offset + 1;
  const last = table.offset + table.rows.length;
  footer.append(el("span", "cell-table-range", table.total === 0 ? "Aucune ligne" : `${formatNumber(first)}–${formatNumber(last)} sur ${formatNumber(table.total)} ligne${table.total > 1 ? "s" : ""}`));
  if (table.total > PAGE) {
    const previous = el("button", "cell-table-nav", "‹");
    previous.title = "Page précédente";
    previous.disabled = table.offset === 0;
    previous.addEventListener("click", () => actions.page(Math.max(0, table.offset - PAGE)));
    const next = el("button", "cell-table-nav", "›");
    next.title = "Page suivante";
    next.disabled = last >= table.total;
    next.addEventListener("click", () => actions.page(table.offset + PAGE));
    footer.append(previous, next);
  }
  footer.append(el("span", "cell-spacer"));
  if (actions.freeze) {
    const freeze = el("button", "cell-freeze", actions.frozen ? "Re-figer" : "Figer");
    freeze.title = "Écrire ce tableau en Markdown sous la cellule (visible dans Obsidian)";
    freeze.addEventListener("click", () => actions.freeze?.());
    footer.append(freeze);
  }
  if (actions.frozen && actions.unfreeze) {
    const unfreeze = el("button", "cell-freeze", "Défiger");
    unfreeze.title = "Supprimer le tableau figé";
    unfreeze.addEventListener("click", () => actions.unfreeze?.());
    footer.append(unfreeze);
  }
  box.append(scroll, footer);
  return box;
}

let frameCounter = 0;
const frameHeights = new Map<string, HTMLIFrameElement>();
if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    const data = event.data as { flownoteFrame?: string; height?: number } | null;
    const frame = data?.flownoteFrame ? frameHeights.get(data.flownoteFrame) : undefined;
    if (frame && typeof data?.height === "number") frame.style.height = `${Math.min(Math.max(data.height, 40), 2000)}px`;
  });
}

/** HTML outputs (plotly, pandas styles…) run in a sandboxed frame that reports its height. */
function renderHTML(html: string): HTMLElement {
  const id = `f${frameCounter++}`;
  const frame = el("iframe", "cell-html");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:13px -apple-system,system-ui,sans-serif;color:${getComputedStyle(document.documentElement).getPropertyValue("--text") || "#1d1d1f"}}</style></head><body>${html}<script>const s=()=>parent.postMessage({flownoteFrame:${JSON.stringify(id)},height:document.documentElement.scrollHeight},"*");new ResizeObserver(s).observe(document.body);addEventListener("load",s);s();</script></body></html>`;
  frameHeights.set(id, frame);
  return frame;
}

export function renderOutputs(container: HTMLElement, run: CellRun, actions: OutputActions) {
  container.replaceChildren();
  if (run.stdout) container.append(el("pre", "cell-stdout", run.stdout.replace(/\n$/, "")));
  if (run.stderr) container.append(el("pre", "cell-stderr", run.stderr.replace(/\n$/, "")));
  for (const output of run.outputs) {
    if (output.mime === "image/png") {
      const img = el("img", "cell-image");
      img.src = `data:image/png;base64,${output.data}`;
      img.alt = "Graphique";
      container.append(img);
    } else if (output.mime === "image/svg+xml") {
      const img = el("img", "cell-image");
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(output.data)}`;
      img.alt = "Image";
      container.append(img);
    } else if (output.mime === "text/html") {
      container.append(renderHTML(output.data));
    } else {
      container.append(el("pre", "cell-text", output.data));
    }
  }
  if (run.table) container.append(renderTable(run.table, actions));
  if (run.error) {
    const box = el("div", "cell-error");
    const title = el("div", "cell-error-title");
    title.append(el("strong", undefined, run.error.ename), document.createTextNode(run.error.evalue ? ` ${run.error.evalue}` : ""));
    box.append(title);
    if (run.error.frames.length) {
      const list = el("ol", "cell-error-frames");
      for (const frame of run.error.frames) {
        const item = el("li");
        item.append(el("span", "cell-error-where", frame.where === "cellule" ? `Ligne ${frame.line}` : `${frame.where.split("/").pop()}:${frame.line}${frame.name && frame.name !== "<module>" ? ` · ${frame.name}` : ""}`));
        if (frame.code) item.append(el("code", undefined, frame.code.trim()));
        list.append(item);
      }
      box.append(list);
    }
    container.append(box);
  }
  container.hidden = container.childElementCount === 0;
}
