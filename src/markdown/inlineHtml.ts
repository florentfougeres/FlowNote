/**
 * Inline HTML that wraps text (`<u>souligné</u>`, `<span style="…">…</span>`):
 * read as an `inlineHtml` mark holding its opening tag, written back as is.
 * Other inline HTML stays verbatim (`inlineRaw`).
 */
export const INLINE_HTML_TAGS = new Set(["u", "ins", "span", "sup", "sub", "kbd", "small", "big", "font", "abbr", "cite", "q", "var", "samp", "mark", "b", "i", "em", "strong", "s", "del", "a"]);

/** The tag name of an opening tag of `INLINE_HTML_TAGS` (`<span class="x">` → "span"), else null. */
export function openingTag(html: string): string | null {
  const tag = /^<([a-z][a-z0-9]*)(?:\s[^<>]*)?>$/i.exec(html)?.[1].toLowerCase();
  return tag && INLINE_HTML_TAGS.has(tag) ? tag : null;
}

export function isClosingTag(html: string, tag: string): boolean {
  return new RegExp(`^</${tag}\\s*>$`, "i").test(html);
}
