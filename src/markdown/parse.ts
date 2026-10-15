import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import type { List, ListItem, Nodes, PhrasingContent, Root, RootContent, Table } from "mdast";
import type { PMJSON, PMMark } from "./types";
import { equivalent } from "./normalize";
import { mkdocsSyntax } from "./flavor";

/**
 * Markdown -> ProseMirror JSON.
 *
 * mdast gives us block structure and CommonMark/GFM inline parsing; everything is
 * converted using the original source offsets so that style details (markers,
 * fences, raw constructs) survive. Container content (blockquotes, callouts, list
 * items) is extracted as text, stripped of its prefixes and parsed recursively,
 * which keeps every node's source slice expressed relative to its own container.
 *
 * Obsidian syntax with no CommonMark meaning (wikilinks, embeds, ==highlights==,
 * %%comments%%) is recognised in literal text after parsing.
 */

const base = () => unified().use(remarkParse).use(remarkGfm, { singleTilde: false }).use(remarkMath);
const documentProcessor = base().use(remarkFrontmatter, ["yaml"]);
const fragmentProcessor = base();

export interface TopLevelBlock {
  json: PMJSON;
  start: number;
  end: number;
}

export interface ParsedDocument {
  /** Offset right after the closing `---` of the YAML frontmatter, if any. */
  frontmatterEnd: number | null;
  blocks: TopLevelBlock[];
  context: ParseContext;
}

/**
 * Link reference and footnote definitions of the whole document. Fragments are
 * parsed with them so that `[text][ref]` and `[^1]` keep their meaning inside
 * containers and when serializer output is verified.
 */
export interface ParseContext {
  definitions: string;
  definitionCount: number;
}

export const NO_CONTEXT: ParseContext = { definitions: "", definitionCount: 0 };

const DEFINITION_TYPES = new Set(["definition", "footnoteDefinition"]);

export function parseDocument(src: string): ParsedDocument {
  const root = documentProcessor.parse(src) as Root;
  const definitions = root.children.filter((c) => DEFINITION_TYPES.has(c.type)).map((c) => src.slice(...span(c)));
  const context: ParseContext = { definitions: definitions.join("\n\n"), definitionCount: definitions.length };
  let frontmatterEnd: number | null = null;
  let children = root.children;
  const first = children[0];
  if (first?.type === "yaml" && span(first)[0] === 0) {
    frontmatterEnd = span(first)[1];
    children = children.slice(1);
  }
  return { frontmatterEnd, blocks: convertBlocks(children, src, context), context };
}

/** Parses Markdown that is not a whole file (container content, serializer output). */
export function parseFragment(md: string, context: ParseContext = NO_CONTEXT): PMJSON[] {
  if (context.definitionCount > 0) {
    const root = fragmentProcessor.parse(`${md}\n\n${context.definitions}`) as Root;
    const own = root.children.slice(0, root.children.length - context.definitionCount);
    const appended = root.children.slice(own.length);
    // If the fragment swallowed the appended definitions (e.g. an unclosed fence), parse it alone.
    if (appended.length === context.definitionCount && appended.every((c) => DEFINITION_TYPES.has(c.type) && span(c)[0] >= md.length)) {
      return convertBlocks(own, md, context).map((b) => b.json);
    }
  }
  const root = fragmentProcessor.parse(md) as Root;
  return convertBlocks(root.children, md, context).map((b) => b.json);
}

