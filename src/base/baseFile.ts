import { isMap, isSeq, parseDocument, type Document } from "yaml";

/**
 * Bases (Notion-like databases) in Obsidian's own format: a `Name.base` YAML
 * file describes the views; the rows are the notes of a folder, their
 * properties are the columns.
 *
 *   filters:
 *     and:
 *       - file.inFolder("Projets")     ← the rows: the notes of this folder
 *   properties:
 *     note.statut:
 *       displayName: Statut
 *   views:
 *     - type: table
 *       name: Tableau
 *       order: [file.name, note.statut]
 *       sort:
 *         - property: note.statut
 *           direction: ASC
 *       columnSize:
 *         note.statut: 160
 *     - type: board                    ← FlowNote's kanban view (not an Obsidian view)
 *       name: Kanban
 *       groupBy:
 *         property: note.statut
 *   flownote:                          ← what Bases does not store: column types, option colors
 *     properties:
 *       statut:
 *         type: select
 *         options:
 *           - value: À faire
 *             color: gray
 *
 * Every edit goes through the YAML document: comments, formulas and anything
 * FlowNote does not understand are kept.
 */

export type ColumnType = "text" | "number" | "select" | "multi" | "date" | "checkbox" | "url";

export const COLUMN_TYPES: [ColumnType, string][] = [
  ["text", "Texte"],
  ["number", "Nombre"],
  ["select", "Sélection"],
  ["multi", "Sélection multiple"],
  ["date", "Date"],
  ["checkbox", "Case à cocher"],
  ["url", "URL"],
];

/** Notion's option colors. */
export const OPTION_COLORS = ["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
export type OptionColor = (typeof OPTION_COLORS)[number];

export interface SelectOption {
  value: string;
  color: OptionColor;
}

export interface ColumnMeta {
  type: ColumnType;
  options: SelectOption[];
}

export interface SortRule {
  property: string;
  direction: "ASC" | "DESC";
}

/** A filter FlowNote can edit; other filters are kept (and shown as such). */
export interface SimpleFilter {
  property: string;
  op: "is" | "isNot" | "contains" | "checked" | "unchecked" | "empty" | "notEmpty";
  value: string;
}

export interface BaseView {
  type: string;
  name: string;
  /** Visible columns, in order: "file.name" or a note property name. */
  order: string[];
  sort: SortRule[];
  columnSize: Record<string, number>;
  filters: SimpleFilter[];
  /** Filters written by hand (Obsidian expressions FlowNote does not edit). */
  otherFilters: number;
  groupBy: string | null;
  /** Calculation at the bottom of each column (Obsidian's `summaries`). */
  summaries: Record<string, string>;
  /** Manual order of the rows (paths), when the view has no sort. */
  rowOrder: string[];
  /** Calendar view: the date property placing the rows. */
  dateProperty: string | null;
  /** Gallery view: the property holding the cover image (else the note's first image). */
  image: string | null;
}

export interface BaseModel {
  /** Folder of the rows (from `file.inFolder("…")`), or null for the whole vault. */
  folder: string | null;
  views: BaseView[];
  displayNames: Record<string, string>;
  columns: Record<string, ColumnMeta>;
  /** Formulas, by name (Obsidian's `formulas:`). */
  formulas: Record<string, string>;
}

export const NAME = "file.name";

export const BASE_SUFFIX = ".base";
export const isBasePath = (path: string) => path.toLowerCase().endsWith(BASE_SUFFIX);

/** "note.statut" → "statut"; "file.name" stays. */
export const propertyOf = (id: string) => (id.startsWith("note.") ? id.slice(5) : id);
/** "statut" → "note.statut" (how the file refers to a note property). */
const idOf = (property: string) => (property === NAME || property.includes(".") ? property : `note.${property}`);

const quote = (value: string) => JSON.stringify(value);

function plain(node: unknown): unknown {
  return node && typeof node === "object" && "toJSON" in node ? (node as { toJSON(): unknown }).toJSON() : node;
}

const FILTER_PATTERNS: [RegExp, (m: RegExpExecArray) => SimpleFilter][] = [
  [/^(?:note\.)?((?:file\.|formula\.)?[\p{L}\p{N}_ -]+?)\s*==\s*"((?:[^"\\]|\\.)*)"$/u, (m) => ({ property: m[1], op: "is", value: JSON.parse(`"${m[2]}"`) })],
  [/^(?:note\.)?((?:file\.|formula\.)?[\p{L}\p{N}_ -]+?)\s*!=\s*"((?:[^"\\]|\\.)*)"$/u, (m) => ({ property: m[1], op: "isNot", value: JSON.parse(`"${m[2]}"`) })],
  [/^(?:note\.)?((?:file\.|formula\.)?[\p{L}\p{N}_ -]+?)\.contains\("((?:[^"\\]|\\.)*)"\)$/u, (m) => ({ property: m[1], op: "contains", value: JSON.parse(`"${m[2]}"`) })],
  [/^(?:note\.)?((?:file\.|formula\.)?[\p{L}\p{N}_ -]+?)\s*==\s*true$/u, (m) => ({ property: m[1], op: "checked", value: "" })],
  [/^(?:note\.)?((?:file\.|formula\.)?[\p{L}\p{N}_ -]+?)\s*(?:==\s*false|!=\s*true)$/u, (m) => ({ property: m[1], op: "unchecked", value: "" })],
  [/^(?:note\.)?((?:file\.|formula\.)?[\p{L}\p{N}_ -]+?)\.isEmpty\(\)$/u, (m) => ({ property: m[1], op: "empty", value: "" })],
  [/^!(?:note\.)?((?:file\.|formula\.)?[\p{L}\p{N}_ -]+?)\.isEmpty\(\)$/u, (m) => ({ property: m[1], op: "notEmpty", value: "" })],
];

