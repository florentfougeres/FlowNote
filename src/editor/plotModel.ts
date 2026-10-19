import { isMap, isSeq, parse as parseYaml, parseDocument, type Document, type YAMLMap } from "yaml";

/**
 * ```plotly blocks, in the format of the Obsidian plugin "obsidian-plotly":
 * JSON or YAML holding `data`, `layout` and `config`, given as is to Plotly.
 *
 * The visual editor works on a simple model (a kind, titles, a table of
 * values). It covers the common charts; anything else is edited as text.
 * Writing the model back keeps the block's format (YAML or JSON) and every
 * setting the model does not know.
 */

export interface PlotSpec {
  data: Record<string, unknown>[];
  layout?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export type PlotFormat = "json" | "yaml";

/** The spec of a block, or throws with a message for the user. */
export function parsePlot(source: string): { spec: PlotSpec; format: PlotFormat } {
  const format: PlotFormat = source.trimStart().startsWith("{") ? "json" : "yaml";
  let value: unknown;
  try {
    value = format === "json" ? JSON.parse(source) : parseYaml(source);
  } catch (error) {
    throw new Error(`${format === "json" ? "JSON" : "YAML"} invalide : ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`, { cause: error });
  }
  if (!isRecord(value) || !Array.isArray(value.data)) throw new Error("Il manque la liste « data » des séries.");
  if (!value.data.every(isRecord)) throw new Error("Chaque élément de « data » doit être un objet (une série).");
  return { spec: value as unknown as PlotSpec, format };
}

export type PlotKind = "lines" | "bars" | "hbars" | "stacked" | "points" | "area" | "pie" | "donut" | "radar";

export interface PlotModel {
  kind: PlotKind;
  title: string;
  xTitle: string;
  yTitle: string;
  /** Labels of the rows: x values, or the slices of a pie. */
  labels: string[];
  /** One column of values per series (a pie has one). */
  series: { name: string; values: (number | null)[] }[];
}

export const PLOT_KINDS: [PlotKind, string][] = [
  ["lines", "Lignes"],
  ["bars", "Barres"],
  ["hbars", "Horizontales"],
  ["stacked", "Empilées"],
  ["area", "Aire"],
  ["points", "Points"],
  ["pie", "Camembert"],
  ["donut", "Anneau"],
  ["radar", "Radar"],
];

/** A pie or a donut: one series, no axes. */
export const isPieKind = (kind: PlotKind) => kind === "pie" || kind === "donut";
/** Kinds drawn without x and y axes. */
export const hasAxes = (kind: PlotKind) => !isPieKind(kind) && kind !== "radar";

/** Where a kind keeps its row labels and its values in a Plotly trace. */
function keysOf(kind: PlotKind): { labels: string; values: string } {
  if (isPieKind(kind)) return { labels: "labels", values: "values" };
  if (kind === "radar") return { labels: "theta", values: "r" };
  if (kind === "hbars") return { labels: "y", values: "x" };
  return { labels: "x", values: "y" };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isValue = (value: unknown): value is number | null => value === null || typeof value === "number";
const isLabel = (value: unknown) => typeof value === "string" || typeof value === "number";

/** Text of a Plotly title (a string or `{ text }`). */
function titleOf(value: unknown): string | null {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.text === "string") return value.text;
  return null;
}

function kindOf(trace: Record<string, unknown>, layout: Record<string, unknown>): PlotKind | null {
  const type = trace.type ?? "scatter";
  if (type === "pie") return typeof trace.hole === "number" && trace.hole > 0 ? "donut" : "pie";
  if (type === "scatterpolar") return trace.fill === undefined || trace.fill === "toself" ? "radar" : null;
  if (type === "bar") return trace.orientation === "h" ? "hbars" : layout.barmode === "stack" ? "stacked" : "bars";
  if (type !== "scatter") return null;
  if (trace.fill === "tozeroy" || trace.fill === "tonexty") return "area";
  return trace.mode === "markers" ? "points" : "lines";
}

/** The model of a spec, or null when the visual editor cannot show it faithfully. */
export function toModel(spec: PlotSpec): PlotModel | null {
  const layout = spec.layout ?? {};
  const title = titleOf(layout.title);
  const xTitle = titleOf(isRecord(layout.xaxis) ? layout.xaxis.title : undefined);
  const yTitle = titleOf(isRecord(layout.yaxis) ? layout.yaxis.title : undefined);
  if (title === null || xTitle === null || yTitle === null || spec.data.length === 0) return null;

  const kinds = spec.data.map((trace) => kindOf(trace, layout));
  const kind = kinds[0];
  if (kind === null || kinds.some((k) => k !== kind)) return null;
  if (isPieKind(kind) && spec.data.length !== 1) return null;

  const keys = keysOf(kind);
  const columns = spec.data.map((t) => t[keys.values]);
  if (!columns.every((v): v is (number | null)[] => Array.isArray(v) && v.every(isValue))) return null;
  // Every series shares the labels (x values may be left out: rows are then numbered).
  const all = spec.data.map((t) => t[keys.labels]);
  const shared = all[0];
  if (shared === undefined ? keys.labels !== "x" : !Array.isArray(shared) || !shared.every(isLabel)) return null;
  const sharedLabels = shared as (string | number)[] | undefined;
  if (all.some((other) => JSON.stringify(other) !== JSON.stringify(shared))) return null;
  const labels = sharedLabels ? sharedLabels.map(String) : Array.from({ length: Math.max(...columns.map((v) => v.length)) }, (_, i) => String(i));
  if (columns.some((v) => v.length !== labels.length)) return null;
  return {
    kind,
    title,
    xTitle,
    yTitle,
    labels,
    series: spec.data.map((t, i) => ({ name: typeof t.name === "string" ? t.name : "", values: columns[i] })),
  };
}

/** Labels as Plotly values: numbers when they all are, else text. */
function labelValues(labels: string[]): (string | number)[] {
  const numeric = labels.length > 0 && labels.every((l) => l.trim() !== "" && Number.isFinite(Number(l)));
  return numeric ? labels.map(Number) : labels;
}

/** The trace of series `i` once the model is applied: its own keys kept, the model's replaced. */
function traceFor(model: PlotModel, i: number, before: Record<string, unknown> = {}): Record<string, unknown> {
  const trace = { ...before };
  const series = model.series[i];
  const { kind } = model;
  for (const key of ["x", "y", "labels", "values", "r", "theta", "mode", "fill", "type", "orientation", "hole"]) delete trace[key];
  const keys = keysOf(kind);
  trace[keys.labels] = keys.labels === "x" || keys.labels === "y" ? labelValues(model.labels) : model.labels;
  trace[keys.values] = series.values;
  if (isPieKind(kind)) {
    trace.type = "pie";
    // A donut keeps the hole it had.
    if (kind === "donut") trace.hole = typeof before.hole === "number" && before.hole > 0 ? before.hole : 0.5;
  } else if (kind === "radar") Object.assign(trace, { type: "scatterpolar", fill: "toself" });
  else if (kind === "bars" || kind === "stacked" || kind === "hbars") {
    trace.type = "bar";
    if (kind === "hbars") trace.orientation = "h";
  } else {
    trace.type = "scatter";
    trace.mode = kind === "points" ? "markers" : "lines";
    if (kind === "area") trace.fill = i === 0 ? "tozeroy" : "tonexty";
  }
  if (series.name) trace.name = series.name;
  else delete trace.name;
  return trace;
}

/** A title in the form it had (`{ text }` stays an object), or removed when empty. */
function withTitle(before: unknown, text: string): unknown {
  if (!text) return undefined;
  return isRecord(before) ? { ...before, text } : text;
}

/** The source of the block after the visual editor changed `model`. */
export function applyModel(source: string, model: PlotModel): string {
  const { spec, format } = parsePlot(source);
  const data = model.series.map((_, i) => traceFor(model, i, spec.data[i]));
  const layout = spec.layout ?? {};
  const xaxis = isRecord(layout.xaxis) ? layout.xaxis : {};
  const yaxis = isRecord(layout.yaxis) ? layout.yaxis : {};
  const titles: [string[], unknown][] = [
    [["title"], withTitle(layout.title, model.title)],
    [["xaxis", "title"], withTitle(xaxis.title, hasAxes(model.kind) ? model.xTitle : "")],
    [["yaxis", "title"], withTitle(yaxis.title, hasAxes(model.kind) ? model.yTitle : "")],
    // Stacked bars are a layout setting; another kind drops it.
    [["barmode"], model.kind === "stacked" ? "stack" : layout.barmode === "stack" ? undefined : layout.barmode],
  ];

  if (format === "json") {
    const next: Record<string, unknown> = { ...spec, data };
    const nextLayout: Record<string, unknown> = { ...layout, xaxis: { ...xaxis }, yaxis: { ...yaxis } };
    for (const [path, value] of titles) setPath(nextLayout, path, value);
    for (const axis of ["xaxis", "yaxis"]) if (Object.keys(nextLayout[axis] as object).length === 0) delete nextLayout[axis];
    if (Object.keys(nextLayout).length > 0) next.layout = nextLayout;
    else delete next.layout;
    return `${JSON.stringify(next, null, 2)}${source.endsWith("\n") ? "\n" : ""}`;
  }

  // YAML: edited in place, so comments and unknown keys stay where they were.
  const doc = parseDocument(source);
  const dataNode = doc.get("data");
  data.forEach((trace, i) => {
    const node = isSeq(dataNode) ? dataNode.items[i] : undefined;
    if (isMap(node)) updateMap(doc, node, trace);
    else doc.addIn(["data"], flowArrays(doc, trace));
  });
  if (isSeq(dataNode)) dataNode.items.splice(data.length);
  for (const [path, value] of titles) {
    if (value === undefined) {
      if (doc.hasIn(["layout", ...path])) doc.deleteIn(["layout", ...path]);
    } else doc.setIn(["layout", ...path], value);
  }
  for (const axis of ["xaxis", "yaxis"]) {
    const node = doc.getIn(["layout", axis]);
    if (isMap(node) && node.items.length === 0) doc.deleteIn(["layout", axis]);
  }
  const layoutNode = doc.get("layout");
  if (isMap(layoutNode) && layoutNode.items.length === 0) doc.delete("layout");
  return doc.toString({ lineWidth: 0 });
}

function setPath(target: Record<string, unknown>, path: string[], value: unknown) {
  const parent = path.slice(0, -1).reduce<Record<string, unknown>>((o, key) => o[key] as Record<string, unknown>, target);
  const key = path[path.length - 1];
  if (value === undefined) delete parent[key];
  else parent[key] = value;
}

/** A trace as a YAML node, its lists written on one line (`x: [1, 2, 3]`). */
function flowArrays(doc: Document, trace: Record<string, unknown>) {
  const node = doc.createNode(trace);
  for (const pair of node.items) if (isSeq(pair.value)) pair.value.flow = true;
  return node;
}

/** Sets the keys of `trace` on an existing YAML map and removes the ones it lost. */
function updateMap(doc: Document, node: YAMLMap, trace: Record<string, unknown>) {
  for (const pair of node.items.slice()) {
    const key = String((pair.key as { value?: unknown })?.value ?? pair.key);
    if (!(key in trace)) node.delete(key);
  }
  for (const [key, value] of Object.entries(trace)) {
    const current = node.get(key, true);
    if (JSON.stringify(current && typeof current === "object" && "toJSON" in current ? (current as { toJSON: () => unknown }).toJSON() : current) === JSON.stringify(value)) continue;
    const next = doc.createNode(value);
    if (isSeq(next)) next.flow = true;
    node.set(key, next);
  }
}

/** A new chart, for the "/" menu. */
export const PLOT_TEMPLATE = `data:
  - x: [Jan, Fév, Mar, Avr, Mai]
    y: [12, 18, 15, 22, 26]
    type: scatter
    mode: lines
    name: Série 1
layout:
  title: Mon graphique
`;

/** Cells of a CSV text (RFC 4180 quotes), with its delimiter: `;`, `,` or a tab, whichever the first line uses most. */
function csvRows(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, "");
  const delimiter = [";", "\t", ","].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) rows.push([...row, cell]);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