/** The blocks of a list of mdast siblings; with the MkDocs syntax on, admonitions and content tabs are gathered first. */
function convertBlocks(children: RootContent[], src: string, ctx: ParseContext): TopLevelBlock[] {
  if (!mkdocsSyntax()) return children.map((child) => ({ json: convertBlock(child, src, ctx), ...spanOf(child) }));
  const blocks: TopLevelBlock[] = [];
  let i = 0;
  while (i < children.length) {
    const { start, end } = spanOf(children[i]);
    const lineEnd = endOfLine(src, start);
    const header = src.slice(start, lineEnd);
    const admonition = ADMONITION.exec(header);
    if (!admonition && !TAB.test(header)) {
      blocks.push({ json: convertBlock(children[i], src, ctx), start, end });
      i++;
      continue;
    }
    if (admonition) {
      const region = indentedRegion(children, i, src, lineEnd);
      blocks.push({ json: admonitionJson(admonition, src, lineEnd, region.end, ctx), start, end: region.end });
      i = region.next;
      continue;
    }
    // Consecutive `=== "Title"` blocks make one set of tabs.
    const tabs: PMJSON[] = [];
    let groupEnd = end;
    while (i < children.length) {
      const tabStart = spanOf(children[i]).start;
      const tabLineEnd = endOfLine(src, tabStart);
      const match = TAB.exec(src.slice(tabStart, tabLineEnd));
      if (!match) break;
      const region = indentedRegion(children, i, src, tabLineEnd);
      const body = parseFragment(unindentBody(src.slice(Math.min(tabLineEnd + 1, region.end), region.end)), ctx);
      tabs.push(node("tab", { title: match[2], marker: match[1], spaced: blankAfterHeader(src, tabLineEnd, region.end) }, body.length > 0 ? body : [node("paragraph")]));
      groupEnd = region.end;
      i = region.next;
    }
    blocks.push({ json: node("tabs", undefined, tabs), start, end: groupEnd });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// MkDocs Material: admonitions and content tabs

/** `!!! type`, `??? type` (folded) or `???+ type` (foldable, open), with modifiers and a quoted title. */
const ADMONITION = /^(!!!|\?\?\?\+?)[ \t]+([A-Za-z][\w-]*)((?:[ \t]+(?:inline|end))*)(?:[ \t]+"([^"\n]*)")?[ \t]*$/;
/** `=== "Title"` (`===+` selects the tab, `===!` starts a new set). */
const TAB = /^(===[+!]?)[ \t]+"([^"\n]*)"[ \t]*$/;

function spanOf(node: Nodes): { start: number; end: number } {
  const [start, end] = span(node);
  return { start, end };
}

function endOfLine(src: string, from: number): number {
  const at = src.indexOf("\n", from);
  return at < 0 ? src.length : at;
}

/**
 * The body of a header line ending at `headerEnd`: the following lines that
 * are blank or indented by four spaces (or a tab), up to the last indented
 * one. Siblings starting inside it are part of it (`next` is the first that
 * is not), and widen it when they run past.
 */
function indentedRegion(children: RootContent[], index: number, src: string, headerEnd: number): { end: number; next: number } {
  let end = headerEnd;
  let at = headerEnd;
  while (at < src.length) {
    const lineEnd = endOfLine(src, at + 1);
    const line = src.slice(at + 1, lineEnd);
    if (line.trim() !== "") {
      if (!/^( {4}|\t)/.test(line)) break;
      end = lineEnd;
    }
    at = lineEnd;
  }
  let next = index;
  while (next < children.length && span(children[next])[0] < Math.max(end, headerEnd + 1)) {
    end = Math.max(end, span(children[next])[1]);
    next++;
  }
  return { end, next: Math.max(next, index + 1) };
}

/** Text indented by up to four spaces (or a tab), unindented. */
function unindentBody(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^( {1,4}|\t)/, ""))
    .join("\n");
}

/** Whether the body starts after a blank line (kept when the block is rewritten). */
function blankAfterHeader(src: string, headerEnd: number, end: number): boolean {
  return /^\n[ \t]*\n/.test(src.slice(headerEnd, end));
}

function admonitionJson(header: RegExpExecArray, src: string, headerEnd: number, end: number, ctx: ParseContext): PMJSON {
  const [, marker, calloutType, modifiers, title] = header;
  const body = end > headerEnd ? parseFragment(unindentBody(src.slice(headerEnd + 1, end)), ctx) : [];
  const fold = marker === "???" ? "-" : marker === "???+" ? "+" : "";
  return node(
    "callout",
    { calloutType, fold, compact: false, syntax: "mkdocs", modifiers: modifiers.trim(), explicitTitle: title !== undefined, spaced: blankAfterHeader(src, headerEnd, end) },
    [node("calloutTitle", undefined, title ? [{ type: "text", text: title }] : undefined), ...body],
  );
}

function span(node: Nodes): [number, number] {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) throw new Error(`mdast node without position: ${node.type}`);
  return [start, end];
}

function node(type: string, attrs?: Record<string, unknown>, content?: PMJSON[]): PMJSON {
  const json: PMJSON = { type };
  if (attrs) json.attrs = attrs;
  if (content && content.length > 0) json.content = content;
  return json;
}

// ---------------------------------------------------------------------------
// Blocks