export function parseFilter(expression: string): SimpleFilter | null {
  const text = expression.trim();
  for (const [pattern, build] of FILTER_PATTERNS) {
    const m = pattern.exec(text);
    if (m) return build(m);
  }
  return null;
}

export function filterExpression(filter: SimpleFilter): string {
  const p = idOf(filter.property);
  switch (filter.op) {
    case "is":
      return `${p} == ${quote(filter.value)}`;
    case "isNot":
      return `${p} != ${quote(filter.value)}`;
    case "contains":
      return `${p}.contains(${quote(filter.value)})`;
    case "checked":
      return `${p} == true`;
    case "unchecked":
      return `${p} != true`;
    case "empty":
      return `${p}.isEmpty()`;
    case "notEmpty":
      return `!${p}.isEmpty()`;
  }
}

/** The `and` list of a filters node, as strings. */
function andList(node: unknown): string[] {
  const value = plain(node) as { and?: unknown[] } | string | undefined;
  if (typeof value === "string") return [value];
  return Array.isArray(value?.and) ? value.and.filter((f): f is string => typeof f === "string") : [];
}

export interface BaseFile {
  doc: Document;
  model: BaseModel;
}

export function parseBase(text: string): BaseFile {
  const doc = parseDocument(text, { keepSourceTokens: true });
  const root = (plain(doc.contents) ?? {}) as Record<string, unknown>;
  const folderFilter = andList(doc.get("filters", true)).map((f) => /^file\.inFolder\("((?:[^"\\]|\\.)*)"\)$/.exec(f.trim())).find(Boolean);
  const views = (Array.isArray(root.views) ? root.views : []).map((v: Record<string, unknown>): BaseView => {
    const filters = andList(v?.filters);
    const simple = filters.map(parseFilter);
    const group = v?.groupBy as { property?: string } | string | undefined;
    return {
      type: v?.flownoteView === "calendar" ? "calendar" : v?.type === "kanban" ? "board" : typeof v?.type === "string" ? v.type : "table",
      name: typeof v?.name === "string" ? v.name : "Vue",
      order: (Array.isArray(v?.order) ? v.order : []).filter((o): o is string => typeof o === "string").map(propertyOf),
      sort: (Array.isArray(v?.sort) ? v.sort : [])
        .filter((s): s is { property: string; direction?: string } => typeof s?.property === "string")
        .map((s) => ({ property: propertyOf(s.property), direction: String(s.direction).toUpperCase() === "DESC" ? "DESC" : "ASC" })),
      columnSize: Object.fromEntries(Object.entries((v?.columnSize as Record<string, number>) ?? {}).map(([k, n]) => [propertyOf(k), Number(n)])),
      filters: simple.filter((f): f is SimpleFilter => f !== null),
      otherFilters: simple.filter((f) => f === null).length,
      groupBy: typeof group === "string" ? propertyOf(group) : group?.property ? propertyOf(group.property) : null,
      summaries: Object.fromEntries(Object.entries((v?.summaries as Record<string, string>) ?? {}).filter(([, s]) => typeof s === "string").map(([k, s]) => [propertyOf(k), s])),
      rowOrder: (Array.isArray(v?.rowOrder) ? v.rowOrder : []).filter((p): p is string => typeof p === "string"),
      dateProperty: typeof v?.dateProperty === "string" ? propertyOf(v.dateProperty) : null,
      image: typeof v?.image === "string" ? propertyOf(v.image) : null,
    };
  });
  const flownote = (root.flownote as { properties?: Record<string, { type?: string; options?: { value?: unknown; color?: string }[] }> }) ?? {};
  const columns: Record<string, ColumnMeta> = {};
  for (const [key, meta] of Object.entries(flownote.properties ?? {})) {
    const type = COLUMN_TYPES.some(([t]) => t === meta?.type) ? (meta.type as ColumnType) : "text";
    const options = (meta?.options ?? []).map((o) => ({ value: String(o?.value ?? ""), color: (OPTION_COLORS as readonly string[]).includes(o?.color ?? "") ? (o.color as OptionColor) : "default" }));
    columns[key] = { type, options };
  }
  const displayNames: Record<string, string> = {};
  for (const [key, meta] of Object.entries((root.properties as Record<string, { displayName?: string }>) ?? {})) {
    if (typeof meta?.displayName === "string") displayNames[propertyOf(key)] = meta.displayName;
  }
  return {
    doc,
    model: {
      folder: folderFilter ? JSON.parse(`"${folderFilter[1]}"`) : null,
      views: views.length > 0 ? views : [defaultView("table", "Tableau", [NAME])],
      displayNames,
      columns,
      formulas: Object.fromEntries(Object.entries((root.formulas as Record<string, unknown>) ?? {}).filter(([, f]) => typeof f === "string" || typeof f === "number").map(([k, f]) => [k, String(f)])),
    },
  };
}

