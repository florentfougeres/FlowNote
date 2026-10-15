import { getSchema, Mark, Node, type AnyExtension } from "@tiptap/core";
import { Table as TiptapTable } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell as TiptapTableCell } from "@tiptap/extension-table-cell";
import { TableHeader as TiptapTableHeader } from "@tiptap/extension-table-header";

/**
 * Document schema. It mirrors the Markdown subset handled by `src/markdown`:
 * every attribute the parser records must be declared here, otherwise Tiptap
 * drops it and an edited block would lose its original style.
 */

const attrs = (defaults: Record<string, unknown>) => () =>
  Object.fromEntries(Object.entries(defaults).map(([name, value]) => [name, { default: value, rendered: false }]));

const Doc = Node.create({ name: "doc", topNode: true, content: "block+" });

const Text = Node.create({ name: "text", group: "inline" });

const Paragraph = Node.create({
  name: "paragraph",
  group: "block",
  content: "inline*",
  priority: 1000,
  addAttributes: attrs({ escapes: "", trailing: "" }),
  parseHTML: () => [{ tag: "p" }],
  renderHTML: () => ["p", 0],
});

const Heading = Node.create({
  name: "heading",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes: attrs({ level: 1, setext: null, escapes: "", trailing: "" }),
  parseHTML: () => [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
  renderHTML: ({ node }) => [`h${node.attrs.level}`, 0],
});

const HorizontalRule = Node.create({
  name: "horizontalRule",
  group: "block",
  atom: true,
  addAttributes: attrs({ raw: "---" }),
  parseHTML: () => [{ tag: "hr" }],
  renderHTML: () => ["hr"],
});

const CodeBlock = Node.create({
  name: "codeBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  addAttributes: attrs({ language: "", meta: "", fence: "```", opening: "" }),
  parseHTML: () => [{ tag: "pre", preserveWhitespace: "full" }],
  renderHTML: ({ node }) => ["pre", { "data-language": node.attrs.language || null }, ["code", 0]],
});

const Blockquote = Node.create({
  name: "blockquote",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes: attrs({ compact: false }),
  parseHTML: () => [{ tag: "blockquote" }],
  renderHTML: () => ["blockquote", 0],
});

const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "calloutTitle block*",
  defining: true,
  // syntax "hedgedoc": a `:::type` container (marker: its colons, extra: its `{attributes}`).
  addAttributes: attrs({ calloutType: "note", fold: "", compact: false, syntax: "obsidian", marker: ":::", extra: "" }),
  parseHTML: () => [{ tag: "div.callout" }],
  renderHTML: ({ node }) => [
    "div",
    { class: "callout", "data-callout": String(node.attrs.calloutType).toLowerCase(), "data-fold": node.attrs.fold || null },
    0,
  ],
});

const CalloutTitle = Node.create({
  name: "calloutTitle",
  content: "inline*",
  defining: true,
  parseHTML: () => [{ tag: "div.callout-title" }],
  renderHTML: () => ["div", { class: "callout-title" }, 0],
});

const List = Node.create({
  name: "list",
  group: "block",
  content: "listItem+",
  addAttributes: attrs({ ordered: false, start: 1, bullet: "-", spread: false, numbering: "sequential" }),
  parseHTML: () => [
    { tag: "ul", attrs: { ordered: false } },
    { tag: "ol", attrs: { ordered: true } },
  ],
  renderHTML: ({ node }) => (node.attrs.ordered ? ["ol", { start: node.attrs.start }, 0] : ["ul", 0]),
});

const ListItem = Node.create({
  name: "listItem",
  content: "block+",
  defining: true,
  addAttributes: attrs({ checked: null, checkChar: null, spread: false, markerIndent: "", padding: 1, extraIndent: 0, tabs: false, gapBefore: null }),
  parseHTML: () => [{ tag: "li" }],
  renderHTML: ({ node }) => [
    "li",
    { class: node.attrs.checked === null ? null : "task", "data-checked": node.attrs.checked === null ? null : String(node.attrs.checked) },
    0,
  ],
});

const RawBlock = Node.create({
  name: "rawBlock",
  group: "block",
  atom: true,
  addAttributes: attrs({ source: "", kind: "unknown" }),
  renderHTML: ({ node }) => ["pre", { class: "raw-block", "data-kind": node.attrs.kind }, node.attrs.source],
});

/**
 * GFM tables. A Markdown cell holds one line of inline content, so cells
 * contain exactly one paragraph. Column alignment lives on the cells; the
 * table remembers its original layout (padded columns, outer pipes,
 * delimiter row) to write edited tables in the same style.
 */
const Table = TiptapTable.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      padded: { default: false, rendered: false },
      pipes: { default: true, rendered: false },
      delimiter: { default: null, rendered: false },
    };
  },
}).configure({ resizable: false });

const cellAttributes = {
  align: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.textAlign || null,
    renderHTML: (attributes: Record<string, unknown>) => (attributes.align ? { style: `text-align: ${attributes.align}` } : {}),
  },
};

const TableCell = TiptapTableCell.extend({
  content: "paragraph",
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes };
  },
});

const TableHeader = TiptapTableHeader.extend({
  content: "paragraph",
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes };
  },
});

const Wikilink = Node.create({
  name: "wikilink",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: attrs({ target: "", alias: null, embed: false }),
  renderHTML: ({ node }) => [
    "span",
    { class: node.attrs.embed ? "embed" : "wikilink", "data-target": node.attrs.target },
    node.attrs.alias ?? node.attrs.target,
  ],
});

const InlineRaw = Node.create({
  name: "inlineRaw",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: attrs({ source: "", kind: "unknown" }),
  renderHTML: ({ node }) => ["span", { class: "inline-raw", "data-kind": node.attrs.kind }, node.attrs.source],
});

const Image = Node.create({
  name: "image",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: attrs({ src: "", alt: "", title: null, raw: null }),
  renderHTML: ({ node }) => ["img", { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title }],
});

const HardBreak = Node.create({
  name: "hardBreak",
  group: "inline",
  inline: true,
  selectable: false,
  addAttributes: attrs({ raw: null }),
  renderHTML: () => ["br"],
});

const SoftBreak = Node.create({
  name: "softBreak",
  group: "inline",
  inline: true,
  selectable: false,
  addAttributes: attrs({ trailing: "", leading: "" }),
  renderHTML: () => ["br", { class: "soft" }],
});

const Bold = Mark.create({
  name: "bold",
  addAttributes: attrs({ marker: "**" }),
  parseHTML: () => [{ tag: "strong" }, { tag: "b" }],
  renderHTML: () => ["strong", 0],
});

const Italic = Mark.create({
  name: "italic",
  addAttributes: attrs({ marker: "*" }),
  parseHTML: () => [{ tag: "em" }, { tag: "i" }],
  renderHTML: () => ["em", 0],
});

const Strike = Mark.create({
  name: "strike",
  parseHTML: () => [{ tag: "s" }, { tag: "del" }],
  renderHTML: () => ["s", 0],
});

const Highlight = Mark.create({
  name: "highlight",
  parseHTML: () => [{ tag: "mark" }],
  renderHTML: () => ["mark", 0],
});

const Code = Mark.create({
  name: "code",
  addAttributes: attrs({ ticks: 1 }),
  parseHTML: () => [{ tag: "code" }],
  renderHTML: () => ["code", 0],
});

const Link = Mark.create({
  name: "link",
  inclusive: false,
  addAttributes: attrs({ href: "", title: null, kind: "inline" }),
  parseHTML: () => [{ tag: "a[href]", getAttrs: (el) => ({ href: (el as HTMLElement).getAttribute("href") }) }],
  renderHTML: ({ mark }) => ["a", { href: mark.attrs.href, title: mark.attrs.title }, 0],
});

export const documentExtensions: AnyExtension[] = [
  Doc,
  Text,
  Paragraph,
  Heading,
  HorizontalRule,
  CodeBlock,
  Blockquote,
  Callout,
  CalloutTitle,
  List,
  ListItem,
  RawBlock,
  Table,
  TableRow,
  TableHeader,
  TableCell,
  Wikilink,
  InlineRaw,
  Image,
  HardBreak,
  SoftBreak,
  Link,
  Bold,
  Italic,
  Strike,
  Highlight,
  Code,
];

export const schema = getSchema(documentExtensions);
