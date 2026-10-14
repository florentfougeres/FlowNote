/**
 * Notebook pages: Markdown notes in marimo's Markdown format, so `marimo edit`
 * opens the same file (see marimo/_tutorials/markdown_format.md, marimo 0.25):
 *
 *   ---
 *   title: Analyse
 *   marimo-version: 0.25.1      ← marks the page as a notebook (marimo's own marker)
 *   ---
 *   Text…
 *   ```python {.marimo}         ← an executable cell
 *   ```sql {.marimo query="df"} ← SQL cell, result assigned to `df`
 *
 * Cells stay ordinary fenced code blocks in the document (language + info
 * string), so unchanged notebooks are written back byte for byte.
 */

/** marimo version written in new notebooks. */
export const MARIMO_VERSION = "0.25.1";

export type CellLanguage = "python" | "sql";

/** True when the front matter holds `marimo-version` (the only notebook marker, by choice). */
export function isNotebookMarkdown(markdown: string): boolean {
  const text = markdown.replace(/^﻿/, "");
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  return match !== null && /^marimo-version[ \t]*:/m.test(match[1]);
}

/**
 * A code block is a marimo cell when its opening line has `python`, `sql` or
 * `marimo` inside braces (marimo's own rule): ```python {.marimo}.
 */
export function isCellInfo(language: string, meta: string): boolean {
  const braces = /\{([^}]*)\}/.exec(`${language} ${meta}`);
  return braces !== null && /python|sql|marimo/.test(braces[1]);
}

export function cellLanguage(language: string, meta: string): CellLanguage {
  if (language === "sql") return "sql";
  if (language === "python") return "python";
  return /(?:^|[.\s])sql(?:[.\s]|$)/.test(/\{([^}]*)\}/.exec(meta)?.[1] ?? "") ? "sql" : "python";
}

/** Attributes of a cell: `{.marimo query="df" hide_code="true"}` → { query: "df", hide_code: "true" }. */
export function cellAttributes(meta: string): Record<string, string> {
  const inner = /\{([^}]*)\}/.exec(meta)?.[1] ?? "";
  const attributes: Record<string, string> = {};
  for (const [, key, value] of inner.matchAll(/(\w+)="([^"]*)"/g)) attributes[key] = value;
  return attributes;
}

const truthy = (value: string | undefined) => value?.toLowerCase() === "true";

export interface CellInfo {
  language: CellLanguage;
  /** Variable receiving a SQL result (marimo's `query`, "_df" when absent). */
  query: string;
  hideCode: boolean;
  disabled: boolean;
  name: string | null;
}

export function cellInfo(language: string, meta: string): CellInfo {
  const attributes = cellAttributes(meta);
  return {
    language: cellLanguage(language, meta),
    query: attributes.query || "_df",
    hideCode: truthy(attributes.hide_code),
    disabled: truthy(attributes.disabled),
    name: attributes.name ?? null,
  };
}

/** Info string of a new cell. */
export function newCellMeta(): string {
  return "{.marimo}";
}

/** Sets (or removes, with null) one attribute of a cell's info string, keeping the others in place. */
export function setCellAttribute(meta: string, key: string, value: string | null): string {
  const match = /\{([^}]*)\}/.exec(meta);
  const inner = match ? match[1] : ".marimo";
  const pattern = new RegExp(`\\s*\\b${key}="[^"]*"`);
  let next = inner.replace(pattern, "");
  if (value !== null) next = `${next} ${key}="${value.replace(/"/g, "&quot;")}"`;
  const braces = `{${next.trim()}}`;
  return match ? meta.replace(match[0], braces) : braces;
}

/**
 * A new notebook: the marimo marker, one empty Python cell and marimo's
 * (hidden) import cell. No `title`: marimo takes it from the file name, like
 * FlowNote, so renaming the page keeps both in step.
 */
export function newNotebookFile(): string {
  return [
    "---",
    `marimo-version: ${MARIMO_VERSION}`,
    "---",
    "",
    "```python {.marimo}",
    "",
    "```",
    "",
    // marimo renders text cells with `mo.md`: they need this cell (FlowNote shows it folded).
    '```python {.marimo hide_code="true"}',
    "import marimo as mo",
    "```",
    "",
  ].join("\n");
}
