import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isCellInfo, isNotebookMarkdown, newNotebookFile } from "./format";
import { loadMarkdown, NoteSession } from "../markdown/note";
import { schema } from "../editor/schema";
import { MARIMO_VERSION } from "./format";

/**
 * Compatibility with the real marimo (run through uvx). Skipped when uv is
 * not installed; the first run downloads marimo.
 */
const uvAvailable = (() => {
  try {
    execFileSync("uv", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const marimo = (args: string[], cwd: string) =>
  execFileSync("uvx", ["--from", `marimo==${MARIMO_VERSION}`, "marimo", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 240_000 });

function cellsOf(markdown: string): { language: string; meta: string; text: string }[] {
  const { doc } = loadMarkdown(markdown);
  const cells: { language: string; meta: string; text: string }[] = [];
  schema.nodeFromJSON(doc).descendants((node) => {
    if (node.type.name === "codeBlock" && isCellInfo(node.attrs.language, node.attrs.meta)) cells.push({ language: node.attrs.language, meta: node.attrs.meta, text: node.textContent });
    return true;
  });
  return cells;
}

describe.skipIf(!uvAvailable)("compatibility with marimo", () => {
  it("a notebook created in FlowNote opens in marimo", () => {
    const dir = mkdtempSync(join(tmpdir(), "flownote-marimo-"));
    const file = newNotebookFile().replace(
      "```python {.marimo}\n\n```",
      '```python {.marimo}\nventes = [1, 2, 3]\n```\n\n```sql {.marimo query="total"}\nSELECT 42 AS reponse\n```',
    );
    writeFileSync(join(dir, "ventes.md"), file);
    marimo(["convert", "ventes.md", "-o", "ventes.py"], dir);
    const py = readFileSync(join(dir, "ventes.py"), "utf8");
    expect(py).toContain("ventes = [1, 2, 3]");
    expect(py).toMatch(/total = mo\.sql\(\s*f"""\s*SELECT 42 AS reponse/);
    expect(py).toContain("import marimo as mo");
  }, 300_000);

  it("a notebook written by marimo opens in FlowNote and is saved back unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "flownote-marimo-"));
    writeFileSync(
      join(dir, "analyse.py"),
      [
        "import marimo",
        "app = marimo.App()",
        "",
        "@app.cell",
        "def _():",
        "    import marimo as mo",
        "    return (mo,)",
        "",
        "@app.cell",
        "def _(mo):",
        '    mo.md("# Analyse\\n\\nDu texte.")',
        "    return",
        "",
        "@app.cell",
        "def _():",
        "    x = 21 * 2",
        "    return (x,)",
        "",
        "@app.cell",
        "def _(mo):",
        '    res = mo.sql(f"""SELECT 1 AS un""")',
        "    return (res,)",
        "",
        'if __name__ == "__main__":',
        "    app.run()",
        "",
      ].join("\n"),
    );
    marimo(["export", "md", "analyse.py", "-o", "analyse.md"], dir);
    const markdown = readFileSync(join(dir, "analyse.md"), "utf8");
    expect(isNotebookMarkdown(markdown)).toBe(true);
    const cells = cellsOf(markdown);
    expect(cells.map((c) => c.text)).toEqual(expect.arrayContaining(["x = 21 * 2", "SELECT 1 AS un"]));
    expect(cells.find((c) => c.text === "SELECT 1 AS un")?.meta).toContain('query="res"');
    const { doc, layout } = loadMarkdown(markdown);
    const node = schema.nodeFromJSON(doc);
    expect(new NoteSession(layout, node).serialize(node)).toBe(markdown);
  }, 300_000);
});
