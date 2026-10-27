import { Document, isMap, isScalar, isSeq, parseDocument, type Node as YamlNode } from "yaml";

/**
 * Bases (databases) in Obsidian's own format: a `Name.base` YAML
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

/** The option colors. */
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
  /** Those filters as written (expressions, `or:`/`not:` groups), evaluated on the rows. */
  where: unknown[];
  groupBy: string | null;
  /** Calculation at the bottom of each column (Obsidian's `summaries`). */
  summaries: Record<string, string>;
  /** Manual order of the rows (paths), when the view has no sort. */
  rowOrder: string[];
  /** Calendar view: the date property placing the rows. */
  dateProperty: string | null;
  /** Gallery view: the property holding the cover image (else the note's first image). */
  image: string | null;
  /** The view as written, for the options of other views (TaskNotes' calendar…). Read only. */
  options: Record<string, unknown>;
}

export interface BaseModel {
  /** Folder of the rows (from `file.inFolder("…")`), or null for the whole vault. */
  folder: string | null;
  views: BaseView[];
  displayNames: Record<string, string>;
  columns: Record<string, ColumnMeta>;
  /** Formulas, by name (Obsidian's `formulas:`). */
  formulas: Record<string, string>;
  /** The base's other filters on the rows (besides its folder), as written. */
  where: unknown[];
}

export const NAME = "file.name";

export const BASE_SUFFIX = ".base";
export const isBasePath = (path: string) => path.toLowerCase().endsWith(BASE_SUFFIX);

/** "note.statut" → "statut"; "file.name" stays. */
const propertyOf = (id: string) => (id.startsWith("note.") ? id.slice(5) : id);
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
/** The filters of an `and:` list (or a single filter), as written: expressions and nested groups. */
function filterItems(node: unknown): unknown[] {
  const value = plain(node) as { and?: unknown[] } | string | null | undefined;
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value.and)) return value.and;
  // A top-level `or:` or `not:` group is one filter.
  return [value];
}

/** The sort rules of a view: Obsidian writes `property:`, TaskNotes `column:`. */
function sortRules(sort: unknown): SortRule[] {
  return (Array.isArray(sort) ? sort : [])
    .map((s: { property?: unknown; column?: unknown; direction?: unknown }) => ({ property: typeof s?.property === "string" ? s.property : typeof s?.column === "string" ? s.column : null, direction: s?.direction }))
    .filter((s): s is { property: string; direction: unknown } => s.property !== null)
    .map((s) => ({ property: propertyOf(s.property), direction: String(s.direction).toUpperCase() === "DESC" ? "DESC" : "ASC" }));
}

export interface BaseFile {
  doc: Document;
  model: BaseModel;
  /** The text it was read from: what an edit leaves unchanged is written back from it. */
  source: string;
}

