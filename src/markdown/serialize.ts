import type { PMJSON, PMMark } from "./types";

/**
 * ProseMirror JSON -> Markdown, for blocks that were created or edited.
 *
 * Style attributes captured by the parser (emphasis markers, bullets, fences,
 * raw sources) are reused so that an edited block stays as close as possible to
 * what the author wrote. Escaping is controlled by a variant: callers try the
 * least invasive variant first and keep the first one whose output parses back
 * to the same document (see `note.ts`).
 */

export interface Variant {
  /** 0: no escaping, 1: escape characters that commonly carry meaning, 2: escape all punctuation. */
  escape: 0 | 1 | 2;
  /** Ignore recorded markers and use `*`, `**` and inline links. */
  normalizeMarkers: boolean;
}

export const VARIANTS: Variant[] = [
  { escape: 0, normalizeMarkers: false },
  { escape: 1, normalizeMarkers: false },
  { escape: 1, normalizeMarkers: true },
  { escape: 2, normalizeMarkers: true },
];

const attr = <T>(n: PMJSON | PMMark, name: string, fallback: T): T => (n.attrs?.[name] as T | undefined) ?? fallback;

export function serializeBlock(n: PMJSON, v: Variant): string {
  switch (n.type) {
    case "paragraph": {
      const body = serializeInline(n.content ?? [], v, attr(n, "escapes", ""));
      return body ? body + attr(n, "trailing", "") : body;
    }
    case "heading": {
      const level = attr(n, "level", 1);
      const body = serializeInline(n.content ?? [], v, attr(n, "escapes", ""));
      const setext = attr<string | null>(n, "setext", null);
      // Setext headings may span several lines; ATX headings cannot.
      if (setext && body && level <= 2) return `${body}\n${setext}`;
      const line = body.replace(/[ \t]*\n[ \t]*/g, " ");
      return line ? `${"#".repeat(level)} ${line}${attr(n, "trailing", "")}` : "#".repeat(level);
    }
    case "horizontalRule":
      return attr(n, "raw", "").trim() || "---";
    case "codeBlock":
      return serializeCode(n);
    case "blockquote":
      return prefixLines(joinBlocks(n.content ?? [], v, attr(n, "compact", false)));
    case "callout": {
      const [title, ...body] = n.content ?? [];
      const titleText = serializeInline(title?.content ?? [], v).replace(/\n/g, " ");
      const header = `[!${attr(n, "calloutType", "note")}]${attr(n, "fold", "")}${titleText ? ` ${titleText}` : ""}`;
      const inner = joinBlocks(body, v, attr(n, "compact", false));
      return prefixLines(inner ? `${header}\n${inner}` : header);
    }
    case "list":
      return serializeList(n, v);
    case "rawBlock":
      return attr(n, "source", "");
    default:
      throw new Error(`Cannot serialize block of type ${n.type}`);
  }
}

function prefixLines(text: string): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
}

/** Blocks that can directly follow a paragraph line inside a tight list item. */
const INTERRUPTS_PARAGRAPH = new Set(["list", "blockquote", "callout", "heading"]);

export function joinBlocks(children: PMJSON[], v: Variant, tight: boolean): string {
  const nonEmpty = children.length > 1 ? children.filter((c) => !isEmptyParagraph(c)) : children;
  let out = "";
  nonEmpty.forEach((child, i) => {
    if (i > 0) {
      const fenced = child.type === "codeBlock" && attr(child, "fence", "") !== "";
      out += tight && (INTERRUPTS_PARAGRAPH.has(child.type) || fenced) ? "\n" : "\n\n";
    }
    out += serializeBlock(child, v);
  });
  return out;
}

export function isEmptyParagraph(n: PMJSON): boolean {
  return n.type === "paragraph" && (!n.content || n.content.length === 0);
}

