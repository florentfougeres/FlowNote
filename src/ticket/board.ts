import { setProperty } from "../markdown/frontmatter";
import type { TicketInfo } from "./agenda";
import { isoMinute } from "./format";

/**
 * Kanban board of the tickets. A column is a value of the `status` property;
 * the first one is always "open" and the last one "closed" (so a ticket in the
 * last column is closed, as with the Close button). Cards are ordered by hand:
 * the position is the `order` property of the ticket, moving a card usually
 * rewrites that ticket only.
 */

export interface TicketColumn {
  /** Value written in `status:`. */
  status: string;
  label: string;
}

export const DEFAULT_COLUMNS: TicketColumn[] = [
  { status: "open", label: "À faire" },
  { status: "in-progress", label: "En cours" },
  { status: "closed", label: "Terminé" },
];

/** Columns as configured, made valid: "open" first, "closed" last, unique statuses. */
export function normalizeColumns(columns: TicketColumn[]): TicketColumn[] {
  const label = (status: string, fallback: string) => columns.find((c) => c.status === status)?.label.trim() || fallback;
  const seen = new Set(["open", "closed"]);
  const middle = columns.filter((c) => c.status && !seen.has(c.status) && (seen.add(c.status), true)).map((c) => ({ status: c.status, label: c.label.trim() || c.status }));
  return [{ status: "open", label: label("open", "À faire") }, ...middle, { status: "closed", label: label("closed", "Terminé") }];
}

/** Status value for a new column named `label`: "En revue" → "en-revue", unique among `columns`. */
export function statusFor(label: string, columns: TicketColumn[]): string {
  const base =
    label
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "colonne";
  let status = base;
  for (let i = 2; columns.some((c) => c.status === status); i++) status = `${base}-${i}`;
  return status;
}

/** Cards in their manual order; never moved ones after, soonest due date then highest number first. */
function byBoardOrder(a: TicketInfo, b: TicketInfo): number {
  if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order;
  if ((a.order === null) !== (b.order === null)) return a.order === null ? 1 : -1;
  if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
  if (!a.due !== !b.due) return a.due ? -1 : 1;
  return (b.id ?? 0) - (a.id ?? 0);
}

/** The tickets of each column, in order. Statuses not in any column go to the first one. */
export function boardColumns(tickets: TicketInfo[], columns: TicketColumn[]): TicketInfo[][] {
  const index = new Map(columns.map((c, i) => [c.status, i]));
  const cards = columns.map((): TicketInfo[] => []);
  for (const t of tickets) cards[t.status === "closed" ? columns.length - 1 : (index.get(t.column) ?? 0)].push(t);
  return cards.map((list) => list.sort(byBoardOrder));
}

export interface TicketChange {
  path: string;
  status?: string;
  order: number;
}

/** Orders with at most this many decimals; beyond, the column is renumbered. */
const PRECISION = 1e-6;

/**
 * Changes for dropping `moved` at `index` in a column whose other cards are
 * `cards` (in order, without the moved one). Only the moved ticket changes
 * when its neighbours have an order and there is room between them; otherwise
 * the whole column is renumbered 1, 2, 3…
 */
export function planMove(moved: TicketInfo, status: string, cards: TicketInfo[], index: number): TicketChange[] {
  const before = cards[index - 1];
  const after = cards[index];
  const statusChange = moved.column !== status || (status === "closed") !== (moved.status === "closed") ? { status } : {};
  if ((!before || before.order !== null) && (!after || after.order !== null)) {
    const order = before && after ? (before.order! + after.order!) / 2 : before ? Math.floor(before.order!) + 1 : after ? Math.min(after.order! - 1, Math.ceil(after.order!) - 1) : 1;
    const roomy = (!before || order - before.order! > PRECISION) && (!after || after.order! - order > PRECISION);
    if (roomy && Math.abs(order - Math.round(order * 1e4) / 1e4) < 1e-9) return [{ path: moved.path, ...statusChange, order }];
  }
  const list = [...cards.slice(0, index), moved, ...cards.slice(index)];
  return list.flatMap((t, i) => (t === moved ? [{ path: t.path, ...statusChange, order: i + 1 }] : t.order === i + 1 ? [] : [{ path: t.path, order: i + 1 }]));
}

const FRONTMATTER = /^(﻿?---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/;

/**
 * The ticket text with its kanban properties changed: `status` (and `closed`,
 * set when entering the last column, removed when leaving it) and `order`.
 * The rest of the file is kept byte for byte.
 */
export function applyChange(markdown: string, change: TicketChange, now = new Date()): string {
  const match = FRONTMATTER.exec(markdown);
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  // The front matter block as the properties code handles it: "---\n…\n---".
  let raw: string | null = match ? `---\n${match[2].replace(/\r\n/g, "\n")}\n---` : null;
  if (change.status !== undefined) {
    const wasClosed = /^status[ \t]*:[ \t]*["']?closed["']?[ \t]*$/m.test(raw ?? "");
    raw = setProperty(raw, "status", change.status);
    if (change.status === "closed" && !wasClosed) raw = setProperty(raw, "closed", isoMinute(now));
    if (change.status !== "closed") raw = setProperty(raw, "closed", undefined);
  }
  raw = setProperty(raw, "order", change.order);
  const yaml = (raw ?? "---\n---").replace(/^---\n/, "").replace(/\n?---$/, "").replace(/\n/g, eol);
  if (match) return `${match[1]}${yaml}${match[3]}${markdown.slice(match[0].length)}`;
  return `---${eol}${yaml}${eol}---${eol}${markdown}`;
}
