/**
 * The reading list: one Markdown note where each theme is a heading and each
 * link a task, checked once read or watched:
 *
 *   # Lectures
 *
 *   ## IA
 *   - [ ] [Comprendre les transformers](https://example.com/transformers)
 *   - [x] https://example.com/deja-lu
 *
 * Edits change only what they must: checking a link flips one character,
 * adding one inserts one line at the end of its theme.
 */

export interface ReadingItem {
  /** 0-based line of the task in the file. */
  line: number;
  checked: boolean;
  title: string;
  url: string;
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
    const link = MD_LINK.exec(task[4]);
    const bare = link ? null : BARE_URL.exec(task[4]);
    const url = link?.[2] ?? bare?.[1];
    if (!url) return;
    const title = link ? link[1].replace(/\\(.)/g, "$1").trim() || url : task[4].replace(bare![0], "").trim() || url;
    sections[sections.length - 1].items.push({ line, checked: task[2] !== " ", title, url });
  });
  return sections.filter((s) => s.title !== null || s.items.length > 0);
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

/** "[Title](url)", or the bare URL when there is no title. */
export function linkMarkdown(title: string, url: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  return clean && clean !== url ? `[${clean.replace(/([[\]\\])/g, "\\$1")}](${url.replace(/[()\s]/g, (c) => ({ "(": "%28", ")": "%29" })[c] ?? "%20")})` : url;
}

/**
 * The file with a new unchecked link at the end of theme `theme` (created at
 * the end of the file when missing; null theme: before the first heading).
 */
export function addLink(markdown: string, theme: string | null, title: string, url: string): string {
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const task = `- [ ] ${linkMarkdown(title, url)}`;
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
export function newReadingList(theme: string | null, title: string, url: string): string {
  return addLink("# Lectures\n", theme, title, url);
}

/** Host name of a link, without "www.". */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