function serializeCode(n: PMJSON): string {
  const text = (n.content ?? []).map((c) => c.text ?? "").join("");
  const language = attr(n, "language", "");
  const meta = attr(n, "meta", "");
  const fenceAttr = attr(n, "fence", "");
  if (!fenceAttr && !language && text.trim() !== "" && !text.startsWith("\n")) {
    return text
      .split("\n")
      .map((line) => (line === "" ? "" : `    ${line}`))
      .join("\n");
  }
  const char = fenceAttr.startsWith("~") ? "~" : "`";
  let length = Math.max(3, fenceAttr.length);
  for (const match of text.matchAll(char === "`" ? /^[ \t]*(`{3,})/gm : /^[ \t]*(~{3,})/gm)) {
    length = Math.max(length, match[1].length + 1);
  }
  const fence = char.repeat(length);
  const info = [language, meta].filter(Boolean).join(" ");
  // Reuse the original opening line when it says the same thing (keeps trailing spaces).
  const opening = attr(n, "opening", "");
  const open = opening.startsWith(fence) && opening.trimEnd() === `${fence}${info}` ? opening : `${fence}${info}`;
  return `${open}\n${text}${text ? "\n" : ""}${fence}`;
}

function serializeList(n: PMJSON, v: Variant): string {
  const ordered = attr(n, "ordered", false);
  const start = attr(n, "start", 1);
  const bullet = attr(n, "bullet", ordered ? "." : "-");
  const constant = attr<string>(n, "numbering", "sequential") === "constant";
  const tight = !attr(n, "spread", false);
  let out = "";
  (n.content ?? []).forEach((item, i) => {
    const marker = ordered ? `${constant ? start : start + i}${bullet}` : bullet;
    const checked = attr<boolean | null>(item, "checked", null);
    const checkChar = attr<string | null>(item, "checkChar", null);
    const box = checked === null ? "" : `[${checked ? (checkChar && checkChar !== " " ? checkChar : "x") : " "}]`;
    const children = item.content ?? [];
    const lines = joinBlocks(children, v, !attr(item, "spread", false)).split("\n");
    const markerIndent = attr(item, "markerIndent", "");
    const padding = " ".repeat(attr(item, "padding", 1));
    // Extra continuation indent would shift indented code blocks: only used without them.
    const hasIndentedCode = children.some((c) => c.type === "codeBlock" && !attr(c, "fence", ""));
    const extra = hasIndentedCode ? 0 : attr<number>(item, "extraIndent", 0);
    const width = markerIndent.length + marker.length + padding.length + extra;
    // Obsidian indents nested content with tabs by default.
    const indent = attr(item, "tabs", false) && width % 4 === 0 ? "\t".repeat(width / 4) : " ".repeat(width);
    const lead = markerIndent + [marker, box].filter(Boolean).join(" ");
    const head = lines[0] === "" ? lead : `${lead}${padding}${lines[0]}`;
    if (i > 0) {
      const gap = attr<number | null>(item, "gapBefore", null);
      out += gap !== null && gap >= 1 ? "\n".repeat(gap) : tight ? "\n" : "\n\n";
    }
    out += [head, ...lines.slice(1).map((line) => (line === "" ? "" : indent + line))].join("\n");
  });
  return out;
}

// ---------------------------------------------------------------------------
// Inline

const MARK_ORDER: Record<string, number> = { link: 0, bold: 1, italic: 2, strike: 3, highlight: 4 };
const DELIMITED = new Set(["bold", "italic", "strike", "highlight"]);

function sortedMarks(n: PMJSON): PMMark[] {
  return (n.marks ?? []).filter((m) => m.type !== "code").sort((a, b) => (MARK_ORDER[a.type] ?? 9) - (MARK_ORDER[b.type] ?? 9));
}

function sameMark(a: PMMark, b: PMMark): boolean {
  return a.type === b.type && JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {});
}

type LinkForm = "inline" | "autolink" | "literal";

interface OpenMark {
  mark: PMMark;
  form: LinkForm;
  delimiter: string;
}

/**
 * `escapes` lists characters the author escaped in the original block; they are
 * escaped again even when not strictly necessary, to avoid noise in diffs.
 */
export function serializeInline(nodes: PMJSON[], v: Variant, escapes = ""): string {
  let out = "";
  let pendingSpace = "";
  const active: OpenMark[] = [];

  nodes.forEach((n, index) => {
    // Keep marks that are already open (e.g. emphasis around a link) and open the others inside them.
    const wanted = sortedMarks(n);
    let keep = 0;
    while (keep < active.length && wanted.some((m) => sameMark(m, active[keep].mark))) keep++;
    const kept = active.slice(0, keep).map((a) => a.mark);
    const marks = [...kept, ...wanted.filter((m) => !kept.some((k) => sameMark(k, m)))];

    while (active.length > keep) {
      const entry = active.pop()!;
      // Whitespace held back from emphasis stays inside a link that closes here.
      if (!DELIMITED.has(entry.mark.type)) {
        out += pendingSpace;
        pendingSpace = "";
      }
      out += closing(entry);
    }
    out += pendingSpace;
    pendingSpace = "";

    const isCode = n.marks?.some((m) => m.type === "code") ?? false;
    let text = n.type === "text" ? n.text ?? "" : null;

    // Delimiters cannot be flanked by whitespace on their inner side: move it outside.
    if (text !== null && !isCode && marks.length > keep && marks.slice(keep).some((m) => DELIMITED.has(m.type))) {
      const leading = /^\s+/.exec(text)?.[0] ?? "";
      out += leading;
      text = text.slice(leading.length);
    }
    for (const mark of marks.slice(keep)) {
      const form = linkForm(mark, nodes, index, v);
      const delimiter = opening(mark, form, v);
      out += delimiter;
      active.push({ mark, form, delimiter });
    }

    if (text === null) {
      out += serializeAtom(n);
    } else if (isCode) {
      const ticks = attr(n.marks!.find((m) => m.type === "code")!, "ticks", 1);
      out += codeSpan(text, ticks);
    } else {
      let body = escapeText(text, v.escape, escapes);
      if (active.some((a) => DELIMITED.has(a.mark.type))) {
        const trailing = /\s+$/.exec(body)?.[0] ?? "";
        if (trailing && trailing !== body) {
          body = body.slice(0, -trailing.length);
          pendingSpace = trailing;
        }
      }
      out += body;
    }
  });
  while (active.length > 0) {
    const entry = active.pop()!;
    if (!DELIMITED.has(entry.mark.type)) {
      out += pendingSpace;
      pendingSpace = "";
    }
    out += closing(entry);
  }
  out += pendingSpace;
  return v.escape > 0 ? escapeLineStarts(out) : out;
}

function linkForm(mark: PMMark, nodes: PMJSON[], index: number, v: Variant): LinkForm {
  if (mark.type !== "link") return "inline";
  const kind = attr<string>(mark, "kind", "inline");
  if (kind === "inline" || v.normalizeMarkers) return "inline";
  const run: PMJSON[] = [];
  for (let i = index; i < nodes.length && (nodes[i].marks ?? []).some((m) => sameMark(m, mark)); i++) run.push(nodes[i]);
  const plain = run.length === 1 && run[0].type === "text" && (run[0].marks ?? []).length === 1;
  return plain ? (kind as LinkForm) : "inline";
}

function opening(mark: PMMark, form: LinkForm, v: Variant): string {
  switch (mark.type) {
    case "bold":
      return v.normalizeMarkers ? "**" : attr(mark, "marker", "**");
    case "italic":
      return v.normalizeMarkers ? "*" : attr(mark, "marker", "*");
    case "strike":
      return "~~";
    case "highlight":
      return "==";
    case "link":
      return form === "inline" ? "[" : form === "autolink" ? "<" : "";
    default:
      return "";
  }
}

function closing({ mark, form, delimiter }: OpenMark): string {
  switch (mark.type) {
    case "link": {
      if (form === "autolink") return ">";
      if (form === "literal") return "";
      const title = attr<string | null>(mark, "title", null);
      const titlePart = title === null ? "" : ` "${title.replace(/"/g, '\\"')}"`;
      return `](${destination(attr(mark, "href", ""))}${titlePart})`;
    }
    default:
      // Emphasis-like delimiters close with exactly what opened them.
      return delimiter;
  }
}

