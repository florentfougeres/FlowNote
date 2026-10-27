/**
 * Canvases are Obsidian's `Name.canvas` files (JSON Canvas): cards placed on
 * an infinite board (a note of the vault, Markdown text, a web link, a group)
 * and arrows between them.
 *
 * The file is written the way Obsidian 1.14 writes it, so that a canvas
 * edited here and in Obsidian gives clean diffs in Git: tab indentation, an
 * object whose values are all plain written on one line, cards ordered by
 * depth (groups behind), keys in Obsidian's order, unknown keys kept first.
 */

export const CANVAS_SUFFIX = ".canvas";

export const isCanvasPath = (path: string) => path.toLowerCase().endsWith(CANVAS_SUFFIX);

export type Side = "top" | "right" | "bottom" | "left";
export type End = "none" | "arrow";

export interface CanvasNode {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  /** A preset ("1" to "6") or a hex color. */
  color?: string;
  text?: string;
  file?: string;
  /** Heading or block of the file (`#Titre`). */
  subpath?: string;
  url?: string;
  label?: string;
  background?: string;
  backgroundStyle?: string;
  [key: string]: unknown;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: Side;
  /** Absent: no arrow at the start. */
  fromEnd?: End;
  toNode: string;
  toSide: Side;
  /** Absent: an arrow at the end. */
  toEnd?: End;
  color?: string;
  label?: string;
  [key: string]: unknown;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  [key: string]: unknown;
}

/** Obsidian's six preset colors, by number. */
export const CANVAS_COLORS: Record<string, { name: string; value: string }> = {
  "1": { name: "Rouge", value: "#fb464c" },
  "2": { name: "Orange", value: "#e9973f" },
  "3": { name: "Jaune", value: "#e0de71" },
  "4": { name: "Vert", value: "#44cf6e" },
  "5": { name: "Cyan", value: "#53dfdd" },
  "6": { name: "Violet", value: "#a882ff" },
};

/** CSS color of a card or arrow, or null for the default. */
export function colorValue(color: string | undefined): string | null {
  if (!color) return null;
  return CANVAS_COLORS[color]?.value ?? (/^#[0-9a-f]{3,8}$/i.test(color) ? color : null);
}

const SIDES: Side[] = ["top", "right", "bottom", "left"];
const isSide = (value: unknown): value is Side => SIDES.includes(value as Side);
const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/** The side of `from` that faces `to` (Obsidian's choice when an arrow has no side). */
export function facingSide(from: CanvasNode, to: CanvasNode): Side {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  return Math.abs(dx) * from.height > Math.abs(dy) * from.width ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top";
}

/** Reads a canvas file; an empty file is an empty canvas, null when it is not a canvas at all. */
export function parseCanvas(text: string): CanvasData | null {
  if (!text.trim()) return { nodes: [], edges: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const nodes = (Array.isArray(data.nodes) ? data.nodes : [])
    .filter((n): n is Record<string, unknown> => !!n && typeof n === "object" && typeof (n as { id?: unknown }).id === "string")
    .map((n) => ({ ...n, x: num(n.x, 0), y: num(n.y, 0), width: num(n.width, 250), height: num(n.height, 60) }) as CanvasNode);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = (Array.isArray(data.edges) ? data.edges : [])
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && byId.has(e.fromNode as string) && byId.has(e.toNode as string))
    .map((e) => {
      const from = byId.get(e.fromNode as string)!;
      const to = byId.get(e.toNode as string)!;
      return { ...e, fromSide: isSide(e.fromSide) ? e.fromSide : facingSide(from, to), toSide: isSide(e.toSide) ? e.toSide : facingSide(to, from) } as CanvasEdge;
    });
  return { ...data, nodes, edges };
}

const plain = (value: unknown) => typeof value !== "object";

/** Obsidian's JSON writer (tabs; objects and arrays of plain values on one line). */
function lines(value: unknown): string[] {
  if (value === undefined) return ["null"];
  if (plain(value) || !value) return [JSON.stringify(value)];
  if (Array.isArray(value)) {
    if (value.every(plain)) return [JSON.stringify(value)];
    const out = ["["];
    value.forEach((item, i) => {
      const inner = lines(item);
      inner.forEach((line, k) => out.push(`\t${line}${k === inner.length - 1 && i < value.length - 1 ? "," : ""}`));
    });
    out.push("]");
    return out;
  }
  const object = value as Record<string, unknown>;
  if (Object.values(object).every(plain)) return [JSON.stringify(object)];
  const keys = Object.keys(object).filter((k) => object[k] !== undefined);
  const out = ["{"];
  keys.forEach((key, i) => {
    const inner = lines(object[key]);
    inner[0] = `${JSON.stringify(key)}:${inner[0]}`;
    inner.forEach((line, k) => out.push(`\t${line}${k === inner.length - 1 && i < keys.length - 1 ? "," : ""}`));
  });
  out.push("}");
  return out;
}

/** Keys of a card in Obsidian's order: unknown ones first, then its geometry, color, type and content. */
function nodeForFile(node: CanvasNode): Record<string, unknown> {
  const { id, x, y, width, height, color, type, text, file, subpath, url, label, background, backgroundStyle, ...unknown } = node;
  const content =
    type === "text"
      ? { text }
      : type === "file"
        ? { file, subpath: subpath || undefined }
        : type === "link"
          ? { url }
          : type === "group"
            ? { label: label || undefined, background: background || undefined, backgroundStyle: background && backgroundStyle !== "cover" ? backgroundStyle : undefined }
            : { text, file, subpath, url, label, background, backgroundStyle };
  return { ...unknown, id, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), color: color || undefined, type, ...content };
}

