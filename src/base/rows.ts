import { readProperties, renameProperty, setProperty, type PropertyValue } from "../markdown/frontmatter";
import { noteTitle } from "../vault/links";
import { evaluateFormulas, numeric, type FValue } from "./formula";
import { NAME, type BaseModel, type ColumnMeta, type ColumnType, type SimpleFilter, type SortRule } from "./baseFile";

/** File properties of a row (Obsidian's `file.*`). */
export interface FileInfo {
  name: string;
  path: string;
  folder: string;
  /** Creation and modification times (ms), when the vault knows them. */
  ctime: number | null;
  mtime: number | null;
  tags: string[];
  /** Number of links to other notes. */
  links: number;
}

/** A row of a base: one note of its folder, with its properties. */
export interface BaseRow {
  path: string;
  name: string;
  values: Record<string, PropertyValue>;
  file: FileInfo;
  /** First image of the note (gallery cover), as written in the link. */
  image: string | null;
}

/** File properties offered as columns. */
export const FILE_PROPERTIES: [string, string][] = [
  ["file.ctime", "Créé le"],
  ["file.mtime", "Modifié le"],
  ["file.folder", "Dossier"],
  ["file.tags", "Tags (fichier)"],
  ["file.links", "Liens"],
];

const INLINE_TAG = /(?:^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
const IMAGE = /!\[\[([^\]|#]+\.(?:png|jpe?g|gif|webp|svg|avif|bmp))(?:[|#][^\]]*)?\]\]|!\[[^\]]*\]\((?!https?:)([^)\s]+\.(?:png|jpe?g|gif|webp|svg|avif|bmp))\)|!\[[^\]]*\]\((https?:[^)\s]+)\)/i;

const FRONTMATTER = /^(﻿?---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/;

/** The notes of the base's folder (sub-folders included, like `file.inFolder`). */
export function rowsOf(notes: [string, string][], model: BaseModel, stats: { path: string; ctime: number; mtime: number }[] = []): BaseRow[] {
  const prefix = model.folder ? `${model.folder.replace(/\/+$/, "")}/` : "";
  const times = new Map(stats.map((s) => [s.path, s]));
  return notes
    .filter(([path]) => path.endsWith(".md") && path.startsWith(prefix))
    .map(([path, text]) => {
      const match = FRONTMATTER.exec(text);
      const values: Record<string, PropertyValue> = {};
      if (match) for (const p of readProperties(`---\n${match[2].replace(/\r\n/g, "\n")}\n---`).properties) values[p.key] = p.value;
      const body = (match ? text.slice(match[0].length) : text).replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "");
      const fmTags = Array.isArray(values.tags) ? values.tags.map(String) : typeof values.tags === "string" ? [values.tags] : [];
      const tags = [...new Set([...fmTags, ...[...body.matchAll(INLINE_TAG)].map((m) => m[1])].map((t) => t.replace(/^#/, "")))];
      const image = IMAGE.exec(body);
      const time = times.get(path);
      return {
        path,
        name: noteTitle(path),
        values,
        file: {
          name: noteTitle(path),
          path,
          folder: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
          ctime: time?.ctime ?? null,
          mtime: time?.mtime ?? null,
          tags,
          // Links, not embeds ("![[…]]"), like Obsidian's file.links.
          links: (body.match(/(?<!!)\[\[[^\]]+\]\]|(?<!!)\[[^\]]*\]\((?!https?:)[^)]+\.md\)/g) ?? []).length,
        },
        image: image ? (image[1] ?? image[2] ?? image[3]) : null,
      };
    });
}

const formulaCache = new WeakMap<BaseRow, { source: Record<string, string>; results: Record<string, FValue | Error> }>();

/** Value of a column for a row: a note property, a file property or a formula (an Error when it fails). */
export function cellValue(row: BaseRow, id: string, formulas: Record<string, string> = {}): unknown {
  if (id === NAME) return row.name;
  if (id.startsWith("file.")) {
    const key = id.slice(5);
    const v = (row.file as unknown as Record<string, unknown>)[key];
    return (key === "ctime" || key === "mtime") && typeof v === "number" ? new Date(v).toISOString().slice(0, 16) : v;
  }
  if (id.startsWith("formula.")) {
    let cached = formulaCache.get(row);
    if (!cached || cached.source !== formulas) {
      cached = { source: formulas, results: evaluateFormulas(formulas, row.values, row.file as unknown as Record<string, unknown>) };
      formulaCache.set(row, cached);
    }
    return cached.results[id.slice(8)];
  }
  return row.values[id];
}

/** Rows in the view's manual order (new rows at the end, by name). */
export function inManualOrder(rows: BaseRow[], order: string[]): BaseRow[] {
  const rank = new Map(order.map((p, i) => [p, i]));
  return [...rows].sort((a, b) => (rank.get(a.path) ?? Infinity) - (rank.get(b.path) ?? Infinity) || a.name.localeCompare(b.name, "fr", { numeric: true }));
}

/** Every property used by the rows, in order of first appearance. */
export function propertiesOf(rows: BaseRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row.values)) seen.add(key);
  return [...seen];
}

/** The column's type: as set in the base, else guessed from the values. */
export function columnMeta(model: BaseModel, property: string, rows: BaseRow[]): ColumnMeta {
  const set = model.columns[property];
  if (set) return set;
  const values = rows.map((r) => r.values[property]).filter((v) => v !== null && v !== undefined && v !== "");
  let type: ColumnType = "text";
  if (values.length && values.every((v) => typeof v === "boolean")) type = "checkbox";
  else if (values.length && values.every((v) => typeof v === "number")) type = "number";
  else if (values.length && values.every((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))) type = "date";
  else if (values.some((v) => Array.isArray(v))) type = "multi";
  else if (values.length && values.every((v) => typeof v === "string" && /^https?:\/\//.test(v))) type = "url";
  return { type, options: [] };
}

/** Options of a select column: the ones set (with their colors), then the values met in the rows. */
export function optionsOf(meta: ColumnMeta, property: string, rows: BaseRow[]): ColumnMeta["options"] {
  const options = [...meta.options];
  for (const row of rows) {
    const value = row.values[property];
    for (const v of Array.isArray(value) ? value : value === null || value === undefined || value === "" ? [] : [String(value)]) {
      if (!options.some((o) => o.value === v)) options.push({ value: v, color: "default" });
    }
  }
  return options;
}

/** Text of a value, for search, sort and display. */
export function textOf(value: PropertyValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

let currentFormulas: Record<string, string> = {};
const valueOf = (row: BaseRow, property: string): PropertyValue | undefined => {
  const v = cellValue(row, property, currentFormulas);
  if (v instanceof Error || v === undefined) return undefined;
  if (typeof v === "object" && v !== null && !Array.isArray(v)) return numeric(v as FValue) as PropertyValue;
  return v as PropertyValue;
};

export function matches(row: BaseRow, filter: SimpleFilter): boolean {
  const value = valueOf(row, filter.property);
  const list = Array.isArray(value) ? value.map(String) : value === null || value === undefined || value === "" ? [] : [String(value)];
  switch (filter.op) {
    case "is":
      return list.includes(filter.value);
    case "isNot":
      return !list.includes(filter.value);
    case "contains":
      return list.some((v) => v.toLowerCase().includes(filter.value.toLowerCase()));
    case "checked":
      return value === true;
    case "unchecked":
      return value !== true;
    case "empty":
      return list.length === 0;
    case "notEmpty":
      return list.length > 0;
  }
}

function compare(a: PropertyValue | string | undefined, b: PropertyValue | string | undefined): number {
  const empty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
  if (empty(a) || empty(b)) return empty(a) === empty(b) ? 0 : empty(a) ? 1 : -1; // empty last
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(b) - Number(a);
  return textOf(a as PropertyValue).localeCompare(textOf(b as PropertyValue), "fr", { numeric: true, sensitivity: "base" });
}

/** Rows filtered, searched and sorted as the view says (by name when no sort). */
export function viewRows(rows: BaseRow[], filters: SimpleFilter[], sort: SortRule[], search = "", formulas: Record<string, string> = {}, rowOrder: string[] = []): BaseRow[] {
  const q = search.trim().toLowerCase();
  currentFormulas = formulas;
  const manual = sort.length === 0 && rowOrder.length > 0;
  return (manual ? inManualOrder(rows, rowOrder) : rows)
    .filter((row) => filters.every((f) => matches(row, f)))
    .filter((row) => !q || row.name.toLowerCase().includes(q) || Object.values(row.values).some((v) => textOf(v).toLowerCase().includes(q)))
    .sort((a, b) => {
      for (const rule of sort) {
        const c = compare(valueOf(a, rule.property), valueOf(b, rule.property));
        if (c !== 0) return rule.direction === "DESC" ? -c : c;
      }
      return manual ? 0 : a.name.localeCompare(b.name, "fr", { numeric: true });
    });
}

/**
 * The note with one property set (or removed when `value` is undefined); the
 * rest of the file is kept byte for byte, line endings included.
 */
export function setNoteProperty(markdown: string, key: string, value: PropertyValue | undefined): string {
  const match = FRONTMATTER.exec(markdown);
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const raw = setProperty(match ? `---\n${match[2].replace(/\r\n/g, "\n")}\n---` : null, key, value);
  if (raw === null) return match ? markdown.slice(match[0].length) : markdown;
  const block = raw.replace(/\n/g, eol);
  return match ? `${block}${match[3].replace(/^\r?\n---/, "")}${markdown.slice(match[0].length)}` : `${block}${eol}${markdown}`;
}

/** The note with a property renamed (value, position and comments kept). */
export function renameNoteProperty(markdown: string, from: string, to: string): string {
  const match = FRONTMATTER.exec(markdown);
  if (!match) return markdown;
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const raw = renameProperty(`---\n${match[2].replace(/\r\n/g, "\n")}\n---`, from, to);
  return `${raw.replace(/\n/g, eol)}${match[3].replace(/^\r?\n---/, "")}${markdown.slice(match[0].length)}`;
}

/** Calculations offered at the bottom of a column (Obsidian's summaries names). */
export const SUMMARIES: { id: string; label: string; types: "all" | "number" | "checkbox" | "date" }[] = [
  { id: "Filled", label: "Remplies", types: "all" },
  { id: "Empty", label: "Vides", types: "all" },
  { id: "Unique", label: "Valeurs uniques", types: "all" },
  { id: "Sum", label: "Somme", types: "number" },
  { id: "Average", label: "Moyenne", types: "number" },
  { id: "Min", label: "Minimum", types: "number" },
  { id: "Max", label: "Maximum", types: "number" },
  { id: "Checked", label: "Cochées", types: "checkbox" },
  { id: "Unchecked", label: "Non cochées", types: "checkbox" },
  { id: "Earliest", label: "La plus ancienne", types: "date" },
  { id: "Latest", label: "La plus récente", types: "date" },
];

/** A column's summary as text, or "" when it does not apply. */
export function summarize(rows: BaseRow[], id: string, kind: string, formulas: Record<string, string> = {}): string {
  const values = rows.map((r) => cellValue(r, id, formulas)).map((v) => (v instanceof Error ? undefined : v));
  const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
  const filled = values.filter((v) => !isEmpty(v));
  const numbers = filled.map((v) => (typeof v === "number" ? v : numeric(v as FValue))).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const dates = filled.filter((v): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)).sort();
  const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("fr-FR") : n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }));
  const day = (d: string) => new Date(d.length === 10 ? `${d}T12:00` : d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  switch (kind) {
    case "Filled":
      return fmt(filled.length);
    case "Empty":
      return fmt(rows.length - filled.length);
    case "Unique":
      return fmt(new Set(filled.flatMap((v) => (Array.isArray(v) ? v.map(String) : [JSON.stringify(v)]))).size);
    case "Sum":
      return numbers.length ? fmt(numbers.reduce((a, b) => a + b, 0)) : "";
    case "Average":
      return numbers.length ? fmt(numbers.reduce((a, b) => a + b, 0) / numbers.length) : "";
    case "Min":
      return numbers.length ? fmt(Math.min(...numbers)) : "";
    case "Max":
      return numbers.length ? fmt(Math.max(...numbers)) : "";
    case "Checked":
      return fmt(values.filter((v) => v === true).length);
    case "Unchecked":
      return fmt(values.filter((v) => v !== true).length);
    case "Earliest":
      return dates.length ? day(dates[0]) : "";
    case "Latest":
      return dates.length ? day(dates[dates.length - 1]) : "";
  }
  return "";
}
