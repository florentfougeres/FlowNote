import { noteTags } from "../dashboard/stats";

/**
 * Flashcards in the format of Obsidian's Spaced Repetition plugin, read from
 * the notes tagged `#flashcards` (`#flashcards/anglais` makes a deck):
 * - `Question::Réponse` on one line, `Question:::Réponse` for a card reviewed
 *   both ways;
 * - over several lines, the question, a line `?` (`??` both ways), then the
 *   answer, down to a blank line.
 * The review is written after the card as the plugin writes it, a comment
 * `<!--SR:!2026-10-30,3,250-->` (due date, interval in days, ease): at the end
 * of the line for a one-line card, on the line after the card otherwise. A
 * card reviewed both ways has one entry per way. Only that comment changes.
 */

export interface Schedule {
  /** YYYY-MM-DD. */
  due: string;
  /** Days. */
  interval: number;
  /** Ease, 250 for a new card (2.5 times the interval at each "Correct"). */
  ease: number;
}

export interface Card {
  path: string;
  /** Its tag, without `#`: `flashcards`, `flashcards/anglais`. */
  deck: string;
  front: string;
  back: string;
  /** 0: as written; 1: the other way, for a card reviewed both ways. */
  side: 0 | 1;
  /** First and last lines of the card in the note (0-based), without its review comment. */
  from: number;
  to: number;
  /** One-line card: its review comment ends the line. */
  inline: boolean;
  /** The review of each way written in the note (null: new). */
  schedules: (Schedule | null)[];
}

export type Response = "hard" | "good" | "easy";

const SR = /\s*<!--SR:((?:!\d{4}-\d{2}-\d{2},[\d.]+,\d+)+)-->\s*$/;
const SR_LINE = /^\s*<!--SR:((?:!\d{4}-\d{2}-\d{2},[\d.]+,\d+)+)-->\s*$/;
/** The plugin's placeholder for a way not reviewed yet, when the other way was. */
const NEW_PLACEHOLDER = "2000-01-01";
const BASE_EASE = 250;
const EASY_BONUS = 1.3;
const LAPSE_INTERVAL = 0.5;
const MAX_INTERVAL = 36525;

function readSchedules(text: string): (Schedule | null)[] {
  return text
    .split("!")
    .filter(Boolean)
    .map((entry) => {
      const [due, interval, ease] = entry.split(",");
      return due === NEW_PLACEHOLDER ? null : { due, interval: Number(interval), ease: Number(ease) };
    });
}

/** The deck of a note: its first `#flashcards…` tag, or null when it has none. */
export function noteDeck(text: string): string | null {
  return (
    noteTags(text)
      .map((t) => t.toLowerCase())
      .find((t) => t === "flashcards" || t.startsWith("flashcards/")) ?? null
  );
}

/** A card's text as shown: without a list marker. */
const shown = (lines: string[]) =>
  lines
    .map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?/, ""))
    .join("\n")
    .trim();

