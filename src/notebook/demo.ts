import { newNotebookFile } from "./format";

/** A small notebook for the demo vault. */
export function demoNotebook(): string {
  return newNotebookFile().replace(
    "```python {.marimo}\n\n```",
    [
      "Un notebook mêle texte et cellules de code. Exécutez une cellule avec ▶ ou ⌘↵ (dans l'application de bureau).",
      "",
      "```python {.marimo}",
      "ventes = [120, 340, 90]",
      "print(sum(ventes))",
      "```",
      "",
      '```sql {.marimo query="total"}',
      "SELECT 42 AS reponse",
      "```",
    ].join("\n"),
  );
}
