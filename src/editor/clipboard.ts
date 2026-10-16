import type { Slice } from "@tiptap/pm/model";
import { serializeTopLevelBlock } from "../markdown/note";

/**
 * The plain text put on the clipboard when copying from a note: its Markdown,
 * so that pasting in a text editor gives `## titles`, `- lists`, `**bold**`
 * and `[[links]]` (rich editors still get the HTML).
 */
export function markdownForClipboard(slice: Slice): string {
  const blocks: string[] = [];
  try {
    slice.content.forEach((node) => {
      const block = node.isInline ? node.type.schema.nodes.paragraph.create(null, node) : node;
      blocks.push(serializeTopLevelBlock(block.toJSON()).replace(/\n+$/, ""));
    });
  } catch {
    return slice.content.textBetween(0, slice.content.size, "\n\n");
  }
  return blocks.filter((block) => block !== "").join("\n\n");
}