export function defaultView(type: string, name: string, order: string[]): BaseView {
  return { type, name, order, sort: [], columnSize: {}, filters: [], otherFilters: 0, groupBy: null, summaries: {}, rowOrder: [], dateProperty: null, image: null };
}

/** A new base: its rows are the notes of `folder`. */
export function newBaseFile(folder: string): string {
  return [
    "filters:",
    "  and:",
    `    - file.inFolder(${quote(folder)})`,
    "views:",
    "  - type: table",
    "    name: Tableau",
    "    order:",
    "      - file.name",
    "",
  ].join("\n");
}

/* ---- Edits (on the YAML document) ---- */

function ensureViews(doc: Document, model: BaseModel) {
  if (!isSeq(doc.get("views", true))) doc.set("views", doc.createNode(model.views.map((v) => ({ type: v.type, name: v.name, order: v.order.map(idOf) }))));
}

/** Writes the editable parts of a view; other keys of the view are kept. */
export function writeView(file: BaseFile, index: number, view: BaseView): void {
  const { doc } = file;
  ensureViews(doc, file.model);
  const views = doc.get("views", true);
  if (!isSeq(views)) return;
  if (index >= views.items.length) views.items.push(doc.createNode({ type: "table", name: view.name }) as never);
  const path = ["views", index];
  // Obsidian's own types: its kanban, and a gallery for the calendar it does not have.
  doc.setIn([...path, "type"], view.type === "board" ? "kanban" : view.type === "calendar" ? "cards" : view.type);
  if (view.type === "calendar") doc.setIn([...path, "flownoteView"], "calendar");
  else doc.deleteIn([...path, "flownoteView"]);
  doc.setIn([...path, "name"], view.name);
  doc.setIn([...path, "order"], doc.createNode(view.order.map(idOf)));
  if (view.sort.length) doc.setIn([...path, "sort"], doc.createNode(view.sort.map((s) => ({ property: idOf(s.property), direction: s.direction }))));
  else doc.deleteIn([...path, "sort"]);
  const sizes = Object.entries(view.columnSize);
  if (sizes.length) doc.setIn([...path, "columnSize"], doc.createNode(Object.fromEntries(sizes.map(([k, n]) => [idOf(k), Math.round(n)]))));
  else doc.deleteIn([...path, "columnSize"]);
  // Obsidian refuses a groupBy without its direction.
  const direction = doc.getIn([...path, "groupBy", "direction"]);
  // Like Obsidian: another grouping property starts a new column order.
  if (view.groupBy && doc.getIn([...path, "groupBy", "property"]) !== idOf(view.groupBy)) doc.deleteIn([...path, "groupOrder"]);
  if (view.groupBy) doc.setIn([...path, "groupBy"], doc.createNode({ property: idOf(view.groupBy), direction: direction === "DESC" ? "DESC" : "ASC" }));
  else doc.deleteIn([...path, "groupBy"]);
  // Columns of Obsidian's kanban in the order of the options (an order set in Obsidian is kept).
  const options = view.groupBy ? (file.model.columns[view.groupBy]?.options ?? []) : [];
  if (!view.groupBy) doc.deleteIn([...path, "groupOrder"]);
  else if (view.type === "board" && options.length && !doc.hasIn([...path, "groupOrder"])) doc.setIn([...path, "groupOrder"], doc.createNode(options.map((o) => o.value)));
  const summaries = Object.entries(view.summaries ?? {});
  if (summaries.length) doc.setIn([...path, "summaries"], doc.createNode(Object.fromEntries(summaries.map(([k, s]) => [idOf(k), s]))));
  else doc.deleteIn([...path, "summaries"]);
  if (view.rowOrder?.length) doc.setIn([...path, "rowOrder"], doc.createNode(view.rowOrder));
  else doc.deleteIn([...path, "rowOrder"]);
  if (view.dateProperty) doc.setIn([...path, "dateProperty"], idOf(view.dateProperty));
  else doc.deleteIn([...path, "dateProperty"]);
  if (view.image) doc.setIn([...path, "image"], idOf(view.image));
  else doc.deleteIn([...path, "image"]);
  // Filters: the ones FlowNote edits, then the hand-written ones as they were.
  const previous = andList(doc.getIn([...path, "filters"], true)).filter((f) => parseFilter(f) === null);
  const all = [...view.filters.map(filterExpression), ...previous];
  if (all.length) doc.setIn([...path, "filters"], doc.createNode({ and: all }));
  else doc.deleteIn([...path, "filters"]);
}

