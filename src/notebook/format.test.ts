import { describe, expect, it } from "vitest";
import { cellInfo, isCellInfo, isNotebookMarkdown, newNotebookFile, setCellAttribute } from "./format";
import { loadMarkdown, NoteSession } from "../markdown/note";
import { schema } from "../editor/schema";

/** A notebook as marimo writes it (frontmatter, text, Python and SQL cells, separators). */
const MARIMO_NOTEBOOK = `---
title: Ventes
marimo-version: 0.25.1
pyproject: |-
  requires-python = ">=3.12"
  dependencies = [
      "polars",
      "duckdb==1.2.2",
  ]
---

# Ventes

Un paragraphe.
<!---->
Un autre bloc de texte.

\`\`\`python {.marimo}
import polars as pl
ventes = pl.DataFrame({"mois": [1, 2], "montant": [10, 20]})
\`\`\`

\`\`\`sql {.marimo query="par_mois" hide_output="True"}
SELECT mois, sum(montant) AS total FROM ventes GROUP BY mois
\`\`\`

\`\`\`python {.marimo hide_code="true"}
import marimo as mo
\`\`\`
`;

function roundTrip(markdown: string): string {
  const { doc, layout } = loadMarkdown(markdown);
  const node = schema.nodeFromJSON(doc);
  return new NoteSession(layout, node).serialize(node);
}

describe("notebook format (marimo Markdown)", () => {
  it("a page is a notebook only with marimo-version in its front matter", () => {
    expect(isNotebookMarkdown(MARIMO_NOTEBOOK)).toBe(true);
    expect(isNotebookMarkdown("---\ntags: [x]\n---\n```python {.marimo}\nx\n```\n")).toBe(false);
    expect(isNotebookMarkdown("# Note\n\nmarimo-version: 0.25.1\n")).toBe(false);
    expect(isNotebookMarkdown("﻿---\r\nmarimo-version: 0.25.1\r\n---\r\n")).toBe(true);
  });

  it("recognises cells like marimo does, with their attributes", () => {
    expect(isCellInfo("python", "{.marimo}")).toBe(true);
    expect(isCellInfo("sql", '{.marimo query="df"}')).toBe(true);
    expect(isCellInfo("python", "")).toBe(false);
    expect(isCellInfo("", "{.python.marimo}")).toBe(true);
    expect(cellInfo("sql", '{.marimo query="par_mois" hide_output="True"}')).toMatchObject({ language: "sql", query: "par_mois" });
    expect(cellInfo("python", '{.marimo hide_code="true"}')).toMatchObject({ language: "python", hideCode: true, query: "_df" });
  });

  it("edits one attribute of a cell, keeping the others", () => {
    expect(setCellAttribute('{.marimo hide_output="True"}', "query", "res")).toBe('{.marimo hide_output="True" query="res"}');
    expect(setCellAttribute('{.marimo query="a"}', "query", "b")).toBe('{.marimo query="b"}');
    expect(setCellAttribute('{.marimo query="a"}', "query", null)).toBe("{.marimo}");
  });

  it("a notebook written by marimo is saved back byte for byte", () => {
    expect(roundTrip(MARIMO_NOTEBOOK)).toBe(MARIMO_NOTEBOOK);
    expect(roundTrip(MARIMO_NOTEBOOK.replace(/\n/g, "\r\n"))).toBe(MARIMO_NOTEBOOK.replace(/\n/g, "\r\n"));
  });

  it("a new notebook is a marimo notebook and round-trips", () => {
    const file = newNotebookFile();
    expect(isNotebookMarkdown(file)).toBe(true);
    expect(file).toContain("marimo-version: 0.25.1");
    expect(file).toContain('```python {.marimo hide_code="true"}\nimport marimo as mo\n```');
    expect(roundTrip(file)).toBe(file);
  });
});
