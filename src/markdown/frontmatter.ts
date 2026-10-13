import { isMap, isScalar, isSeq, parseDocument, type Document, type Pair, type Scalar } from "yaml";

/**
 * Note properties (YAML frontmatter), like Obsidian's Properties view. Edits go
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
    return { key, ...typeOf(plain) };
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

/** Adds a new empty property with a unique name. */
export function addProperty(raw: string | null, base = "propriété"): { raw: string; key: string } {
  const taken = new Set(readProperties(raw).properties.map((p) => p.key));
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base} ${i}`;
  const doc = parse(raw);
  doc.set(key, null);
  return { raw: wrap(stringify(doc)), key };
}