function balancedParentheses(text: string): boolean {
  let depth = 0;
  for (const c of text) {
    if (c === "(") depth++;
    else if (c === ")" && --depth < 0) return false;
  }
  return depth === 0;
}

function destination(href: string): string {
  if (href === "") return "<>";
  return /[\s<>]/.test(href) || !balancedParentheses(href) ? `<${href.replace(/[<>]/g, (c) => `\\${c}`)}>` : href;
}

function serializeAtom(n: PMJSON): string {
  switch (n.type) {
    case "wikilink": {
      const alias = attr<string | null>(n, "alias", null);
      return `${attr(n, "embed", false) ? "!" : ""}[[${attr(n, "target", "")}${alias !== null ? `|${alias}` : ""}]]`;
    }
    case "image": {
      const raw = attr<string | null>(n, "raw", null);
      if (raw) return raw;
      const title = attr<string | null>(n, "title", null);
      return `![${attr(n, "alt", "")}](${destination(attr(n, "src", ""))}${title === null ? "" : ` "${title}"`})`;
    }
    case "inlineRaw":
      return attr(n, "source", "");
    case "hardBreak": {
      const raw = attr<string | null>(n, "raw", null);
      return raw ? (raw.endsWith("\n") ? raw : `${raw}\n`) : "\\\n";
    }
    case "softBreak":
      return `${attr(n, "trailing", "")}\n${attr(n, "leading", "")}`;
    default:
      throw new Error(`Cannot serialize inline node of type ${n.type}`);
  }
}

function codeSpan(text: string, preferredTicks: number): string {
  const runs = new Set((text.match(/`+/g) ?? []).map((r) => r.length));
  let ticks = Math.max(1, preferredTicks);
  while (runs.has(ticks)) ticks++;
  const fence = "`".repeat(ticks);
  const pad = /^`|`$/.test(text) || (/^ /.test(text) && / $/.test(text) && text.trim() !== "") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

const ALL_PUNCTUATION = /[\\`*_{}[\]()#+\-.!|<>~=%$]/g;

function escapeText(text: string, level: 0 | 1 | 2, escapes: string): string {
  if (level === 0) return escapes ? text.replace(new RegExp(`[${escapes.replace(/[\\\]^-]/g, "\\$&")}]`, "g"), "\\$&") : text;
  if (level === 2) return text.replace(ALL_PUNCTUATION, "\\$&");
  return text
    .replace(/\\(?=[!-/:-@[-`{-~])/g, "\\\\")
    .replace(/[`*[\]<$]/g, "\\$&")
    .replace(/(^|[^\p{L}\p{N}])_|_(?=$|[^\p{L}\p{N}])/gu, (m) => m.replace("_", "\\_"))
    .replace(/~~|==|%%/g, (m) => `\\${m}`);
}

/** Characters that would start a different block when found at the beginning of a line. */
function escapeLineStarts(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(/^([ \t]*)(#{1,6}(?=\s|$)|>|[-+*](?=\s|$)|=+(?=\s*$)|-+(?=\s*$)|`{3,}|~{3,})/, (_m, ws, token) => `${ws}\\${token}`)
        .replace(/^([ \t]*\d{1,9})([.)])(?=\s|$)/, "$1\\$2"),
    )
    .join("\n");
}
