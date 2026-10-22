import type { Node as PMNode } from "@tiptap/pm/model";
import { NO_CONTEXT, parseDocument, parseFragment, type ParseContext } from "./parse";
import { isEmptyParagraph, serializeBlock, VARIANTS, withoutEdgeBreaks } from "./serialize";
import { equivalent } from "./normalize";
import type { PMJSON } from "./types";

/**
 * A note file is laid out as:
 *
 *   [frontmatter][leading][block 0][gap 1][block 1] ... [block n][trailing]
 *
 * Gaps are whitespace only. On save, a top-level block that is still the very
 * node object created at load time is written back as its original source
 * slice; ProseMirror keeps unchanged nodes by identity, so only edited blocks
 * are re-serialized and untouched Markdown stays byte-identical.
 */

export interface BlockOrigin {
  index: number;
  source: string;
  /** Whitespace between the previous original block and this one. */
  gapBefore: string;
}

export interface NoteLayout {
  frontmatter: string | null;
  leading: string;
  trailing: string;
  origins: BlockOrigin[];
  context: ParseContext;
  /** Files written with CRLF everywhere are parsed as LF and written back as CRLF. */
  eol: "\n" | "\r\n";
  /** Byte order mark at the start of the file (Windows editors), restored on save. */
  bom: string;
}

export interface LoadedNote {
  doc: PMJSON;
  layout: NoteLayout;
}

function detectEol(text: string): "\n" | "\r\n" {
  const crlf = text.split("\r\n").length - 1;
  return crlf > 0 && crlf === text.split("\n").length - 1 ? "\r\n" : "\n";
}

export function loadMarkdown(raw: string): LoadedNote {
  // The parser drops a BOM, which would shift every source offset: keep it aside.
  const bom = raw.startsWith("\uFEFF") ? "\uFEFF" : "";
  const file = raw.slice(bom.length);
  const eol = detectEol(file);
  const src = eol === "\r\n" ? file.replace(/\r\n/g, "\n") : file;
  const { frontmatterEnd, blocks, context } = parseDocument(src);
  const bodyStart = frontmatterEnd ?? 0;
  const origins = blocks.map((block, index) => ({
    index,
    source: src.slice(block.start, block.end),
    gapBefore: index === 0 ? "" : src.slice(blocks[index - 1].end, block.start),
  }));
  const layout: NoteLayout = {
    frontmatter: frontmatterEnd === null ? null : src.slice(0, frontmatterEnd),
    leading: blocks.length > 0 ? src.slice(bodyStart, blocks[0].start) : "",
    trailing: blocks.length > 0 ? src.slice(blocks[blocks.length - 1].end) : src.slice(bodyStart),
    origins,
    context,
    eol,
    bom,
  };
  const content = blocks.length > 0 ? blocks.map((b) => b.json) : [{ type: "paragraph" }];
  return { doc: { type: "doc", content }, layout };
}

export class NoteSession {
  private readonly origins = new WeakMap<PMNode, BlockOrigin>();
  /** Blocks put back as they were in another version (the last commit): written with that text. */
  private readonly restored = new WeakMap<PMNode, string>();

  /** `doc` must be the document built from `loadMarkdown(...).doc`, before any edit. */
  constructor(
    public layout: NoteLayout,
    doc: PMNode,
  ) {
    if (doc.childCount !== layout.origins.length) return;
    doc.forEach((child, _offset, index) => this.origins.set(child, layout.origins[index]));
  }

  /** Replaces the frontmatter (null removes it); the blank line after it is kept consistent. */
  setFrontmatter(raw: string | null) {
    const had = this.layout.frontmatter !== null;
    let leading = this.layout.leading;
    if (raw !== null && !had) leading = `\n${leading}`;
    if (raw === null && had) leading = leading.replace(/^\n/, "");
    this.layout = { ...this.layout, frontmatter: raw, leading };
  }

  /** `node` was parsed from `source` (a block of the committed note): it is written back as that exact text. */
  restore(node: PMNode, source: string) {
    this.restored.set(node, source);
  }

