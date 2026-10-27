/**
 * Page icons: an emoji in the `icon` front matter property
 * (the property read by the common Obsidian icon plugins). Plugin icon names
 * such as "LiHome" are not emoji and are ignored.
 */
import { splitFrontmatter } from "../markdown/frontmatter";

/** The emoji icon of a note, or null. */
export function noteIcon(markdown: string): string | null {
  const yaml = splitFrontmatter(markdown)?.yaml;
  if (!yaml) return null;
  const value = /^icon[ \t]*:[ \t]*(.*)$/m.exec(yaml)?.[1].trim().replace(/^["']|["']$/g, "");
  return value && isEmoji(value) ? value : null;
}

/** Inline Markdown reduced to its text: links show their label, emphasis marks go. */
function plainText(text: string): string {
  return text
    .replace(/\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (_m, target: string, alias: string) => alias || target)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~=]/g, "")
    .trim();
}

/**
 * A page's title, read from its beginning: a note's first line when it is a
 * `# heading`, the `title` property for the other kinds (`plainNote` false).
 * Null when it has none (the title is then the file name).
 */
export function pageTitle(markdown: string, plainNote: boolean): string | null {
  const front = splitFrontmatter(markdown);
  if (!plainNote) {
    const value = front && /^title[ \t]*:[ \t]*(.*)$/m.exec(front.yaml)?.[1].trim().replace(/^["']|["']$/g, "");
    return value || null;
  }
  const body = front ? front.body : markdown.replace(/^\uFEFF/, "");
  const first = body.split(/\r?\n/).find((line) => line.trim() !== "");
  const heading = first && /^ {0,3}# +(.*?)(?:\s+#+)?\s*$/.exec(first);
  return (heading && plainText(heading[1])) || null;
}

/** One emoji (possibly with modifiers or joiners), not text. */
export function isEmoji(value: string): boolean {
  return value.length <= 16 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value) && !/[\p{L}\p{N}]/u.test(value.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ""));
}
