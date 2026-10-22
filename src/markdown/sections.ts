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