/** A formula (Obsidian's `formulas:`), or its removal. */
export function writeFormula(file: BaseFile, name: string, expression: string | null): void {
  const { doc } = file;
  if (expression === null) {
    doc.deleteIn(["formulas", name]);
    return;
  }
  if (!isMap(doc.get("formulas", true))) doc.set("formulas", doc.createNode({}));
  doc.setIn(["formulas", name], expression);
}

export function removeView(file: BaseFile, index: number): void {
  const views = file.doc.get("views", true);
  if (isSeq(views) && views.items.length > 1) views.items.splice(index, 1);
}

/** Type and options of a column, kept under `flownote:`. */
export function writeColumn(file: BaseFile, property: string, meta: ColumnMeta | null): void {
  const { doc } = file;
  const path = ["flownote", "properties", property];
  if (!meta) {
    doc.deleteIn(path);
    return;
  }
  if (!isMap(doc.get("flownote", true))) doc.set("flownote", doc.createNode({ properties: {} }));
  if (!isMap(doc.getIn(["flownote", "properties"], true))) doc.setIn(["flownote", "properties"], doc.createNode({}));
  doc.setIn(path, doc.createNode(meta.options.length ? { type: meta.type, options: meta.options.map((o) => ({ value: o.value, color: o.color })) } : { type: meta.type }));
}

/** A property renamed everywhere in the base file (columns, sorts, filters, sizes, group, meta). */
export function renameInBase(file: BaseFile, from: string, to: string): void {
  file.model.views.forEach((view, index) => {
    const rename = (p: string) => (p === from ? to : p);
    writeView(file, index, {
      ...view,
      order: view.order.map(rename),
      sort: view.sort.map((s) => ({ ...s, property: rename(s.property) })),
      columnSize: Object.fromEntries(Object.entries(view.columnSize).map(([k, n]) => [rename(k), n])),
      filters: view.filters.map((f) => ({ ...f, property: rename(f.property) })),
      groupBy: view.groupBy ? rename(view.groupBy) : null,
    });
  });
  const meta = file.model.columns[from];
  if (meta) {
    writeColumn(file, from, null);
    writeColumn(file, to, meta);
  }
  const display = file.doc.getIn(["properties", idOf(from)], true);
  if (display && isMap(display)) {
    file.doc.deleteIn(["properties", idOf(from)]);
    file.doc.setIn(["properties", idOf(to)], display);
  }
}

export function serializeBase(file: BaseFile): string {
  return file.doc.toString({ lineWidth: 0 });
}

/** Re-reads the model after edits. */
export function reparse(file: BaseFile): BaseFile {
  return parseBase(serializeBase(file));
}