/** A number written in a CSV: `1 234,5`, `1.234,5`, `1,234.5`, `12 %`; null when it is not one. */
function csvNumber(cell: string): number | null {
  let text = cell.replace(/[\s  %€$£]/g, "");
  if (text === "") return null;
  if (text.includes(",") && text.includes(".")) text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  else if (text.includes(",")) text = /^-?\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, "") : text.replace(",", ".");
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * The data of a CSV file for the visual editor: the first column gives the
 * labels (x values, or pie slices), each other column a series named by its
 * header. Without a header row (the first row holding only numbers after its
 * label), series are named "Série 1", "Série 2"…
 */
export function csvToData(text: string): Pick<PlotModel, "labels" | "series"> {
  const rows = csvRows(text);
  if (rows.length === 0) throw new Error("le fichier est vide");
  const width = Math.max(...rows.map((r) => r.length));
  if (width < 2) {
    // One column: values only, numbered rows.
    const values = rows.map((r) => csvNumber(r[0]));
    const header = values[0] === null && rows.length > 1;
    return { labels: (header ? rows.slice(1) : rows).map((_, i) => String(i + 1)), series: [{ name: header ? rows[0][0] : "Série 1", values: header ? values.slice(1) : values }] };
  }
  const header = rows[0].slice(1).some((c) => c !== "" && csvNumber(c) === null);
  const body = header ? rows.slice(1) : rows;
  if (body.length === 0) throw new Error("aucune ligne de données");
  return {
    labels: body.map((r) => r[0] ?? ""),
    series: Array.from({ length: width - 1 }, (_, j) => ({
      name: header ? rows[0][j + 1] || `Série ${j + 1}` : `Série ${j + 1}`,
      values: body.map((r) => csvNumber(r[j + 1] ?? "")),
    })),
  };
}
