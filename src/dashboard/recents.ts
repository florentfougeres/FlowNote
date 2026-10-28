import { splitFrontmatter } from "../markdown/frontmatter";
import { plainLine } from "../vault/backlinks";

/** Pages opened recently in a vault (kept in this browser/app only), newest first. */

const key = (vault: string) => `flownote:recent-pages:${vault}`;
const MAX = 20;

export interface RecentPage {
  path: string;
  /** Last time it was opened (ms). */
  at: number;
}

export function recentPages(vault: string): RecentPage[] {
  try {
    const list = JSON.parse(localStorage.getItem(key(vault)) ?? "[]") as unknown;
    return Array.isArray(list) ? list.filter((p): p is RecentPage => typeof p?.path === "string" && typeof p?.at === "number") : [];
  } catch {
    return [];
  }
}

export function recordRecentPage(vault: string, path: string, at = Date.now()) {
  try {
    const next = [{ path, at }, ...recentPages(vault).filter((p) => p.path !== path)].slice(0, MAX);
    localStorage.setItem(key(vault), JSON.stringify(next));
  } catch {
    // not remembered
  }
}

/** Follows a rename or a deletion (path → next, or removed with null). */
export function moveRecentPage(vault: string, path: string, next: string | null) {
  try {
    const list = recentPages(vault)
      .map((p) => (p.path === path || p.path.startsWith(`${path.replace(/\.md$/, "")}/`) ? { ...p, path: next ? p.path.replace(path, next) : "" } : p))
      .filter((p) => p.path);
    localStorage.setItem(key(vault), JSON.stringify(list));
  } catch {
    // not remembered
  }
}

/**
 * The start of a note's text, as plain text, for the home page: no front
 * matter, headings, code, comments, callout headers, embeds or tables; the
 * lines run together up to `max` characters.
 */
export function noteExcerpt(text: string, max = 160): string {
  const body = splitFrontmatter(text)?.body ?? text;
  const parts: string[] = [];
  let length = 0;
  let fence = false;
  // HTML comments (speaker notes, hidden remarks) are not text to read.
  for (const raw of body.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) fence = !fence;
    if (fence || /^\s*(```|~~~)/.test(raw)) continue;
    // Headings, callout headers, embeds, rules, tables and HTML: the excerpt keeps the prose.
    if (/^#{1,6}\s/.test(raw) || /^\s*(?:>\s*)*\[!/.test(raw) || /^\s*!\[\[/.test(raw) || /^\s*(?:---|\*\*\*|\||<)/.test(raw)) continue;
    const line = plainLine(raw, max);
    if (!line) continue;
    parts.push(line);
    length += line.length + 1;
    if (length >= max) break;
  }
  const joined = parts.join(" ");
  return joined.length > max ? `${joined.slice(0, max - 1).trimEnd()}…` : joined;
}
