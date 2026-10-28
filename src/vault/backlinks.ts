import { noteLinkTargets } from "../dashboard/stats";
import { isDrawingPath } from "../drawing/format";
import { isMindmapPath } from "../mindmap/format";
import { resolveLink } from "./links";

/**
 * Backlinks: the notes whose text links to
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
/** A line of Markdown as plain text: no list marker, quote, heading sign, link syntax or emphasis. */
export function plainLine(line: string, max = MAX_EXCERPT): string {
  const text = line
    .trim()
    .replace(/^(?:>\s*)+/, "")
    .replace(/^(?:#{1,6}\s+|[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+)/, "")
    .replace(/!?\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_all, target: string, alias?: string) => alias || target.replace(/[#^].*$/, "").split("/").pop()!)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|==)(.+?)\1/g, "$2")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
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
