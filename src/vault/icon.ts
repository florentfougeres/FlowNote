/**
 * Page icons, like Notion's: an emoji in the `icon` front matter property
 * (the property read by the common Obsidian icon plugins). Plugin icon names
 * such as "LiHome" are not emoji and are ignored.
 */
const FRONTMATTER = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** The emoji icon of a note, or null. */
export function noteIcon(markdown: string): string | null {
  const yaml = FRONTMATTER.exec(markdown)?.[1];
  if (!yaml) return null;
  const value = /^icon[ \t]*:[ \t]*(.*)$/m.exec(yaml)?.[1].trim().replace(/^["']|["']$/g, "");
  return value && isEmoji(value) ? value : null;
}

/** One emoji (possibly with modifiers or joiners), not text. */
export function isEmoji(value: string): boolean {
  return value.length <= 16 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value) && !/[\p{L}\p{N}]/u.test(value.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ""));
}
