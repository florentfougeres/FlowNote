/**
 * Boards of Obsidian's Kanban plugin: a note with `kanban-plugin: board` in its
 * properties, a `## Liste` per column and a `- [ ] carte` per card:
 *
 *     ---
 *
 *     kanban-plugin: board
 *
 *     ---
 *
 *     ## À faire
 *
 *     - [ ] Une carte @{2026-10-30}
 *
 *
 *     ## Fait
 *
 *     **Complete**
 *     - [x] Une carte finie
 *
 *
 *     %% kanban:settings
 *     ```
 *     {"kanban-plugin":"board"}
 *     ```
 *     %%
 *
 * What precedes the first list and what follows the last one (archive,
 * settings) are kept as written; a list is written again only when it
 * changes, the way the plugin writes it, so an untouched board stays
 * identical to the byte.
 */

export interface KanbanCard {
  /** Its lines in the file, `- [ ] ` included (a card may span several lines). */
  raw: string;
}

export interface KanbanLane {
  title: string;
  /** `**Complete**`: cards moved here are checked. */
  complete: boolean;
  cards: KanbanCard[];
  /** The list as written; null once changed. */
  raw: string | null;
}

export interface KanbanBoard {
  /** Everything before the first list (properties…), as written. */
  head: string;
  lanes: KanbanLane[];
  /** Everything after the last list (archive, `%% kanban:settings %%`), as written. */
  tail: string;
}

const PROPERTIES = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** A note that is a board of the Kanban plugin. */
export function isKanbanMarkdown(text: string): boolean {
  const yaml = PROPERTIES.exec(text)?.[1];
  return yaml !== undefined && /^kanban-plugin:[ \t]*\S/m.test(yaml);
}

const LANE = /^## /;
/** Where the lists end: the archive (`***`) or the plugin's settings. */
const END = /^(?:\*\*\*[ \t]*\r?$|%% kanban:settings)/;
const CARD = /^[-*+] /;

export function parseKanban(text: string): KanbanBoard {
  const properties = PROPERTIES.exec(text)?.[0] ?? "";
  const lines = text.slice(properties.length).split(/(?<=\n)/);
  let at = 0;
  let head = properties;
  while (at < lines.length && !LANE.test(lines[at])) head += lines[at++];
  const lanes: KanbanLane[] = [];
  while (at < lines.length && LANE.test(lines[at])) {
    const title = lines[at].replace(/^## /, "").trim();
    let raw = lines[at++];
    const body: string[] = [];
    while (at < lines.length && !LANE.test(lines[at]) && !END.test(lines[at])) body.push(lines[at++]);
    raw += body.join("");
    const cards: KanbanCard[] = [];
    let complete = false;
    for (const line of body) {
      const plain = line.replace(/\r?\n$/, "");
      if (plain.trim() === "**Complete**") complete = true;
      else if (CARD.test(plain)) cards.push({ raw: plain });
      else if (plain.trim() !== "" && cards.length > 0) cards[cards.length - 1].raw += `\n${plain}`;
    }
    lanes.push({ title, complete, cards, raw });
  }
  return { head, lanes, tail: lines.slice(at).join("") };
}

/** A list as the plugin writes it. */
function laneText(lane: KanbanLane): string {
  const cards = lane.cards.map((c) => c.raw).join("\n");
  return `## ${lane.title}\n\n${lane.complete ? "**Complete**\n" : ""}${cards}${cards ? "\n" : ""}\n\n`;
}

export function serializeKanban(board: KanbanBoard): string {
  return board.head + board.lanes.map((lane) => lane.raw ?? laneText(lane)).join("") + board.tail;
}

/** The text of a card as shown and edited: without its `- [ ] ` marker. */
export function cardText(card: KanbanCard): string {
  return card.raw.replace(/^[-*+] (?:\[.\] )?/, "");
}

export function cardDone(card: KanbanCard): boolean {
  return /^[-*+] \[[xX]\] /.test(card.raw);
}

/** A card with this text (several lines allowed), checked or not. */
export function makeCard(text: string, done = false): KanbanCard {
  return { raw: `- [${done ? "x" : " "}] ${text.trim()}` };
}

/** The board with list `index` changed (written again). */
const withLane = (board: KanbanBoard, index: number, lane: Partial<KanbanLane>): KanbanBoard => ({
  ...board,
  lanes: board.lanes.map((l, i) => (i === index ? { ...l, ...lane, raw: null } : l)),
});

/** Moves a card to `index` of list `to` (counted without the card); a list marked complete checks it. */
export function moveCard(board: KanbanBoard, from: { lane: number; card: number }, to: { lane: number; index: number }): KanbanBoard {
  const card = board.lanes[from.lane].cards[from.card];
  const moved = board.lanes[to.lane].complete && to.lane !== from.lane ? makeCard(cardText(card), true) : card;
  const next = withLane(board, from.lane, { cards: board.lanes[from.lane].cards.filter((_, i) => i !== from.card) });
  const target = [...next.lanes[to.lane].cards];
  target.splice(to.index, 0, moved);
  return withLane(next, to.lane, { cards: target });
}

/** Replaces a card (null removes it). */
export function setCard(board: KanbanBoard, lane: number, card: number, next: KanbanCard | null): KanbanBoard {
  return withLane(board, lane, { cards: board.lanes[lane].cards.flatMap((c, i) => (i !== card ? [c] : next ? [next] : [])) });
}

export function addCard(board: KanbanBoard, lane: number, text: string): KanbanBoard {
  return withLane(board, lane, { cards: [...board.lanes[lane].cards, makeCard(text)] });
}

export function renameLane(board: KanbanBoard, lane: number, title: string): KanbanBoard {
  return withLane(board, lane, { title });
}

/** A new list after the others (before the archive and the settings). */
export function addLane(board: KanbanBoard, title: string): KanbanBoard {
  return { ...board, lanes: [...board.lanes, { title, complete: false, cards: [], raw: null }] };
}

export function removeLane(board: KanbanBoard, lane: number): KanbanBoard {
  return { ...board, lanes: board.lanes.filter((_, i) => i !== lane) };
}

/** A new board, as the plugin creates it. */
export const NEW_KANBAN = `---

kanban-plugin: board

---

## À faire



## En cours



## Fait

**Complete**


%% kanban:settings
\`\`\`
{"kanban-plugin":"board"}
\`\`\`
%%`;
