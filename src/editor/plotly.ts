import { parsePlot } from "./plotModel";

/**
 * Plotly charts (```plotly code blocks, like the Obsidian plugin
 * "obsidian-plotly"). The library is loaded on first use; the note keeps a
 * plain code block. Only static data is drawn: no JavaScript runs.
 */

type Plotly = typeof import("plotly.js-dist-min");

let loading: Promise<Plotly> | null = null;

function load(): Promise<Plotly> {
  // A CommonJS bundle: the library is the default export, or the module itself.
  loading ??= import("plotly.js-dist-min").then((module) => ((module as unknown as { default?: Plotly }).default ?? module) as Plotly);
  return loading;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Titles written as plain text (`title: Ventes`, as in Plotly 2 and the
 * plugin's examples) given as `{ text }`, the only form Plotly 3+ draws.
 */
function withTextTitles(layout: Record<string, unknown>): Record<string, unknown> {
  const fix = (value: unknown) => (typeof value === "string" ? { text: value } : value);
  const next: Record<string, unknown> = { ...layout };
  if ("title" in next) next.title = fix(next.title);
  for (const [key, value] of Object.entries(next)) {
    if (/^[xyz]axis\d*$/.test(key) && isRecord(value) && "title" in value) next[key] = { ...value, title: fix(value.title) };
  }
  return next;
}

/** The series after the first, in the system palette, readable in light and dark. */
const SERIES = ["#ff9f0a", "#30b0c7", "#af52de", "#34c759", "#ff453a", "#a2845e", "#8e8e93"];

/** The app's colours and font under the note's own layout (which wins). */
function themedLayout(own: Record<string, unknown> = {}): Record<string, unknown> {
  const layout = withTextTitles(own);
  const css = getComputedStyle(document.documentElement);
  const text = css.getPropertyValue("--text").trim() || "#333";
  const line = css.getPropertyValue("--border").trim() || "rgba(0,0,0,0.1)";
  const axis = (own: unknown) => ({ gridcolor: line, zerolinecolor: line, linecolor: line, ...(isRecord(own) ? own : {}) });
  return {
    autosize: true,
    margin: { t: layout.title ? 48 : 16, r: 16, b: 40, l: 48 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: getComputedStyle(document.body).fontFamily, color: text, size: 12 },
    // The app's palette (system blue first) instead of Plotly's; a note's own colours still win.
    colorway: [css.getPropertyValue("--accent").trim() || "#007aff", ...SERIES],
    // Plotly's toolbar (zoom, export…) on the page, not on a grey band.
    modebar: { bgcolor: "rgba(0,0,0,0)", color: css.getPropertyValue("--muted").trim() || "#888", activecolor: text },
    ...layout,
    xaxis: axis(layout.xaxis),
    yaxis: axis(layout.yaxis),
  };
}

/** Draws (or redraws) the chart of `source` in `element`; throws with a message for the user. */
export async function renderPlot(element: HTMLElement, source: string): Promise<void> {
  const { spec } = parsePlot(source);
  const plotly = await load();
  // Plotly writes into the objects it gets: it draws copies.
  const data = structuredClone(spec.data) as Plotly.Data[];
  const layout = themedLayout(structuredClone(spec.layout));
  await plotly.react(element, data, layout as Partial<Plotly.Layout>, { responsive: true, displaylogo: false, ...spec.config });
}

/** Frees what Plotly attached to `element` (its listeners and resize handler). */
export function purgePlot(element: HTMLElement) {
  void loading?.then((plotly) => plotly.purge(element));
}