function edgeForFile(edge: CanvasEdge): Record<string, unknown> {
  const { id, fromNode, fromSide, fromEnd, toNode, toSide, toEnd, color, label, ...unknown } = edge;
  return { ...unknown, id, fromNode, fromSide, toNode, toSide, fromEnd: fromEnd && fromEnd !== "none" ? fromEnd : undefined, toEnd: toEnd && toEnd !== "arrow" ? toEnd : undefined, color: color || undefined, label: label || undefined };
}

export function serializeCanvas(data: CanvasData): string {
  // The file's own keys keep their place (Obsidian spreads them, then sets the cards and arrows).
  return lines({ ...data, nodes: data.nodes.map(nodeForFile), edges: data.edges.map(edgeForFile) }).join("\n");
}

/** A new card or arrow id, like Obsidian's (16 hexadecimal digits). */
export function newCanvasId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cards `ids` and the arrows between them: what is copied (as a canvas file's text). */
export function pickCards(data: CanvasData, ids: Iterable<string>): CanvasData {
  const picked = new Set(ids);
  return { nodes: data.nodes.filter((n) => picked.has(n.id)), edges: data.edges.filter((e) => picked.has(e.fromNode) && picked.has(e.toNode)) };
}

/** Copies of `cards` with new ids, their box centered on `center`; their arrows follow them. */
export function cloneCards(cards: CanvasData, center: { x: number; y: number }): CanvasData {
  const from = cardsCenter(cards.nodes);
  const dx = Math.round(center.x - from.x);
  const dy = Math.round(center.y - from.y);
  const ids = new Map(cards.nodes.map((n) => [n.id, newCanvasId()]));
  return {
    nodes: cards.nodes.map((n) => ({ ...n, id: ids.get(n.id)!, x: n.x + dx, y: n.y + dy })),
    edges: cards.edges.map((e) => ({ ...e, id: newCanvasId(), fromNode: ids.get(e.fromNode)!, toNode: ids.get(e.toNode)! })),
  };
}

/** The center of the cards' box. */
export function cardsCenter(cards: CanvasNode[]): { x: number; y: number } {
  const left = Math.min(...cards.map((n) => n.x));
  const top = Math.min(...cards.map((n) => n.y));
  return { x: (left + Math.max(...cards.map((n) => n.x + n.width))) / 2, y: (top + Math.max(...cards.map((n) => n.y + n.height))) / 2 };
}

/** A new canvas: empty, as Obsidian creates it. */
export function newCanvasFile(): string {
  return serializeCanvas({ nodes: [], edges: [] });
}
