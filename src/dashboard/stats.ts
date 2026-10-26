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

const FRONTMATTER = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * A list property of the frontmatter (`key` a pattern for its names), written
 * `[a, b]`, as `- a` lines, or `a, b` on one line (split on `separator`).
 */
function listProperty(yaml: string, key: string, separator: RegExp): string[] {
  const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, "");
  const inline = new RegExp(`^${key}:[ \\t]*\\[([^\\]]*)\\]`, "m").exec(yaml);
  if (inline) return inline[1].split(",").map(unquote).filter(Boolean);
  const block = new RegExp(`^${key}:[ \\t]*\\r?\\n((?:[ \\t]*-[^\\n]*\\r?\\n?)+)`, "m").exec(yaml);
  if (block) return block[1].split("\n").map((l) => unquote(l.replace(/^[ \t]*-[ \t]*/, ""))).filter(Boolean);
  const single = new RegExp(`^${key}:[ \\t]*([^\\s[][^\\n]*)$`, "m").exec(yaml);
  return single ? single[1].split(separator).map(unquote).filter(Boolean) : [];
}

function frontmatter(text: string): { body: string; tags: string[] } {
  const match = FRONTMATTER.exec(text);
  if (!match) return { body: text, tags: [] };
  return { body: text.slice(match[0].length), tags: listProperty(match[1], "tags?", /[,\s]+/).map((t) => t.replace(/^#/, "")) };
}

/** The other names of a note (`aliases` property), which links can use. */
export function noteAliases(text: string): string[] {
  const match = FRONTMATTER.exec(text);
  return match ? listProperty(match[1], "alias(?:es)?", /,/) : [];
}

const TAG = /(?:^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
const WIKILINK = /(!?)\[\[([^\]|#^\n]+)(?:[#^][^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g;
const MDLINK = /\[[^\]\n]*\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g;

/** Text without HTML: the lines of an HTML block, and the markup of inline tags (`style="color: #3f5e4b"` is no tag). */
function withoutHtml(text: string): string {
  return text.replace(/^[ \t]*<.*$/gm, "").replace(/<[^>\n]*>/g, " ");
}

/** Tags of a note, from its `tags` property and its prose outside code and HTML, without `#`, in their written case. */
export function noteTags(text: string): string[] {
  const { body, tags } = frontmatter(text);
  return [...tags, ...[...withoutHtml(withoutCode(body)).matchAll(TAG)].map((m) => m[1])];
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

/** A tag of the tag tree: `#projet/site` is the child `site` of `projet`. */
export interface TagNode {
  /** Its last part, as first written in the vault. */
  name: string;
  /** The whole tag, lowercase, without `#` (what the search filter takes). */
  tag: string;
  /** Notes carrying it or one of its nested tags. */
  count: number;
  children: TagNode[];
}

/** The vault's tags as a tree, nested on `/`, sorted by name. */
export function tagTree(notes: [string, string][]): TagNode[] {
  const nodes = new Map<string, { name: string; pages: Set<string>; children: Set<string> }>();
  const roots = new Set<string>();
  for (const [path, text] of notes) {
    if (isDrawingPath(path)) continue;
    for (const written of noteTags(text)) {
      const parts = written.split("/").filter(Boolean);
      parts.forEach((part, i) => {
        const tag = parts
          .slice(0, i + 1)
          .join("/")
          .toLowerCase();
        const node = nodes.get(tag) ?? { name: part, pages: new Set(), children: new Set() };
        node.pages.add(path);
        nodes.set(tag, node);
        if (i === 0) roots.add(tag);
        else nodes.get(parts.slice(0, i).join("/").toLowerCase())!.children.add(tag);
      });
    }
  }
  const build = (tags: Set<string>): TagNode[] =>
    [...tags]
      .map((tag) => {
        const node = nodes.get(tag)!;
        return { name: node.name, tag, count: node.pages.size, children: build(node.children) };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  return build(roots);
}
