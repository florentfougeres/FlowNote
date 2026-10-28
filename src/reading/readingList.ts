/**
 * The reading list: one Markdown note where each theme is a heading and each
 * link a task, checked once read or watched:
 *
 *   # Liens
 *
 *   ## IA
 *   - [ ] [Comprendre les transformers](https://example.com/transformers) #llm #video
 *   - [x] https://example.com/deja-lu
 *
 * Tags are Obsidian's `#tags`, anywhere on the line outside the link.
 *
 * Edits change only what they must: checking a link flips one character,
 * adding one inserts one line at the end of its theme, tagging one touches
 * only its tags.
 */

export interface ReadingItem {
  /** 0-based line of the task in the file. */
  line: number;
  checked: boolean;
  title: string;
  url: string;
  /** Tags without their "#", as written. */
  tags: string[];
}

export interface ReadingSection {
  /** Heading text; null for links before the first theme. */
  title: string | null;
  /** 0-based line of the heading (-1 for the untitled section). */
  line: number;
  items: ReadingItem[];
}

const TASK = /^(\s*[-*+] \[)([ xX])(\] )(.*)$/;
const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const MD_LINK = /\[((?:\\.|[^\]\\])*)\]\(<?(https?:\/\/[^)\s>]+)>?(?:\s+"[^"]*")?\)/i;
const BARE_URL = /<?(https?:\/\/[^\s<>]+?)>?(?=[\s.,;)]*$|\s)/i;
/** An Obsidian tag after a space or at the start (not a "#fragment" of a URL). */
const TAG = /(^|\s)#([\p{L}\p{N}_/-]+)/gu;

/** A tag needs one character that is not a digit, like in Obsidian. */
const isTag = (name: string) => /[^\p{N}]/u.test(name);

/** The link of a task's text: its span, URL and title. */
function linkOf(content: string): { start: number; end: number; url: string; title: string | null } | null {
  const link = MD_LINK.exec(content);
  if (link) return { start: link.index, end: link.index + link[0].length, url: link[2], title: link[1].replace(/\\(.)/g, "$1").trim() };
  const bare = BARE_URL.exec(content);
  return bare ? { start: bare.index, end: bare.index + bare[0].length, url: bare[1], title: null } : null;
}

/** The tags of a task's text, outside its link: where each starts (its space included) and ends. */
function tagsOf(content: string, link: { start: number; end: number } | null): { name: string; start: number; end: number }[] {
  // The link is masked: "[C# #1](…)" or "…/page#part" hold no tag.
  const masked = link ? content.slice(0, link.start) + " ".repeat(link.end - link.start) + content.slice(link.end) : content;
  return [...masked.matchAll(TAG)].filter((m) => isTag(m[2])).map((m) => ({ name: m[2], start: m.index, end: m.index + m[0].length }));
}

/** A typed tag as written in the file ("#Machine learning" → "Machine-learning"), or null if it is not one. */
export function normalizeTag(raw: string): string | null {
  const tag = raw
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_/-]/gu, "");
  return tag && isTag(tag) ? tag : null;
}

/** Tags compare without case, like in Obsidian. */
export const tagKey = (tag: string) => tag.toLocaleLowerCase("fr");

function lines(markdown: string): string[] {
  return markdown.split(/\r?\n/);
}

/** Sections and their links, ignoring code blocks and the H1 title. */
export function parseReadingList(markdown: string): ReadingSection[] {
  const sections: ReadingSection[] = [{ title: null, line: -1, items: [] }];
  let fence: string | null = null;
  lines(markdown).forEach((text, line) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(text)?.[1];
    if (marker) {
      if (!fence) fence = marker[0];
      else if (marker[0] === fence) fence = null;
      return;
    }
    if (fence) return;
    const heading = HEADING.exec(text);
    if (heading) {
      if (heading[1].length > 1) sections.push({ title: heading[2], line, items: [] });
      return;
    }
    const task = TASK.exec(text);
    if (!task) return;
    const content = task[4];
    const link = linkOf(content);
    if (!link) return;
    const tags = tagsOf(content, link);
    // A bare URL's title is the text around it, without the tags.
    let rest = content;
    for (const tag of [...tags, link].sort((a, b) => b.start - a.start)) rest = rest.slice(0, tag.start) + " " + rest.slice(tag.end);
    const title = (link.title ?? rest.replace(/\s+/g, " ").trim()) || link.url;
    sections[sections.length - 1].items.push({ line, checked: task[2] !== " ", title, url: link.url, tags: tags.map((t) => t.name) });
  });
  return sections.filter((s) => s.title !== null || s.items.length > 0);
}

