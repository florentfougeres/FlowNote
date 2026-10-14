/**
 * Tickets: Markdown notes shown like GitHub / GitLab issues, readable as is
 * in Obsidian (front matter, Markdown, callouts):
 *
 *   ---
 *   type: ticket
 *   id: 12
 *   status: open            ← open / closed
 *   tags: [bug]
 *   due: 2026-10-20
 *   created: 2026-10-14T13:40
 *   ---
 *   Description…
 *   - [ ] Tâche 📅 2026-10-16
 *
 *   ## Commentaires
 *
 *   > [!comment] 14/10/2026 13:42
 *   > Texte du commentaire.
 *   >
 *   > > [!comment] 14/10/2026 15:05
 *   > > Une réponse.
 *
 * The file is split in two: the head (front matter + description), edited by
 * the note editor, and the comments section, parsed into a thread. Each part
 * is written back verbatim while unchanged.
 */

export const COMMENTS_HEADING = "## Commentaires";

export interface TicketComment {
  /** As written after `[!comment]` (e.g. "14/10/2026 13:42"). */
  date: string;
  /** Markdown text of the comment. */
  text: string;
  replies: TicketComment[];
}

export interface TicketFile {
  /** Front matter and description, edited by the note editor. */
  head: string;
  /** From the "## Commentaires" line to the end (verbatim), "" when there is none. */
  commentsSection: string;
  comments: TicketComment[];
}

const FRONTMATTER = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** True when the front matter says `type: ticket`. */
export function isTicketMarkdown(markdown: string): boolean {
  const match = FRONTMATTER.exec(markdown);
  return match !== null && /^type[ \t]*:[ \t]*["']?ticket["']?[ \t]*$/m.test(match[1]);
}

export function splitTicket(markdown: string): TicketFile {
  const at = new RegExp(`^${COMMENTS_HEADING}[ \\t]*$`, "m").exec(markdown);
  if (!at) return { head: markdown, commentsSection: "", comments: [] };
  const section = markdown.slice(at.index);
  return { head: markdown.slice(0, at.index), commentsSection: section, comments: parseComments(section) };
}

/** Comments of the section: `> [!comment] date` callouts, replies nested one level deeper. */
export function parseComments(section: string): TicketComment[] {
  const lines = section.replace(/\r\n/g, "\n").split("\n").slice(1);
  return parseLevel(lines, 1);
}

function depthOf(line: string): number {
  const match = /^((?:>[ \t]?)+)/.exec(line);
  return match ? (match[1].match(/>/g) ?? []).length : 0;
}

/** Removes `depth` levels of quote markers. */
function unquote(line: string, depth: number): string {
  let rest = line;
  for (let i = 0; i < depth; i++) rest = rest.replace(/^>[ \t]?/, "");
  return rest;
}

function parseLevel(lines: string[], depth: number): TicketComment[] {
  const comments: TicketComment[] = [];
  let current: { date: string; body: string[]; nested: string[][] } | null = null;
  const flush = () => {
    if (!current) return;
    const text = current.body.join("\n").replace(/^\n+|\n+$/g, "");
    comments.push({ date: current.date, text, replies: current.nested.flatMap((block) => parseLevel(block, depth + 1)) });
    current = null;
  };
  let replyBlock: string[] | null = null;
  for (const line of lines) {
    const d = depthOf(line);
    const inner = unquote(line, depth);
    const header = d === depth ? /^\[!comment\][ \t]*(.*)$/i.exec(inner.trim()) : null;
    if (header) {
      flush();
      replyBlock = null;
      current = { date: header[1].trim(), body: [], nested: [] };
      continue;
    }
    if (!current) continue;
    if (d > depth) {
      // A reply starts with its own [!comment] header one level deeper.
      if (/^\[!comment\]/i.test(unquote(line, depth + 1).trim()) || !replyBlock) {
        replyBlock = [];
        current.nested.push(replyBlock);
      }
      replyBlock.push(line);
      continue;
    }
    replyBlock = null;
    if (d === depth) current.body.push(inner);
    else if (line.trim() === "") current.body.push("");
    else flush(); // text outside the callouts ends the thread
  }
  flush();
  return comments;
}

function quote(text: string, depth: number): string[] {
  const prefix = "> ".repeat(depth);
  return text.split("\n").map((line) => (line ? `${prefix}${line}` : prefix.trimEnd()));
}

function serializeComment(comment: TicketComment, depth: number): string[] {
  const lines = [`${"> ".repeat(depth)}[!comment] ${comment.date}`, ...quote(comment.text, depth)];
  for (const reply of comment.replies) lines.push("> ".repeat(depth).trimEnd(), ...serializeComment(reply, depth + 1));
  return lines;
}

/** The comments section for a thread (regenerated only when the thread changes). */
export function serializeComments(comments: TicketComment[]): string {
  if (comments.length === 0) return "";
  return `${COMMENTS_HEADING}\n\n${comments.map((c) => serializeComment(c, 1).join("\n")).join("\n\n")}\n`;
}

/** Joins the head and a comments section, with a blank line between them. */
export function joinTicket(head: string, commentsSection: string): string {
  if (!commentsSection) return head;
  const separator = head === "" || head.endsWith("\n\n") ? "" : head.endsWith("\n") ? "\n" : "\n\n";
  return `${head}${separator}${commentsSection}`;
}

/** "14/10/2026 13:42". */
export function commentDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Local ISO date-time without seconds: 2026-10-14T13:40. */
export function isoMinute(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Next ticket number: one more than the highest "<n> - " file name in the folder. */
export function nextTicketId(files: string[], folder: string): number {
  const prefix = folder ? `${folder}/` : "";
  let max = 0;
  for (const file of files) {
    if (!file.startsWith(prefix)) continue;
    const match = /^(\d+) - /.exec(file.slice(prefix.length));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

/** A new ticket file. */
export function newTicketFile(id: number, created = new Date()): string {
  return ["---", "type: ticket", `id: ${id}`, "status: open", "tags: []", `created: ${isoMinute(created)}`, "---", "", ""].join("\n");
}

/** File name of a ticket: "12 - Bug d'affichage" → title "Bug d'affichage", id 12. */
export function ticketTitle(path: string): { id: number | null; title: string } {
  const name = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
  const match = /^(\d+) - (.*)$/.exec(name);
  return match ? { id: Number(match[1]), title: match[2] } : { id: null, title: name };
}
