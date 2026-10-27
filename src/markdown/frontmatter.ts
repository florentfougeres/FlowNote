import { isMap, isScalar, isSeq, parseDocument, type Document, type Pair, type Scalar } from "yaml";

/**
 * Note properties (YAML frontmatter). Edits go
 * through the YAML document model, which keeps comments, key order and the
 * style of untouched values; a frontmatter that is never edited is not
 * rewritten at all.
 *
 * `raw` is the frontmatter as stored in the file: "---\n<yaml>\n---".
 */

export type PropertyType = "text" | "list" | "number" | "checkbox" | "date" | "datetime" | "other";
export type PropertyValue = string | number | boolean | string[] | null;

export interface Property {
  key: string;
  type: PropertyType;
  value: PropertyValue;
}

export interface Properties {
  properties: Property[];
  /** Set when the YAML cannot be parsed: the frontmatter is then only editable as text. */
  error: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;

function inner(raw: string): string {
  const lines = raw.split("\n");
  return lines.slice(1, -1).join("\n");
}

function wrap(yaml: string): string {
  return `---\n${yaml.replace(/\n+$/, "")}${yaml.trim() ? "\n" : ""}---`;
}

function parse(raw: string | null): Document {
  return parseDocument(raw ? inner(raw) : "", { keepSourceTokens: true });
}

function typeOf(value: unknown): { type: PropertyType; value: PropertyValue } {
  if (Array.isArray(value)) return { type: "list", value: value.map((v) => (v === null || v === undefined ? "" : String(v))) };
  if (typeof value === "boolean") return { type: "checkbox", value };
  if (typeof value === "number") return { type: "number", value };
  if (value instanceof Date) return { type: "date", value: value.toISOString().slice(0, 10) };
  if (value === null || value === undefined) return { type: "text", value: null };
  if (typeof value === "string") {
    if (DATE.test(value)) return { type: "date", value };
    if (DATETIME.test(value)) return { type: "datetime", value };
    return { type: "text", value };
  }
  return { type: "other", value: JSON.stringify(value) };
}

/**
 * Tags written on one line (`tags: projet, perso` or `tags: projet perso`)
 * are a list for Obsidian too: shown as tags, written back as a YAML list
 * only when they are edited.
 */
function tagsAsList(key: string, value: unknown): unknown {
  if ((key !== "tags" && key !== "tag") || typeof value !== "string" || !value.trim()) return value;
  return value.split(/[,\s]+/).map((t) => t.replace(/^#/, "")).filter(Boolean);
}

/** The front matter at the top of a note, as the editor reads it: `---` lines (trailing spaces allowed) around YAML, possibly empty; BOM and CRLF accepted. */
const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

export interface Frontmatter {
  /** The whole block: fences, YAML and the line break after the closing fence. */
  block: string;
  /** The YAML between the fences, as written (line endings kept). */
  yaml: string;
  /** What follows the block. */
  body: string;
}

/** The note's front matter, or null when it has none. */
export function splitFrontmatter(text: string): Frontmatter | null {
  const match = FRONTMATTER.exec(text);
  return match ? { block: match[0], yaml: match[1] ?? "", body: text.slice(match[0].length) } : null;
}

/** `raw` for the property functions below, from the YAML between the fences. */
export const frontmatterRaw = (yaml: string) => `---\n${yaml.replace(/\r\n/g, "\n")}\n---`;

/** The properties of a note (none without front matter). */
export function noteProperties(text: string): Property[] {
  const front = splitFrontmatter(text);
  return front ? readProperties(frontmatterRaw(front.yaml)).properties : [];
}

export function readProperties(raw: string | null): Properties {
  if (!raw) return { properties: [], error: null };
  const doc = parse(raw);
  if (doc.errors.length > 0) return { properties: [], error: doc.errors[0].message };
  const contents = doc.contents;
  if (contents === null) return { properties: [], error: null };
  if (!isMap(contents)) return { properties: [], error: "Les propriétés doivent être une liste de clés." };
  const properties = contents.items.map((pair) => {
    const key = String(isScalar(pair.key) ? pair.key.value : pair.key);
    const json = doc.getIn([key]) as unknown;
    const plain = isSeq(json) || isMap(json) ? (json as { toJSON(): unknown }).toJSON() : isScalar(json) ? (json as Scalar).value : json;
    return { key, ...typeOf(tagsAsList(key, plain)) };
  });
  return { properties, error: null };
}

function stringify(doc: Document): string {
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

/** Sets a property (keeping a list's flow or block style); `undefined` removes it. Returns the new frontmatter, or null when empty. */
export function setProperty(raw: string | null, key: string, value: PropertyValue | undefined): string | null {
  const doc = parse(raw);
  if (value === undefined) {
    doc.delete(key);
  } else {
    const current = doc.get(key, true);
    if (Array.isArray(value) && isSeq(current)) {
      // Keep "[a, b]" or the "- a" style of the existing list.
      current.items = value.map((v) => doc.createNode(v));
    } else if (isScalar(current) && !Array.isArray(value)) {
      current.value = value;
    } else {
      doc.set(key, doc.createNode(value));
    }
  }
  const map = doc.contents;
  if (!map || (isMap(map) && map.items.length === 0)) return null;
  return wrap(stringify(doc));
}

export function renameProperty(raw: string, oldKey: string, newKey: string): string {
  const doc = parse(raw);
  const map = doc.contents;
  if (!isMap(map) || oldKey === newKey) return raw;
  if (map.items.some((p) => isScalar(p.key) && p.key.value === newKey)) throw new Error(`La propriété « ${newKey} » existe déjà.`);
  const pair = map.items.find((p) => isScalar(p.key) && p.key.value === oldKey) as Pair<Scalar, unknown> | undefined;
  if (!pair) return raw;
  // Change the key in place: a comment attached to it stays.
  pair.key.value = newKey;
  return wrap(stringify(doc));
}

/** A property used in the vault: its name, the type its values have most often, and the number of notes carrying it. */
export interface PropertySuggestion {
  key: string;
  type: PropertyType;
  count: number;
}

/** The property names of the vault's notes, the most used first (offered when adding a property, as Obsidian does). */
export function vaultPropertyKeys(notes: [string, string][]): PropertySuggestion[] {
  const keys = new Map<string, { count: number; types: Map<PropertyType, number> }>();
  for (const [, text] of notes) {
    for (const { key, type, value } of noteProperties(text)) {
      const entry = keys.get(key) ?? { count: 0, types: new Map() };
      entry.count++;
      // An empty value says nothing of the type.
      if (value !== null) entry.types.set(type, (entry.types.get(type) ?? 0) + 1);
      keys.set(key, entry);
    }
  }
  return [...keys]
    .map(([key, { count, types }]) => ({ key, count, type: [...types].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ("text" as PropertyType) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "fr"));
}
