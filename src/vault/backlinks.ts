import { noteLinkTargets } from "../dashboard/stats";
import { isDrawingPath } from "../drawing/format";
import { isMindmapPath } from "../mindmap/format";
import { noteTitle, resolveLink } from "./links";

/**
 * Backlinks, like Obsidian's "Linked mentions": the notes whose text links to
 * a page, each with the line of the first link as an excerpt. Nothing is
 * stored: they are computed from the notes' text.
 */

export interface Backlink {
  path: string;
  /** The line holding the first link, as plain text. */
  excerpt: string;
}

const MAX_EXCERPT = 180;

/** A Markdown line as it reads: no block markers, links shown by their text. */
function plainLine(line: string): string {
  const text = line
    .trim()
    .replace(/^(?:>\s*)+/, "")
    .replace(/^(?:#{1,6}\s+|[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+)/, "")
    .replace(/!?\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_all, target: string, alias?: string) => alias || target.replace(/[#^].*$/, "").split("/").pop()!)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|==)(.+?)\1/g, "$2")
    .trim();
  return text.length > MAX_EXCERPT ? `${text.slice(0, MAX_EXCERPT - 1).trimEnd()}…` : text;
}

/** Notes linking to `target` (a vault path), in title order. */
export function backlinksTo(target: string, notes: [string, string][], files: string[]): Backlink[] {
  const found: Backlink[] = [];
  for (const [path, text] of notes) {
    if (path === target || isDrawingPath(path) || isMindmapPath(path)) continue; // drawing and mind map data is JSON
    const links = (targets: string[]) => targets.some((link) => resolveLink(link, files, path) === target);
    if (!links(noteLinkTargets(text))) continue;
    const line = text.split("\n").find((l) => links(noteLinkTargets(l))) ?? "";
    found.push({ path, excerpt: plainLine(line) });
  }
  return found.sort((a, b) => a.path.localeCompare(b.path, "fr", { sensitivity: "base" }));
}

/** A note naming a page in its text without linking to it. */
export interface Mention {
  path: string;
  excerpt: string;
  /** Offset of the name in the note's text, and the text found there. */
  index: number;
  found: string;
}

/** The text with what is not prose (front matter, code, links, URLs, comments) blanked out, offsets kept. */
function proseOnly(text: string): string {
  const blank = (match: string) => match.replace(/[^\n]/g, " ");
  return text
    .replace(/^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(?=\r?\n|$)/, blank)
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, blank)
    .replace(/`[^`\n]*`/g, blank)
    .replace(/%%[\s\S]*?%%|<!--[\s\S]*?-->/g, blank)
    .replace(/!?\[\[[^\]\n]*\]\]/g, blank)
    .replace(/!?\[[^\]\n]*\]\([^)\n]*\)/g, blank)
    .replace(/<[^>\n]+>|https?:\/\/\S+/g, blank);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Notes whose prose names `target` (its title, as a whole word, any case) and
 * that do not link to it yet, like Obsidian's "Unlinked mentions". Titles
 * shorter than three letters are too common to be mentions.
 */
export function unlinkedMentions(target: string, notes: [string, string][], files: string[]): Mention[] {
  const name = noteTitle(target);
  if (name.length < 3) return [];
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, "iu");
  const found: Mention[] = [];
  for (const [path, text] of notes) {
    if (path === target || isDrawingPath(path) || isMindmapPath(path)) continue;
    const match = pattern.exec(proseOnly(text));
    if (!match) continue;
    if (noteLinkTargets(text).some((link) => resolveLink(link, files, path) === target)) continue;
    const lineStart = text.lastIndexOf("\n", match.index) + 1;
    const lineEnd = text.indexOf("\n", match.index);
    found.push({ path, excerpt: plainLine(text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd)), index: match.index, found: text.slice(match.index, match.index + match[0].length) });
  }
  return found.sort((a, b) => a.path.localeCompare(b.path, "fr", { sensitivity: "base" }));
}

/**
 * The note's text with the mention turned into a link (`[[Page]]`, or
 * `[[Page|text]]` when the text differs), or null when the text changed since.
 */
export function linkMention(text: string, mention: Mention, linkText: string): string | null {
  if (text.slice(mention.index, mention.index + mention.found.length) !== mention.found) return null;
  const link = mention.found === linkText ? `[[${linkText}]]` : `[[${linkText}|${mention.found}]]`;
  return text.slice(0, mention.index) + link + text.slice(mention.index + mention.found.length);
}