export function parseBase(text: string): BaseFile {
  const doc = parseDocument(text, { keepSourceTokens: true });
  const root = (plain(doc.contents) ?? {}) as Record<string, unknown>;
  const folderOf = (f: unknown) => (typeof f === "string" ? /^file\.inFolder\("((?:[^"\\]|\\.)*)"\)$/.exec(f.trim()) : null);
  const baseFilters = filterItems(doc.get("filters", true));
  const folderFilter = baseFilters.map(folderOf).find(Boolean);
  const views = (Array.isArray(root.views) ? root.views : []).map((v: Record<string, unknown>): BaseView => {
    const items = filterItems(v?.filters);
    const simple = items.map((f) => (typeof f === "string" ? parseFilter(f) : null));
    const group = v?.groupBy as { property?: string } | string | undefined;
    return {
      type: v?.flownoteView === "calendar" ? "calendar" : v?.type === "kanban" ? "board" : typeof v?.type === "string" ? v.type : "table",
      name: typeof v?.name === "string" ? v.name : "Vue",
      order: (Array.isArray(v?.order) ? v.order : []).filter((o): o is string => typeof o === "string").map(propertyOf),
      sort: sortRules(v?.sort),
      columnSize: Object.fromEntries(Object.entries((v?.columnSize as Record<string, number>) ?? {}).map(([k, n]) => [propertyOf(k), Number(n)])),
      filters: simple.filter((f): f is SimpleFilter => f !== null),
      otherFilters: simple.filter((f) => f === null).length,
      where: items.filter((_, i) => simple[i] === null),
      groupBy: typeof group === "string" ? propertyOf(group) : group?.property ? propertyOf(group.property) : null,
      summaries: Object.fromEntries(Object.entries((v?.summaries as Record<string, string>) ?? {}).filter(([, s]) => typeof s === "string").map(([k, s]) => [propertyOf(k), s])),
      rowOrder: (Array.isArray(v?.rowOrder) ? v.rowOrder : []).filter((p): p is string => typeof p === "string"),
      dateProperty: typeof v?.dateProperty === "string" ? propertyOf(v.dateProperty) : null,
      image: typeof v?.image === "string" ? propertyOf(v.image) : null,
      options: v && typeof v === "object" ? v : {},
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
    source: text,
    model: {
      folder: folderFilter ? JSON.parse(`"${folderFilter[1]}"`) : null,
      views: views.length > 0 ? views : [defaultView("table", "Tableau", [NAME])],
      displayNames,
      columns,
      where: baseFilters.filter((f) => !folderOf(f) || folderOf(f) !== folderFilter),
      formulas: Object.fromEntries(Object.entries((root.formulas as Record<string, unknown>) ?? {}).filter(([, f]) => typeof f === "string" || typeof f === "number").map(([k, f]) => [k, String(f)])),
    },
  };
}

export function defaultView(type: string, name: string, order: string[]): BaseView {
  return { type, name, order, sort: [], columnSize: {}, filters: [], otherFilters: 0, where: [], groupBy: null, summaries: {}, rowOrder: [], dateProperty: null, image: null, options: {} };
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

/**
 * Writes the editable parts of a view that changed; other keys of the view,
 * and the parts left as they were, are kept as written (comments included).
 */
export function writeView(file: BaseFile, index: number, view: BaseView): void {
  const { doc } = file;
  ensureViews(doc, file.model);
  const views = doc.get("views", true);
  if (!isSeq(views)) return;
  const before = index < views.items.length ? file.model.views[index] : undefined;
  if (index >= views.items.length) views.items.push(doc.createNode({ type: "table", name: view.name }) as never);
  const changed = (key: keyof BaseView) => !before || JSON.stringify(before[key]) !== JSON.stringify(view[key]);
  const path = ["views", index];
  if (changed("type")) {
    // Obsidian's own types: its kanban, and a gallery for the calendar it does not have.
    doc.setIn([...path, "type"], view.type === "board" ? "kanban" : view.type === "calendar" ? "cards" : view.type);
    if (view.type === "calendar") doc.setIn([...path, "flownoteView"], "calendar");
    else doc.deleteIn([...path, "flownoteView"]);
  }
  if (changed("name")) doc.setIn([...path, "name"], view.name);
  if (changed("order")) doc.setIn([...path, "order"], doc.createNode(view.order.map(idOf)));
  if (changed("sort")) {
    // TaskNotes writes `column:` where Obsidian writes `property:`: the key in use is kept.
    const key = doc.hasIn([...path, "sort", 0, "column"]) ? "column" : "property";
    if (view.sort.length) doc.setIn([...path, "sort"], doc.createNode(view.sort.map((s) => ({ [key]: idOf(s.property), direction: s.direction }))));
    else doc.deleteIn([...path, "sort"]);
  }
  if (changed("columnSize")) {
    const sizes = Object.entries(view.columnSize);
    if (sizes.length) doc.setIn([...path, "columnSize"], doc.createNode(Object.fromEntries(sizes.map(([k, n]) => [idOf(k), Math.round(n)]))));
    else doc.deleteIn([...path, "columnSize"]);
  }
  if (changed("groupBy") || changed("type")) {
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
  }
  if (changed("summaries")) {
    const summaries = Object.entries(view.summaries ?? {});
    if (summaries.length) doc.setIn([...path, "summaries"], doc.createNode(Object.fromEntries(summaries.map(([k, s]) => [idOf(k), s]))));
    else doc.deleteIn([...path, "summaries"]);
  }
  if (changed("rowOrder")) {
    if (view.rowOrder?.length) doc.setIn([...path, "rowOrder"], doc.createNode(view.rowOrder));
    else doc.deleteIn([...path, "rowOrder"]);
  }
  if (changed("dateProperty")) {
    if (view.dateProperty) doc.setIn([...path, "dateProperty"], idOf(view.dateProperty));
    else doc.deleteIn([...path, "dateProperty"]);
  }
  if (changed("image")) {
    if (view.image) doc.setIn([...path, "image"], idOf(view.image));
    else doc.deleteIn([...path, "image"]);
  }
  if (changed("filters")) {
    // The filters FlowNote edits, then the hand-written ones (expressions, groups) as they were.
    const previous = filterItems(doc.getIn([...path, "filters"], true)).filter((f) => typeof f !== "string" || parseFilter(f) === null);
    const all = [...view.filters.map(filterExpression), ...previous];
    if (all.length) doc.setIn([...path, "filters"], doc.createNode({ and: all }));
    else doc.deleteIn([...path, "filters"]);
  }
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

/** The name a column shows (Obsidian's `properties: X: displayName:`); null shows the property's own name. */
export function writeDisplayName(file: BaseFile, property: string, name: string | null): void {
  const { doc } = file;
  const path = ["properties", idOf(property)];
  if (name === null) {
    doc.deleteIn([...path, "displayName"]);
    const left = doc.getIn(path, true);
    if (isMap(left) && left.items.length === 0) doc.deleteIn(path);
    const all = doc.get("properties", true);
    if (isMap(all) && all.items.length === 0) doc.delete("properties");
    return;
  }
  if (!isMap(doc.get("properties", true))) doc.set("properties", doc.createNode({}));
  if (!isMap(doc.getIn(path, true))) doc.setIn(path, doc.createNode({}));
  doc.setIn([...path, "displayName"], name);
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

const sameNode = (a: unknown, b: unknown) => JSON.stringify((a as YamlNode | null)?.toJSON?.() ?? a ?? null) === JSON.stringify((b as YamlNode | null)?.toJSON?.() ?? b ?? null);
const mapKeys = (node: unknown) => (isMap(node) ? node.items.map((p) => (isScalar(p.key) ? String(p.key.value) : null)) : []);

/** A node as YAML text on its own, its later lines indented by `column`. */
function nodeText(node: YamlNode, column: number): string {
  const doc = new Document();
  doc.contents = node as never;
  return doc
    .toString({ lineWidth: 0 })
    .replace(/\n$/, "")
    .split("\n")
    .map((line, i) => (i === 0 || line === "" ? line : " ".repeat(column) + line))
    .join("\n");
}

/**
 * The text replacements turning the source of `before` into `after`, down to
 * the smallest nodes that changed; false when a change cannot be placed in
 * the source (a new key, a list that grew, a flow collection that becomes a
 * block…).
 */
function patches(source: string, before: unknown, after: unknown, edits: [number, number, string][]): boolean {
  if (sameNode(before, after)) return true;
  if (isMap(before) && isMap(after) && JSON.stringify(mapKeys(before)) === JSON.stringify(mapKeys(after))) {
    return before.items.every((pair, i) => patches(source, pair.value, after.items[i].value, edits));
  }
  if (isSeq(before) && isSeq(after) && before.items.length === after.items.length) {
    return before.items.every((item, i) => patches(source, item, after.items[i], edits));
  }
  const node = before as YamlNode | null;
  if (!node?.range || !after || typeof after !== "object") return false;
  // A changed value keeps its quotes ("Today" stays quoted).
  if (isScalar(before) && isScalar(after) && !after.type) after.type = before.type;
  const start = node.range[0];
  const end = start + source.slice(start, node.range[1]).replace(/\s+$/, "").length;
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const column = start - lineStart;
  const text = nodeText(after as YamlNode, column);
  // A block can only replace a node that starts its line (after "- " for a list item).
  const blockStart = /^[ \t]*(?:- +)*$/.test(source.slice(lineStart, start));
  if (text.includes("\n") && (!blockStart || (isScalar(before) && !isScalar(after)) || ((isMap(before) || isSeq(before)) && before.flow))) return false;
  edits.push([start, end, text]);
  return true;
}

/**
 * The base as text. Only what changed since it was read is rewritten: the
 * rest (indentation, comments, quotes) stays as written, so a view renamed
 * in FlowNote is a one-line change in a file written by Obsidian or
 * TaskNotes. When a change cannot be placed that way, the whole file is
 * written again.
 */
export function serializeBase(file: BaseFile): string {
  const edits: [number, number, string][] = [];
  const original = parseDocument(file.source, { keepSourceTokens: true });
  if (!original.errors.length && patches(file.source, original.contents, file.doc.contents, edits)) {
    let text = file.source;
    for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) text = text.slice(0, start) + replacement + text.slice(end);
    return text;
  }
  return file.doc.toString({ lineWidth: 0 });
}

/** Re-reads the model after edits. */
export function reparse(file: BaseFile): BaseFile {
  return parseBase(serializeBase(file));
}

