import { TextSelection } from "@tiptap/pm/state";
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { destroyEditors, openEditor as open, press, type } from "./testUtils";
import { footnoteText } from "./views/inlineRaw";

afterEach(destroyEditors);

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("footnotes", () => {
  const NOTE = "Une phrase[^1] et une autre[^note].\n\n[^1]: La première note.\n[^note]: Une note\n    sur deux lignes.\n";

  it("shows calls as superscripts and texts as footnotes, written back unchanged", () => {
    const { editor, save } = open(NOTE);
    const calls = [...editor.view.dom.querySelectorAll<HTMLElement>("sup.footnote-ref")].map((s) => s.textContent);
    expect(calls).toEqual(["1", "note"]);
    const notes = [...editor.view.dom.querySelectorAll<HTMLElement>(".footnote-def")].map((d) => [d.dataset.label, d.querySelector(".footnote-text")?.textContent]);
    expect(notes).toEqual([
      ["1", "La première note."],
      ["note", "Une note\nsur deux lignes."],
    ]);
    expect(footnoteText(editor.state.doc, "note")).toBe("Une note\nsur deux lignes.");
    expect(save()).toBe(NOTE);
  });

  it("the slash item adds a call here and its text at the end", async () => {
    const { editor, save } = open("Texte[^1]\n\n[^1]: Déjà là.\n\nSuite");
    editor.commands.focus("end");
    type(editor, " /footnote");
    await settle();
    press(editor, "Enter");
    expect(save()).toBe("Texte[^1]\n\n[^1]: Déjà là.\n\nSuite [^2]\n\n[^2]: Texte de la note.");
  });

  it("a footnote on selected text keeps the text and takes the typed note", async () => {
    const { insertFootnote } = await import("./slash");
    const { editor, save } = open("Un mot ici\n");
    // "Un mot" selected, as from the format bar.
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 7)));
    insertFootnote(editor, { from: 7, to: 7 }, "Ma note\nsur une ligne");
    expect(save()).toBe("Un mot[^1] ici\n\n[^1]: Ma note sur une ligne\n");
  });
});

describe("query blocks", () => {
  it("the slash items write standard dataview and tasks blocks", async () => {
    const { editor, save } = open("");
    type(editor, "/tasks");
    await settle();
    press(editor, "Enter");
    expect(save()).toBe("```tasks\nnot done\ndue before in 7 days\nsort by due\n```\n");
    expect(editor.view.dom.querySelector(".code-block.is-query")).not.toBeNull();
  });
});

describe("embedded notes", () => {
  it("shows the embedded section, read from the vault, and keeps the link as written", async () => {
    const files = ["Note.md", "Projet.md"];
    const { editor, save } = open("Avant\n\n![[Projet#Plan]]\n", {
      files,
      readNote: async () => "# Projet\n\nIntro\n\n## Plan\n\nÉtape 1 ^a\n\n## Fin\n",
    });
    // The view loads the embed (and the note editor) asynchronously.
    for (let i = 0; i < 20 && !editor.view.dom.querySelector(".embed-note-body .ProseMirror"); i++) await new Promise((r) => setTimeout(r, 25));
    const embed = editor.view.dom.querySelector(".embed-note");
    expect(embed?.querySelector(".embed-note-title")?.textContent).toBe("Projet › Plan");
    expect(embed?.querySelector(".embed-note-body")?.textContent).toContain("Étape 1");
    expect(embed?.querySelector(".embed-note-body")?.textContent).not.toContain("^a");
    expect(embed?.querySelector(".embed-note-body")?.textContent).not.toContain("Fin");
    expect(save()).toBe("Avant\n\n![[Projet#Plan]]\n");
  });
});
