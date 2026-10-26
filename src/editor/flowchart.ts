/**
 * flowchart.js diagrams (```flow code blocks, as in HedgeDoc; ```flowchart
 * too). The library (and Raphaël, which draws the SVG) loads on first use;
 * the Markdown stays a plain code block.
 */

type FlowChart = typeof import("flowchart.js");

let loading: Promise<FlowChart> | null = null;

/** The palette's colour of a CSS variable, for the diagram's lines and text. */
function cssColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#333";
}

/** Draws the diagram in `container`, or throws with a message when the source draws nothing. */
export async function renderFlowchart(container: HTMLElement, source: string): Promise<void> {
  loading ??= import("flowchart.js").then((module) => ("default" in module ? (module.default as FlowChart) : module));
  const flowchart = await loading;
  const target = document.createElement("div");
  target.className = "flowchart-diagram";
  const chart = flowchart.parse(source);
  const text = cssColor("--text");
  // Drawn in a box attached to the page: Raphaël measures the text while drawing.
  container.replaceChildren(target);
  chart.drawSVG(target, {
    "font-family": getComputedStyle(document.body).fontFamily,
    "font-size": 14,
    "font-color": text,
    "line-color": text,
    "element-color": text,
    fill: cssColor("--bg"),
    "line-width": 1.5,
    "yes-text": "oui",
    "no-text": "non",
    "arrow-end": "block",
  });
  const svg = target.querySelector("svg");
  if (!svg || svg.querySelectorAll("rect, path").length === 0) throw new Error("aucun élément (st=>start: Début, puis st->e)");
  // Its drawn size as a view box: a wide diagram shrinks to the note's width.
  const width = Number(svg.getAttribute("width"));
  const height = Number(svg.getAttribute("height"));
  if (width && height) svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
}
