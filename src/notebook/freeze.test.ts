// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { destroyEditors, openEditor } from "../editor/testUtils";
import { frozenMarkdown, frozenRange, setFrozen } from "./freeze";
import type { TableData } from "./runtime";

afterEach(destroyEditors);

const table = (rows: unknown[][], total = rows.length): TableData => ({ columns: [{ name: "nom", dtype: "String" }, { name: "n", dtype: "Int64" }], rows, total, offset: 0 });

const NOTEBOOK = "---\nmarimo-version: 0.25.1\n---\n\nIntro  \n\n```python {.marimo}\ndf\n```\n\nSuite du texte.\n";
const cellPos = (editor: ReturnType<typeof openEditor>["editor"]) => {
  let found = -1;
  editor.state.doc.descendants((node, pos) => (node.type.name === "codeBlock" && found < 0 ? ((found = pos), false) : true));
  return found;
};

describe("frozen tables", () => {
  it("writes a Markdown table that escapes pipes and truncates with the total", () => {
    expect(frozenMarkdown(table([["Ana|B", 2], [null, 3]]), 50)).toBe(
      "<!-- flownote:frozen -->\n\n| nom | n |\n| --- | --- |\n| Ana\\|B | 2 |\n|  | 3 |\n\n<!-- /flownote:frozen -->",
    );
    expect(frozenMarkdown(table([["a", 1], ["b", 2], ["c", 3]], 1234), 2)).toContain("*Tableau tronqué : 2 lignes sur 1 234.*");
  });

  it("figer, re-figer and défiger produce exactly the expected file", () => {
    const { editor, save } = openEditor(NOTEBOOK, { notebook: true });
    setFrozen(editor, cellPos(editor), frozenMarkdown(table([["Ana", 2]]), 50));
    const frozen = "---\nmarimo-version: 0.25.1\n---\n\nIntro  \n\n```python {.marimo}\ndf\n```\n\n<!-- flownote:frozen -->\n\n| nom | n |\n| --- | --- |\n| Ana | 2 |\n\n<!-- /flownote:frozen -->\n\nSuite du texte.\n";
    expect(save()).toBe(frozen);
    expect(frozenRange(editor.state.doc, cellPos(editor))).not.toBeNull();

    setFrozen(editor, cellPos(editor), frozenMarkdown(table([["Bo", 5], ["Cy", 6]], 3), 2));
    expect(save()).toBe(frozen.replace("| Ana | 2 |\n", "| Bo | 5 |\n| Cy | 6 |\n\n*Tableau tronqué : 2 lignes sur 3.*\n"));

    setFrozen(editor, cellPos(editor), null);
    expect(save()).toBe(NOTEBOOK);
  });

  it("a frozen block already in the file is found and replaced in place", () => {
    const withFrozen = "```python {.marimo}\ndf\n```\n\n<!-- flownote:frozen -->\n\n| a |\n| --- |\n| 1 |\n\n<!-- /flownote:frozen -->\n\nFin\n";
    const { editor, save } = openEditor(withFrozen, { notebook: true });
    expect(save()).toBe(withFrozen);
    setFrozen(editor, cellPos(editor), frozenMarkdown({ columns: [{ name: "a", dtype: "Int64" }], rows: [[2]], total: 1, offset: 0 }, 50));
    expect(save()).toBe(withFrozen.replace("| 1 |", "| 2 |"));
  });
});
