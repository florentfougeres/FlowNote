/**
 * Coloured highlights: a colour emoji right after the
 * opening `==` (`==🟡text==`). Obsidian shows the emoji inside a plain highlight.
 */
export const HIGHLIGHT_COLORS = [
  { color: "green", emoji: "🟢", label: "Vert" },
  { color: "red", emoji: "🔴", label: "Rouge" },
  { color: "blue", emoji: "🔵", label: "Bleu" },
  { color: "yellow", emoji: "🟡", label: "Jaune" },
  { color: "purple", emoji: "🟣", label: "Violet" },
] as const;

export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]["color"];

/** The colour whose emoji starts `text`, if any. */
export function highlightColorAt(text: string): (typeof HIGHLIGHT_COLORS)[number] | undefined {
  return HIGHLIGHT_COLORS.find((c) => text.startsWith(c.emoji));
}

export function highlightEmoji(color: unknown): string {
  return HIGHLIGHT_COLORS.find((c) => c.color === color)?.emoji ?? "";
}