  isOriginal(node: PMNode): boolean {
    return this.origins.has(node);
  }

  serialize(doc: PMNode): string {
    const text = this.serializeLF(doc);
    return this.layout.bom + (this.layout.eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text);
  }

  private serializeLF(doc: PMNode): string {
    const { frontmatter, leading, trailing } = this.layout;
    const children: PMNode[] = [];
    doc.forEach((child) => children.push(child));
    const exact = children.map((child) => this.origins.get(child) ?? null);
    const slots = this.alignEdited(exact);

    let body = "";
    let previous: { text: string; slot: BlockOrigin | null; edited: boolean } | null = null;
    children.forEach((child, i) => {
      const origin = exact[i];
      const text = origin ? origin.source : (this.restored.get(child) ?? serializeTopLevelBlock(child.toJSON() as PMJSON, this.layout.context));
      if (text === "") return;
      const current = { text, slot: slots[i], edited: origin === null };
      if (previous) body += this.gapBetween(previous, current);
      body += text;
      previous = current;
    });
    const head = frontmatter ?? "";
    if (previous === null) {
      if (this.layout.origins.length > 0) return head + (head ? "\n" : "");
      return head && !trailing.startsWith("\n") ? `${head}\n${trailing}` : head + trailing;
    }
    if (this.layout.origins.length === 0) {
      // The note had no blocks: the blank lines that followed its front matter now
      // separate it from the new content (the first line must not stick to "---"),
      // and the note ends with a newline.
      if (head) return head + (trailing.startsWith("\n") ? trailing : `\n${trailing}`) + body + "\n";
      return leading + body + (trailing.endsWith("\n") ? trailing : `${trailing}\n`);
    }
    return head + leading + body + trailing;
  }

  /**
   * Edited blocks are new node objects. A run of them sitting exactly where the
   * same number of original blocks used to be is taken as their edited version,
   * so the original spacing around them can be reused.
   */
  private alignEdited(exact: (BlockOrigin | null)[]): (BlockOrigin | null)[] {
    const slots = exact.slice();
    let i = 0;
    while (i < exact.length) {
      if (exact[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j < exact.length && !exact[j]) j++;
      const before = i > 0 ? exact[i - 1]!.index : -1;
      const after = j < exact.length ? exact[j]!.index : this.layout.origins.length;
      if (after - before - 1 === j - i) {
        for (let k = i; k < j; k++) slots[k] = this.layout.origins[before + 1 + (k - i)];
      }
      i = j;
    }
    return slots;
  }

  private gapBetween(
    previous: { text: string; slot: BlockOrigin | null; edited: boolean },
    current: { text: string; slot: BlockOrigin | null; edited: boolean },
  ): string {
    const adjacent = previous.slot !== null && current.slot !== null && previous.slot.index === current.slot.index - 1;
    if (!adjacent) return "\n\n";
    const gap = current.slot!.gapBefore;
    if (gap.includes("\n\n") || (!previous.edited && !current.edited)) return gap;
    // A single newline is only kept if the two blocks still parse as two separate blocks.
    const together = parseFragment(previous.text + gap + current.text, this.layout.context);
    return together.length === 2 ? gap : "\n\n";
  }
}

export interface SerializeReport {
  markdown: string;
  /** False when no variant parsed back to the same content (the last variant is returned). */
  exact: boolean;
}

/** Serializes one top-level block with the least escaping that preserves its meaning. */
export function serializeTopLevelBlockWithReport(edited: PMJSON, context: ParseContext = NO_CONTEXT): SerializeReport {
  const json = withoutEdgeBreaks(edited);
  if (isEmptyParagraph(json)) return { markdown: "", exact: true };
  let markdown = "";
  for (const variant of VARIANTS) {
    markdown = serializeBlock(json, variant);
    if (equivalent(parseFragment(markdown, context), [json])) return { markdown, exact: true };
  }
  return { markdown, exact: false };
}

export function serializeTopLevelBlock(json: PMJSON, context: ParseContext = NO_CONTEXT): string {
  return serializeTopLevelBlockWithReport(json, context).markdown;
}