function convertBlock(n: RootContent, src: string, ctx: ParseContext): PMJSON {
  const [start, end] = span(n);
  const raw = src.slice(start, end);
  switch (n.type) {
    case "paragraph":
      return node("paragraph", { escapes: escapedChars(raw), trailing: trailingSpace(raw) }, convertInline(n.children, src));
    case "heading": {
      const setext = /^[ \t]{0,3}#/.test(raw) ? null : raw.slice(raw.lastIndexOf("\n") + 1).trim();
      const trailing = setext === null ? trailingSpace(raw) : "";
      return node("heading", { level: n.depth, setext, escapes: escapedChars(raw), trailing }, convertInline(n.children, src));
    }
    case "thematicBreak":
      return node("horizontalRule", { raw });
    case "code": {
      const fence = /^[ \t]*(`{3,}|~{3,})/.exec(raw)?.[1] ?? "";
      const text = n.value ? [{ type: "text", text: n.value }] : undefined;
      const opening = fence ? raw.slice(0, raw.indexOf("\n") < 0 ? raw.length : raw.indexOf("\n")).trimStart() : "";
      return node("codeBlock", { language: n.lang ?? "", meta: n.meta ?? "", fence, opening }, text);
    }
    case "blockquote":
      return convertQuote(raw, ctx);
    case "list":
      return convertList(n, src, ctx);
    case "table":
      return convertTable(n, src, raw);
    default:
      // Tables, HTML, math blocks, footnote and link definitions: kept verbatim.
      return node("rawBlock", { source: raw, kind: n.type });
  }
}

/** Whitespace at the end of a block, which mdast drops from text values. */
function trailingSpace(raw: string): string {
  return /[ \t]*$/.exec(raw)![0];
}

/** ASCII punctuation the author escaped with a backslash (outside code spans, approximately). */
function escapedChars(raw: string): string {
  const chars = new Set<string>();
  for (const match of raw.replace(/`+[^`]*`+/g, "").matchAll(/\\([!-/:-@[-`{-~])/g)) chars.add(match[1]);
  return [...chars].sort().join("");
}

function convertTable(table: Table, src: string, raw: string): PMJSON {
  const lines = raw.split("\n").filter((line) => line.trim() !== "");
  // Layout: outer pipes, columns padded to the same width, original delimiter row.
  const pipes = lines.every((line) => line.trim().startsWith("|"));
  // Columns are "padded" when cells carry extra spaces so that every row has the same column widths.
  const cellsOf = (line: string) => line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/);
  const contentRows = lines.filter((_line, i) => i !== 1).map(cellsOf);
  const sameWidths = contentRows.every((row) => row.length === contentRows[0].length && row.every((cell, c) => cell.length === contentRows[0][c].length));
  const hasPadding = contentRows.some((row) => row.some((cell) => cell.trim().length + 2 < cell.length));
  const padded = contentRows.length > 1 && sameWidths && hasPadding;
  const align = table.align ?? [];
  const rows = table.children.map((row, r) =>
    node(
      "tableRow",
      undefined,
      row.children.map((cell, c) =>
        node(r === 0 ? "tableHeader" : "tableCell", { colspan: 1, rowspan: 1, colwidth: null, align: align[c] ?? null }, [
          node("paragraph", undefined, convertInline(cell.children, src)),
        ]),
      ),
    ),
  );
  return node("table", { padded, pipes, delimiter: lines[1]?.trim() ?? null }, rows);
}

const QUOTE_PREFIX = /^[ \t]{0,3}>[ \t]?/;
const EMPTY_QUOTE_LINE = /^[ \t]{0,3}>[ \t]*$/;
const CALLOUT_HEADER = /^\[!([^\]\s]+)\]([+-]?)[ \t]*(.*)$/;

function convertQuote(raw: string, ctx: ParseContext): PMJSON {
  const sourceLines = raw.split("\n");
  // "Compact" quotes separate their blocks without empty `>` lines when Markdown allows it.
  const compact = !sourceLines.slice(1).some((line) => EMPTY_QUOTE_LINE.test(line));
  const lines = sourceLines.map((line) => line.replace(QUOTE_PREFIX, ""));
  const header = CALLOUT_HEADER.exec(lines[0]);
  if (header) {
    const [, calloutType, fold, title] = header;
    const body = parseFragment(lines.slice(1).join("\n"), ctx);
    return node("callout", { calloutType, fold, compact }, [node("calloutTitle", undefined, parseInlineText(title, ctx)), ...body]);
  }
  const children = parseFragment(lines.join("\n"), ctx);
  return node("blockquote", { compact }, children.length > 0 ? children : [node("paragraph")]);
}

/** Inline content of a single line that is not a paragraph of its own (callout titles). */
export function parseInlineText(text: string, ctx: ParseContext = NO_CONTEXT): PMJSON[] {
  if (text.trim() === "") return [];
  const blocks = parseFragment(text, ctx);
  if (blocks.length === 1 && blocks[0].type === "paragraph") return blocks[0].content ?? [];
  return [{ type: "text", text }];
}

const ITEM_MARKER = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]*)/;

function convertList(list: List, src: string, ctx: ParseContext): PMJSON {
  const markers = list.children.map((item) => ITEM_MARKER.exec(src.slice(...span(item)))?.[2] ?? "-");
  const ordered = Boolean(list.ordered);
  let numbering = "sequential";
  if (ordered && markers.length > 1 && markers.every((m) => parseInt(m, 10) === parseInt(markers[0], 10))) {
    numbering = "constant";
  }
  return node(
    "list",
    {
      ordered,
      start: list.start ?? 1,
      bullet: ordered ? markers[0].slice(-1) : markers[0],
      spread: Boolean(list.spread),
      numbering,
    },
    list.children.map((item, i) => {
      const json = convertListItem(item, src, ctx);
      // Number of line breaks separating this item from the previous one.
      if (i > 0) json.attrs!.gapBefore = (src.slice(span(list.children[i - 1])[1], span(item)[0]).match(/\n/g) ?? []).length;
      return json;
    }),
  );
}

function convertListItem(item: ListItem, src: string, ctx: ParseContext): PMJSON {
  const [start, end] = span(item);
  const lines = src.slice(start, end).split("\n");
  const marker = ITEM_MARKER.exec(lines[0]);
  if (!marker) throw new Error(`list item without marker: ${lines[0]}`);
  const [whole, indent, bullet, spaces] = marker;

  // Column where the item content starts (CommonMark list item rules, tabs approximated).
  const markerColumn = (item.position?.start.column ?? 1) - 1 + indent.length;
  let first = lines[0].slice(whole.length);
  let padding = spaces.length >= 1 && spaces.length <= 4 ? spaces.length : 1;
  if (first === "") padding = 1;
  if (spaces.length > 4) first = lines[0].slice(indent.length + bullet.length + 1);
  const contentColumn = markerColumn + bullet.length + padding;

  let checked: boolean | null = null;
  let checkChar: string | null = null;
  if (item.checked !== null && item.checked !== undefined) {
    const box = /^\[([ xX])\][ \t]?/.exec(first);
    if (box) {
      checked = item.checked;
      checkChar = box[1];
      first = first.slice(box[0].length);
    }
  }

  const continuation = lines.slice(1);
  const parseBody = (indent: number) => parseFragment([first, ...continuation.map((line) => dedent(line, indent))].join("\n"), ctx);
  // Fast path: a one-line item holding a single paragraph is converted from the
  // already parsed node (its source positions are exact); anything else is
  // re-parsed on its own so that nested containers keep exact source slices.
  const single = continuation.length === 0 && item.children.length === 1 && item.children[0].type === "paragraph";
  let children = single ? [convertBlock(item.children[0], src, ctx)] : parseBody(contentColumn);

  // Layout details reused when the item is re-serialized: indentation before the
  // marker, spaces after it, and extra indentation of continuation lines (e.g.
  // nested lists indented by 4 spaces under "- "). The extra indentation is only
  // folded into the item when removing it does not change the content.
  const indents = continuation
    .filter((line) => line.trim() !== "")
    .map((line) => columns(/^[ \t]*/.exec(line)![0]))
    .filter((width) => width >= contentColumn);
  let extra = indents.length > 0 ? Math.min(...indents) - contentColumn : 0;
  if (extra > 0 && extra < 4) {
    const deeper = parseBody(contentColumn + extra);
    if (equivalent(deeper, children)) children = deeper;
    else extra = 0;
  } else {
    extra = 0;
  }
  const lineStart = src.lastIndexOf("\n", start - 1) + 1;
  const before = src.slice(lineStart, start);
  const markerIndent = (/^[ \t]*$/.test(before) ? before : "") + indent;
  const attrs = {
    checked,
    checkChar,
    spread: Boolean(item.spread),
    markerIndent: markerIndent.includes("\t") ? "" : markerIndent,
    padding: spaces.length > 4 || first === "" ? 1 : Math.max(1, spaces.length),
    extraIndent: extra,
    tabs: continuation.some((line) => line.trim() !== "" && line.startsWith("\t")),
    gapBefore: null,
  };
  return node("listItem", attrs, children.length > 0 ? children : [node("paragraph")]);
}

function columns(whitespace: string): number {
  let column = 0;
  for (const c of whitespace) column = c === "\t" ? (Math.floor(column / 4) + 1) * 4 : column + 1;
  return column;
}

function dedent(line: string, columns: number): string {
  let column = 0;
  let i = 0;
  while (i < line.length && column < columns) {
    if (line[i] === " ") column++;
    else if (line[i] === "\t") column = (Math.floor(column / 4) + 1) * 4;
    else break;
    i++;
  }
  return line.slice(i);
}

// ---------------------------------------------------------------------------
// Inline

/** A converted inline node that still remembers its source slice. */
type Segment = PMJSON & { raw?: string };

function convertInline(nodes: PhrasingContent[], src: string): PMJSON[] {
  let segments = collectInline(nodes, src, []);
  segments = segments.flatMap(splitSoftBreaks);
  segments = segments.flatMap(expandObsidianTokens);
  segments = applyHighlights(segments);
  return mergeText(segments);
}

function withMarks(segment: Segment, marks: PMMark[] | undefined): Segment {
  return marks && marks.length > 0 ? { ...segment, marks } : segment;
}

/** Adds a mark; the same mark nested in itself (`_a _b_ c_`) renders once, as ProseMirror stores it. */
function addMark(marks: PMMark[], mark: PMMark): PMMark[] {
  return marks.some((m) => m.type === mark.type) ? marks : [...marks, mark];
}

function collectInline(nodes: PhrasingContent[], src: string, marks: PMMark[]): Segment[] {
  const out: Segment[] = [];
  for (const n of nodes) {
    const [start, end] = span(n);
    const raw = src.slice(start, end);
    switch (n.type) {
      case "text":
        if (n.value) out.push(withMarks({ type: "text", text: n.value, raw }, marks));
        break;
      case "emphasis":
        out.push(...collectInline(n.children, src, addMark(marks, { type: "italic", attrs: { marker: raw[0] } })));
        break;
      case "strong":
        out.push(...collectInline(n.children, src, addMark(marks, { type: "bold", attrs: { marker: raw.slice(0, 2) } })));
        break;
      case "delete":
        out.push(...collectInline(n.children, src, addMark(marks, { type: "strike" })));
        break;
      case "inlineCode": {
        if (!n.value) {
          out.push(withMarks({ type: "inlineRaw", attrs: { source: raw, kind: n.type } }, marks));
          break;
        }
        const ticks = /^`+/.exec(raw)?.[0].length ?? 1;
        // Line endings inside code spans are spaces (CommonMark).
        out.push({ type: "text", text: n.value.replace(/\n/g, " "), marks: [...marks, { type: "code", attrs: { ticks } }] });
        break;
      }
      case "link": {
        if (n.children.length === 0) {
          out.push(withMarks({ type: "inlineRaw", attrs: { source: raw, kind: n.type } }, marks));
          break;
        }
        const kind = raw.startsWith("<") ? "autolink" : raw.startsWith("[") ? "inline" : "literal";
        const link = { type: "link", attrs: { href: n.url, title: n.title ?? null, kind } };
        out.push(...collectInline(n.children, src, addMark(marks, link)));
        break;
      }
      case "image":
        out.push(withMarks({ type: "image", attrs: { src: n.url, alt: n.alt ?? "", title: n.title ?? null, raw } }, marks));
        break;
      case "break":
        out.push({ type: "hardBreak", attrs: { raw } });
        break;
      default:
        // Inline math, HTML, footnote references, reference-style links.
        out.push(withMarks({ type: "inlineRaw", attrs: { source: raw, kind: n.type } }, marks));
    }
  }
  return out;
}

/** Literal text whose source contains no escapes or entities, where Obsidian syntax may be recognised. */
function isLiteral(segment: Segment): boolean {
  if (segment.type !== "text") return false;
  if (segment.marks?.some((m) => m.type === "code")) return false;
  return segment.raw !== undefined && !/[\\&]/.test(segment.raw);
}

const OBSIDIAN_TOKEN = /%%[^\n]*?%%|!?\[\[[^[\]\n]+?\]\]/g;

function expandObsidianTokens(segment: Segment): Segment[] {
  if (!isLiteral(segment)) return [segment];
  const text = segment.text!;
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(OBSIDIAN_TOKEN)) {
    const token = match[0];
    const at = match.index!;
    if (at > last) out.push({ ...segment, text: text.slice(last, at) });
    if (token.startsWith("%%")) {
      out.push(withMarks({ type: "inlineRaw", attrs: { source: token, kind: "comment" } }, segment.marks));
    } else {
      const embed = token.startsWith("!");
      const inner = token.slice(embed ? 3 : 2, -2);
      const bar = inner.indexOf("|");
      const attrs = {
        target: bar < 0 ? inner : inner.slice(0, bar),
        alias: bar < 0 ? null : inner.slice(bar + 1),
        embed,
      };
      out.push(withMarks({ type: "wikilink", attrs }, segment.marks));
    }
    last = at + token.length;
  }
  if (out.length === 0) return [segment];
  if (last < text.length) out.push({ ...segment, text: text.slice(last) });
  return out;
}

const HIGHLIGHT: PMMark = { type: "highlight" };

function edgeChar(segments: Segment[], index: number, direction: -1 | 1): string | undefined {
  const neighbour = segments[index + direction];
  if (!neighbour) return undefined;
  if (neighbour.type === "text") return direction < 0 ? neighbour.text!.slice(-1) : neighbour.text![0];
  if (neighbour.type === "softBreak" || neighbour.type === "hardBreak") return " ";
  return "x";
}

/** Pairs `==` delimiters across segments (highlights may contain other formatting). */
function applyHighlights(segments: Segment[]): Segment[] {
  if (!segments.some((s) => isLiteral(s) && s.text!.includes("=="))) return segments;
  const out: Segment[] = [];
  let open = false;
  const emit = (segment: Segment, text: string, highlighted: boolean) => {
    if (!text) return;
    const piece = { ...segment, text };
    out.push(highlighted ? withMarks(piece, [...(segment.marks ?? []), HIGHLIGHT]) : piece);
  };
  segments.forEach((segment, index) => {
    if (!isLiteral(segment)) {
      out.push(open && segment.type !== "hardBreak" ? withMarks(segment, [...(segment.marks ?? []), HIGHLIGHT]) : segment);
      return;
    }
    const text = segment.text!;
    let last = 0;
    for (const match of text.matchAll(/==/g)) {
      const at = match.index!;
      if (text[at - 1] === "=" || text[at + 2] === "=") continue;
      const before = at > 0 ? text[at - 1] : edgeChar(segments, index, -1);
      const after = at + 2 < text.length ? text[at + 2] : edgeChar(segments, index, 1);
      const opens = !open && after !== undefined && !/\s/.test(after);
      const closes = open && before !== undefined && !/\s/.test(before);
      if (!opens && !closes) continue;
      emit(segment, text.slice(last, at), open);
      open = !open;
      last = at + 2;
    }
    emit(segment, text.slice(last), open);
  });
  return open ? segments : out;
}

/**
 * Soft line breaks become nodes. The whitespace around them, which mdast strips
 * from text values, is recovered from the source so that edited paragraphs keep
 * their trailing spaces and continuation indents.
 */
function splitSoftBreaks(segment: Segment): Segment[] {
  if (segment.type !== "text" || !segment.text!.includes("\n")) return [segment];
  const lines = segment.text!.split("\n");
  const rawLines = segment.raw?.split("\n");
  const aligned = rawLines !== undefined && rawLines.length === lines.length;
  const out: Segment[] = [];
  lines.forEach((line, i) => {
    if (i > 0) {
      const attrs = aligned
        ? { trailing: /[ \t]*$/.exec(rawLines[i - 1])![0], leading: /^[ \t]*/.exec(rawLines[i])![0] }
        : { trailing: "", leading: "" };
      out.push(withMarks({ type: "softBreak", attrs }, segment.marks));
    }
    if (line) out.push({ ...segment, text: line, raw: aligned ? rawLines[i] : segment.raw });
  });
  return out;
}

function mergeText(segments: Segment[]): PMJSON[] {
  const out: PMJSON[] = [];
  for (const { raw: _raw, ...segment } of segments) {
    const previous = out[out.length - 1];
    if (
      previous &&
      previous.type === "text" &&
      segment.type === "text" &&
      JSON.stringify(previous.marks ?? []) === JSON.stringify(segment.marks ?? [])
    ) {
      previous.text += segment.text!;
    } else {
      out.push(segment);
    }
  }
  return out;
}