/** The tags of the list, most used first, each written as its first use. */
export function readingTagsOf(sections: ReadingSection[]): string[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const item of sections.flatMap((s) => s.items))
    for (const tag of item.tags) {
      const entry = counts.get(tagKey(tag));
      if (entry) entry.count++;
      else counts.set(tagKey(tag), { tag, count: 1 });
    }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "fr")).map((e) => e.tag);
}

/** The file with the task of `line` checked or not; nothing else changes. */
export function setChecked(markdown: string, line: number, checked: boolean): string {
  const parts = markdown.split(/(\r?\n)/);
  const index = line * 2;
  const task = TASK.exec(parts[index] ?? "");
  if (!task) return markdown;
  parts[index] = parts[index].replace(TASK, `$1${checked ? "x" : " "}$3$4`);
  return parts.join("");
}

/**
 * The file with the task of `line` tagged `tags`: removed tags leave the
 * line, new ones are added at its end, the others stay where they are.
 */
export function setTags(markdown: string, line: number, tags: string[]): string {
  const parts = markdown.split(/(\r?\n)/);
  const index = line * 2;
  const task = TASK.exec(parts[index] ?? "");
  if (!task) return markdown;
  const content = task[4];
  const found = tagsOf(content, linkOf(content));
  const wanted = new Map<string, string>();
  for (const tag of tags) if (!wanted.has(tagKey(tag))) wanted.set(tagKey(tag), tag);
  const kept = new Set<string>();
  let next = content;
  for (const tag of [...found].reverse()) {
    const key = tagKey(tag.name);
    // Kept once (the first one); duplicates and removed tags go.
    const first = found.find((t) => tagKey(t.name) === key) === tag;
    if (wanted.has(key) && first) kept.add(key);
    else next = next.slice(0, tag.start) + next.slice(tag.end);
  }
  const added = [...wanted].filter(([key]) => !kept.has(key)).map(([, tag]) => ` #${tag}`);
  if (next === content && added.length === 0) return markdown;
  next = (next !== content ? next.trim() : next) + added.join("");
  parts[index] = parts[index].slice(0, parts[index].length - content.length) + next;
  return parts.join("");
}

/** "[Title](url)", or the bare URL when there is no title. */
export function linkMarkdown(title: string, url: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  return clean && clean !== url ? `[${clean.replace(/([[\]\\])/g, "\\$1")}](${url.replace(/[()\s]/g, (c) => ({ "(": "%28", ")": "%29" })[c] ?? "%20")})` : url;
}

/**
 * The file with a new unchecked link at the end of theme `theme` (created at
 * the end of the file when missing; null theme: before the first heading).
 */
export function addLink(markdown: string, theme: string | null, title: string, url: string, tags: string[] = []): string {
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const task = `- [ ] ${linkMarkdown(title, url)}${tags.map((t) => ` #${t}`).join("")}`;
  const all = markdown === "" ? [] : lines(markdown);
  if (all.length > 0 && all[all.length - 1] === "") all.pop();
  const sections = parseReadingList(markdown);
  const wanted = theme?.trim() || null;
  const section = sections.find((s) => (s.title ?? "").toLowerCase() === (wanted ?? "").toLowerCase() && (s.title === null) === (wanted === null));
  if (!section) {
    if (wanted === null) {
      // Before the first theme, after the title.
      const firstTheme = all.findIndex((l) => /^#{2,6}[ \t]/.test(l));
      const at = firstTheme < 0 ? all.length : firstTheme;
      const block = [task, ...(firstTheme < 0 ? [] : [""])];
      const before = at > 0 && all[at - 1].trim() !== "" ? [""] : [];
      all.splice(at, 0, ...before, ...block);
    } else {
      while (all.length > 0 && all[all.length - 1].trim() === "") all.pop();
      all.push(...(all.length > 0 ? [""] : []), `## ${wanted}`, "", task);
    }
    return all.join(eol) + eol;
  }
  // After the last link of the theme, or under its heading.
  let at: number;
  if (section.items.length > 0) at = section.items[section.items.length - 1].line + 1;
  else {
    at = section.line + 1;
    while (at < all.length && all[at].trim() === "") at++;
    // Text under the heading (a description…): the list goes after it.
    while (at < all.length && all[at].trim() !== "" && !HEADING.test(all[at])) at++;
  }
  const blankBefore = section.items.length === 0 && at > 0 && all[at - 1].trim() !== "";
  const blankAfter = at < all.length && all[at].trim() !== "" && section.items.length === 0;
  all.splice(at, 0, ...(blankBefore ? [""] : []), task, ...(blankAfter ? [""] : []));
  return all.join(eol) + eol;
}

/** A new reading list with its first link. */
export function newReadingList(theme: string | null, title: string, url: string, tags: string[] = []): string {
  return addLink("# Liens\n", theme, title, url, tags);
}

/** Host name of a link, without "www.". */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
