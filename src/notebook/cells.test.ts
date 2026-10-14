// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { destroyEditors, openEditor, press, type } from "../editor/testUtils";

afterEach(destroyEditors);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("notebook cells in the editor", () => {
  it("the slash menu inserts Python and SQL cells, only in notebooks", async () => {
    const { editor, slash, save } = openEditor("", { notebook: true });
    type(editor, "/python");
    await tick();
    expect(slash.state?.items[0].title).toBe("Cellule Python");
    press(editor, "Enter");
    type(editor, "x = 1");
    expect(save()).toBe("```python {.marimo}\nx = 1\n```\n");

    const sql = openEditor("", { notebook: true });
    type(sql.editor, "/sql");
    await tick();
    press(sql.editor, "Enter");
    type(sql.editor, "SELECT 1");
    expect(sql.save()).toBe("```sql {.marimo}\nSELECT 1\n```\n");

    const note = openEditor("");
    type(note.editor, "/cellule");
    await tick();
    expect(note.slash.state?.items.some((i) => i.title.startsWith("Cellule")) ?? false).toBe(false);
  });

  it("cells are shown as cells in notebooks, as code blocks elsewhere", () => {
    const markdown = '```python {.marimo}\nx = 1\n```\n\n```python\nprint(x)\n```\n\n```sql {.marimo query="res"}\nSELECT 1\n```\n';
    const { editor } = openEditor(markdown, { notebook: true });
    const cells = [...editor.view.dom.querySelectorAll<HTMLElement>(".notebook-cell")];
    expect(cells.map((c) => c.dataset.language)).toEqual(["python", "sql"]);
    expect(editor.view.dom.querySelectorAll(".code-block")).toHaveLength(1);
    expect(cells[1].querySelector<HTMLInputElement>(".cell-query input")?.value).toBe("res");
    const { editor: plain } = openEditor(markdown);
    expect(plain.view.dom.querySelectorAll(".notebook-cell")).toHaveLength(0);
  });

  it("renaming the SQL result variable edits only the info string", () => {
    const { editor, save } = openEditor('Texte  \n\n```sql {.marimo query="res"}\nSELECT 1\n```\n', { notebook: true });
    const input = editor.view.dom.querySelector<HTMLInputElement>(".cell-query input")!;
    input.value = "ventes";
    input.dispatchEvent(new Event("change"));
    expect(save()).toBe('Texte  \n\n```sql {.marimo query="ventes"}\nSELECT 1\n```\n');
    input.value = "pas valide!";
    input.dispatchEvent(new Event("change"));
    expect(save()).toContain('query="ventes"');
  });

  it("hidden-code cells are folded", () => {
    const { editor } = openEditor('```python {.marimo hide_code="true"}\nimport marimo as mo\n```\n', { notebook: true });
    const cell = editor.view.dom.querySelector(".notebook-cell")!;
    expect(cell.classList.contains("folded")).toBe(true);
    expect(cell.querySelector(".cell-fold")?.textContent).toContain("import marimo as mo");
  });
});