/** The cards of a note, both ways of a reversed card one after the other; none outside a `#flashcards` note. */
export function noteCards(path: string, text: string): Card[] {
  const deck = noteDeck(text);
  if (!deck) return [];
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  // Lines that hold no card: properties and code blocks.
  const skipped = new Set<number>();
  const front = /^﻿?---\s*$/.test(lines[0] ?? "") ? lines.findIndex((l, i) => i > 0 && /^---\s*$/.test(l)) : -1;
  for (let i = 0; i <= front; i++) skipped.add(i);
  let fence: string | null = null;
  lines.forEach((line, i) => {
    const marker = /^\s*(```+|~~~+)/.exec(line)?.[1];
    if (fence !== null || marker) skipped.add(i);
    if (marker && (fence === null || line.trim().startsWith(fence))) fence = fence === null ? marker : null;
  });
  const blank = (i: number) => i < 0 || i >= lines.length || lines[i].trim() === "" || skipped.has(i);

  const cards: Card[] = [];
  const add = (card: Pick<Card, "from" | "to" | "inline" | "schedules">, question: string, answer: string, both: boolean) => {
    if (!question || !answer) return;
    cards.push({ ...card, path, deck, side: 0, front: question, back: answer });
    if (both) cards.push({ ...card, path, deck, side: 1, front: answer, back: question });
  };

  // Cards over several lines, around a `?` line.
  for (let i = 0; i < lines.length; i++) {
    const separator = lines[i].trim();
    if (skipped.has(i) || (separator !== "?" && separator !== "??")) continue;
    let from = i;
    while (!blank(from - 1)) from--;
    let to = i;
    while (!blank(to + 1) && !SR_LINE.test(lines[to + 1])) to++;
    const comment = SR_LINE.exec(lines[to + 1] ?? "");
    for (let l = from; l <= to + (comment ? 1 : 0); l++) skipped.add(l);
    add({ from, to, inline: false, schedules: comment ? readSchedules(comment[1]) : [] }, shown(lines.slice(from, i)), shown(lines.slice(i + 1, to + 1)), separator === "??");
  }

  // One-line cards.
  lines.forEach((line, i) => {
    if (skipped.has(i)) return;
    const comment = SR.exec(line);
    const body = comment ? line.slice(0, comment.index) : line;
    const both = body.indexOf(":::");
    const at = both >= 0 ? both : body.indexOf("::");
    if (at < 0) return;
    add({ from: i, to: i, inline: true, schedules: comment ? readSchedules(comment[1]) : [] }, shown([body.slice(0, at)]), body.slice(at + (both >= 0 ? 3 : 2)).trim(), both >= 0);
  });

  return cards.sort((a, b) => a.from - b.from || a.side - b.side);
}

const DAY = 24 * 3600 * 1000;

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayStart(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** The card's review for its way, null when new. */
export const scheduleOf = (card: Card): Schedule | null => card.schedules[card.side] ?? null;

/** Due today or before, or new. */
export function isDue(card: Card, today: Date): boolean {
  const schedule = scheduleOf(card);
  return schedule === null || schedule.due <= isoDay(today);
}

/**
 * The next review after a response, by the plugin's algorithm (SM-2 adapted):
 * "Correct" multiplies the interval by the ease, "Facile" raises the ease and
 * adds a bonus, "Difficile" lowers the ease and halves the interval. Days
 * past the due date count for part of the interval.
 */
export function nextSchedule(response: Response, current: Schedule | null, today: Date): Schedule {
  let interval = current?.interval ?? 1;
  let ease = current?.ease ?? BASE_EASE;
  const late = current ? Math.max(0, Math.round((dayStart(isoDay(today)) - dayStart(current.due)) / DAY)) : 0;
  if (response === "easy") {
    ease += 20;
    interval = (((interval + late) * ease) / 100) * EASY_BONUS;
  } else if (response === "good") {
    interval = ((interval + late / 2) * ease) / 100;
  } else {
    ease = Math.max(130, ease - 20);
    interval = Math.max(1, (interval + late / 4) * LAPSE_INTERVAL);
  }
  const days = Math.max(1, Math.round(Math.min(interval, MAX_INTERVAL)));
  const due = new Date(dayStart(isoDay(today)));
  due.setDate(due.getDate() + days);
  return { due: isoDay(due), interval: days, ease };
}

/**
 * The note's text with the card's review written (or replaced): only its
 * comment changes. Null when the card is no longer where it was (the note
 * changed since it was read).
 */
export function withSchedule(text: string, card: Card, schedule: Schedule): string | null {
  const now = noteCards(card.path, text).find((c) => c.from === card.from && c.side === card.side && c.front === card.front);
  if (!now) return null;
  const schedules = [...now.schedules];
  while (schedules.length < card.side) schedules.push(null);
  schedules[card.side] = schedule;
  const comment = `<!--SR:${schedules.map((s) => `!${s ? `${s.due},${s.interval},${s.ease}` : `${NEW_PLACEHOLDER},1,${BASE_EASE}`}`).join("")}-->`;
  const lines = text.split("\n");
  const eol = (i: number) => (lines[i].endsWith("\r") ? "\r" : "");
  if (now.inline) {
    lines[now.from] = `${lines[now.from].replace(/\r$/, "").replace(SR, "")} ${comment}${eol(now.from)}`;
  } else if (SR_LINE.test((lines[now.to + 1] ?? "").replace(/\r$/, ""))) {
    lines[now.to + 1] = comment + eol(now.to + 1);
  } else {
    lines.splice(now.to + 1, 0, comment + eol(now.to));
  }
  return lines.join("\n");
}

/** What a review comment (`<!--SR:!2026-10-30,3,250-->`) shows in a note: its next dates, "30/10 · 02/11". Null for other text. */
export function reviewMark(source: string): string | null {
  const match = SR_LINE.exec(source);
  if (!match) return null;
  return readSchedules(match[1])
    .map((s) => (s ? `${s.due.slice(8, 10)}/${s.due.slice(5, 7)}` : "nouvelle"))
    .join(" · ");
}
