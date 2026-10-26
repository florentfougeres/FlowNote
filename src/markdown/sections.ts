/**
 * The part of a note shown by an embed, like Obsidian: `![[Note]]` the whole
 * note (without its properties), `![[Note#Titre]]` a section (its heading and
 * what follows, down to the next heading of the same or a higher level;
 * `#Partie#Sous-partie` follows nested headings), `![[Note#^id]]` the block
 * marked ` ^id` (a paragraph, or a list item with its sub-items).
 */

const FRONTMATTER = /^﻿?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t#]*$/;

/** The note's lines, each with whether it is inside a fenced code block. */
function linesOf(body: string): { text: string; code: boolean }[] {
  let fence: string | null = null;
  return body.split(/\r?\n/).map((text) => {
    const marker = /^\s*(```+|~~~+)/.exec(text)?.[1];
    const code = fence !== null || marker !== undefined;
    if (marker && (fence === null || text.trim().startsWith(fence))) fence = fence === null ? marker : null;
    return { text, code };
  });
}

/** Headings compare without case, spacing or the characters Obsidian drops from links. */
const same = (a: string, b: string) => {
  const clean = (s: string) => s.replace(/[#|^:[\]\\]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  return clean(a) === clean(b);
};

function section(lines: { text: string; code: boolean }[], path: string[]): string | null {
  let from = 0;
  let to = lines.length;
  let level = 0;
  let start = -1;
  for (const name of path) {
    start = -1;
    for (let i = from; i < to; i++) {
      const heading = !lines[i].code && HEADING.exec(lines[i].text);
      if (heading && heading[1].length > level && same(heading[2], name)) {
        start = i;
        level = heading[1].length;
        break;
      }
    }
    if (start < 0) return null;
    from = start + 1;
    to = lines.length;
    for (let i = from; i < lines.length; i++) {
      const heading = !lines[i].code && HEADING.exec(lines[i].text);
      if (heading && heading[1].length <= level) {
        to = i;
        break;
      }
    }
  }
  return lines
    .slice(start, to)
    .map((l) => l.text)
    .join("\n")
    .trimEnd();
}

function block(lines: { text: string; code: boolean }[], id: string): string | null {
  const marker = new RegExp(`\\s\\^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
  const at = lines.findIndex((l) => !l.code && marker.test(l.text));
  if (at < 0) return null;
  const strip = (text: string) => text.replace(marker, "");
  const item = /^(\s*)(?:[-*+]|\d+[.)])\s/.exec(lines[at].text);
  if (item) {
    // The item and the lines indented under it.
    const indent = item[1].length;
    let end = at + 1;
    while (end < lines.length && lines[end].text.trim() && /^\s*/.exec(lines[end].text)![0].length > indent) end++;
    return lines
      .slice(at, end)
      .map((l, i) => (i === 0 ? strip(l.text) : l.text).slice(indent))
      .join("\n");
  }
  // A paragraph: up to the blank line above it.
  let start = at;
  while (start > 0 && lines[start - 1].text.trim() && !HEADING.test(lines[start - 1].text)) start--;
  return lines
    .slice(start, at + 1)
    .map((l, i, all) => (i === all.length - 1 ? strip(l.text) : l.text))
    .join("\n");
}

/** What `![[Note#subpath]]` shows of the note's text, or null when the section or block is not there. */
export function embedSection(markdown: string, subpath: string): string | null {
  const body = markdown.replace(FRONTMATTER, "");
  const wanted = subpath.trim();
  if (!wanted) return body;
  const lines = linesOf(body);
  if (wanted.startsWith("^")) return block(lines, wanted.slice(1));
  return section(
    lines,
    wanted.split("#").filter((part) => part.trim()),
  );
}

/** A block identifier at the end of a line: ` ^id`. */
export const BLOCK_ID = /\s\^([A-Za-z0-9-]+)\s*$/;

export interface NoteHeading {
  level: number;
  text: string;
}

/** A block a link can point to (`[[Note#^id]]`): a list item or a paragraph. */
export interface NoteBlock {
  /** 0-based line of the note where its identifier is (or goes): the item's line, the paragraph's last line. */
  line: number;
  /** Its text, without list marker or identifier. */
  text: string;
  id: string | null;
}

/** The note's lines after its properties, and how many lines the properties take. */
function bodyLines(markdown: string): { lines: { text: string; code: boolean }[]; offset: number } {
  const front = FRONTMATTER.exec(markdown)?.[0] ?? "";
  return { lines: linesOf(markdown.slice(front.length)), offset: front ? front.split("\n").length - 1 : 0 };
}

/** The headings of a note, in order (none from code blocks). */
export function noteHeadings(markdown: string): NoteHeading[] {
  const headings: NoteHeading[] = [];
  for (const line of bodyLines(markdown).lines) {
    const heading = !line.code && HEADING.exec(line.text);
    if (heading) headings.push({ level: heading[1].length, text: heading[2] });
  }
  return headings;
}

const ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?(.*)$/;
/** Lines that are neither paragraphs nor list items: tables, quotes, rules, math, HTML, footnotes, embeds. */
const NOT_TEXT = /^\s*(?:\||>|-{3,}\s*$|\*{3,}\s*$|\$\$|<|\[\^|!\[\[|:::)/;

/** A line of Markdown as read: without emphasis, code ticks, footnote calls or link syntax. */
function plainText(line: string): string {
  return line
    .replace(/!?\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/!?\[\[([^\]]*)\]\]/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\^[^\]]*\]/g, "")
    .replace(/(\*\*|__|==|~~|`)/g, "")
    .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|$|[.,;:!?])/g, "$1$2")
    .trim();
}

/** The list items and paragraphs of a note, the blocks `[[Note#^id]]` can point to. */
export function noteBlocks(markdown: string): NoteBlock[] {
  const { lines, offset } = bodyLines(markdown);
  const blocks: NoteBlock[] = [];
  let paragraph: string[] = [];
  let math = false;
  const text = (raw: string) => plainText(raw.replace(BLOCK_ID, ""));
  lines.forEach((line, i) => {
    // A `$$` block: its lines are not paragraphs.
    const fence = !line.code && /^\s*\$\$/.test(line.text) && !/^\s*\$\$.*\S.*\$\$\s*$/.test(line.text);
    if (fence) math = !math;
    const plain = !fence && !math && !line.code && line.text.trim() !== "" && !HEADING.test(line.text) && !NOT_TEXT.test(line.text);
    const item = plain ? ITEM.exec(line.text) : null;
    if (item) {
      paragraph = [];
      if (text(item[1])) blocks.push({ line: offset + i, text: text(item[1]), id: BLOCK_ID.exec(line.text)?.[1] ?? null });
      return;
    }
    if (!plain) {
      paragraph = [];
      return;
    }
    paragraph.push(text(line.text));
    const next = lines[i + 1];
    const ends = !next || next.code || next.text.trim() === "" || HEADING.test(next.text) || ITEM.test(next.text) || NOT_TEXT.test(next.text);
    if (ends) {
      blocks.push({ line: offset + i, text: paragraph.join(" "), id: BLOCK_ID.exec(line.text)?.[1] ?? null });
      paragraph = [];
    }
  });
  return blocks;
}

/** A new block identifier, six letters and digits like Obsidian's, not in `taken`. */
export function newBlockId(taken: Iterable<string>): string {
  const used = new Set(taken);
  for (;;) {
    const id = Math.random().toString(36).slice(2, 8);
    if (id.length === 6 && !used.has(id)) return id;
  }
}

/** A heading as a link names it: Obsidian replaces the characters links cannot hold with spaces. */
export function headingLinkText(heading: string): string {
  return heading.replace(/[#|^:[\]\\]/g, " ").replace(/\s+/g, " ").trim();
}

/** Whether a link's `#heading` names this heading. */
export function sameHeading(link: string, heading: string): boolean {
  return same(link, heading);
}

/**
 * The heading renamed between two versions of a note: same headings, exactly
 * one with another (non-empty) text. Null for any other change.
 */
export function headingRename(before: string, after: string): { from: string; to: string } | null {
  const old = noteHeadings(before);
  const now = noteHeadings(after);
  if (old.length !== now.length) return null;
  const changed = old.flatMap((h, i) => (same(h.text, now[i].text) ? [] : [i]));
  if (changed.length !== 1) return null;
  const from = old[changed[0]].text;
  const to = now[changed[0]].text;
  return headingLinkText(from) && headingLinkText(to) ? { from, to } : null;
}
