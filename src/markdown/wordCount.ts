/**
 * Words of a note as read, not as written: the front matter, code blocks,
 * comments, URLs and Markdown markers do not count; a link counts its text,
 * a wikilink its alias (or its target).
 */
export function countWords(markdown: string): number {
  const text = markdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "")
    .replace(/<!--[\s\S]*?-->|%%[\s\S]*?%%/g, "")
    .replace(/!?\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (_, target: string, alias: string) => alias || target)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "");
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

/** Reading time in minutes, at 230 words a minute (at least 1 for a non-empty note). */
export function readingMinutes(words: number): number {
  return words === 0 ? 0 : Math.max(1, Math.round(words / 230));
}
