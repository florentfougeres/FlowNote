import { isDrawingPath } from "../drawing/format";
import { resolveLink } from "../vault/links";

/**
 * Vault statistics for the dashboard, computed from the notes' text: pages by
 * kind, most used tags, broken links (targets that resolve to nothing, like
 * Obsidian's resolution) and orphan notes (no other note links to them).
 */

export interface VaultStats {
  notes: number;
  drawings: number;
  /** Distinct tags in the vault. */
  tagCount: number;
  /** Most used tags (at most 12). */
  tags: [string, number][];
  /** Pages carrying each tag (in the text or the `tags` property), sorted. */
  tagPages: Record<string, string[]>;
  brokenLinks: { from: string; target: string }[];
  orphans: string[];
}

/** Text without fenced code blocks and inline code: tags and links there are not real. */
function withoutCode(text: string): string {
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "").replace(/`[^`\n]*`/g, "");
}

function frontmatter(text: string): { body: string; tags: string[] } {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return { body: text, tags: [] };
  const yaml = match[1];
  const tags: string[] = [];
  const inline = /^tags?:[ \t]*\[([^\]]*)\]/m.exec(yaml);
  if (inline) tags.push(...inline[1].split(",").map((t) => t.trim().replace(/^["']|["']$/g, "")));
  const block = /^tags?:[ \t]*\r?\n((?:[ \t]*-[^\n]*\r?\n?)+)/m.exec(yaml);
  if (block) tags.push(...block[1].split("\n").map((l) => l.replace(/^[ \t]*-[ \t]*/, "").trim().replace(/^["']|["']$/g, "")));
  const single = /^tags?:[ \t]*([^\s[][^\n]*)$/m.exec(yaml);
  if (single && !inline) tags.push(...single[1].split(/[,\s]+/));
  return { body: text.slice(match[0].length), tags: tags.filter(Boolean).map((t) => t.replace(/^#/, "")) };
}

const TAG = /(?:^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
const WIKILINK = /(!?)\[\[([^\]|#^\n]+)(?:[#^][^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g;
const MDLINK = /\[[^\]\n]*\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g;

/** Tags of a note, from its `tags` property and its prose outside code, without `#`, in their written case. */
export function noteTags(text: string): string[] {
  const { body, tags } = frontmatter(text);
  return [...tags, ...[...withoutCode(body).matchAll(TAG)].map((m) => m[1])];
}

/** Link targets written in a note's prose (wikilinks and Markdown links to notes), outside code. */
export function noteLinkTargets(text: string): string[] {
  const prose = withoutCode(frontmatter(text).body);
  return [...[...prose.matchAll(WIKILINK)].map((m) => m[2].trim()), ...[...prose.matchAll(MDLINK)].map((m) => decodeURIComponent(m[1]))];
}

export function computeStats(notes: [string, string][], files: string[]): VaultStats {
  const tagCounts = new Map<string, number>();
  const tagPages = new Map<string, Set<string>>();
  const count = (tag: string, path: string) => {
    const key = tag.toLowerCase();
    tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
    tagPages.set(key, (tagPages.get(key) ?? new Set()).add(path));
  };
  const brokenLinks: VaultStats["brokenLinks"] = [];
  const linked = new Set<string>();
  let drawings = 0;
  for (const [path, text] of notes) {
    if (isDrawingPath(path)) {
      drawings++;
      continue; // drawing data is JSON, not prose
    }
    for (const tag of noteTags(text)) count(tag, path);
    for (const target of noteLinkTargets(text)) {
      const resolved = resolveLink(target, files, path);
      if (resolved) {
        if (resolved !== path) linked.add(resolved);
      } else brokenLinks.push({ from: path, target });
    }
  }
  const pages = notes.map(([path]) => path);
  return {
    notes: notes.length - drawings,
    drawings,
    tagCount: tagCounts.size,
    tags: [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr")).slice(0, 12),
    tagPages: Object.fromEntries([...tagPages].map(([tag, paths]) => [tag, [...paths].sort((a, b) => a.localeCompare(b, "fr"))])),
    brokenLinks,
    orphans: pages.filter((p) => !linked.has(p)).sort((a, b) => a.localeCompare(b, "fr")),
  };
}

/** Files bookmarked in Obsidian (.obsidian/bookmarks.json), groups flattened. */
export function bookmarkedFiles(json: string): string[] {
  try {
    const out: string[] = [];
    const walk = (items: unknown) => {
      if (!Array.isArray(items)) return;
      for (const item of items as { type?: string; path?: string; items?: unknown }[]) {
        if (item.type === "file" && typeof item.path === "string") out.push(item.path);
        if (item.type === "group") walk(item.items);
      }
    };
    walk((JSON.parse(json) as { items?: unknown }).items);
    return out;
  } catch {
    return [];
  }
}
