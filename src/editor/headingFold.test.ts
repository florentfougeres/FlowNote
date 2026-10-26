// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { Node as PMNode } from "@tiptap/pm/model";
import { toggleFold } from "./headingFold";
import { cursorAtStartOf, destroyEditors, openEditor, type } from "./testUtils";

afterEach(destroyEditors);

const NOTE = "# Titre\n\n## Plan\n\nÉtape un\n\n### Détail\n\nTexte\n\n## Budget\n\nChiffres\n";

const hidden = (dom: HTMLElement) => [...dom.querySelectorAll(".fold-hidden")].map((el) => el.textContent);
const arrows = (dom: HTMLElement) => [...dom.querySelectorAll(".foldable")].map((el) => el.textContent);
const headingPos = (doc: PMNode, text: string) => {
  let at = -1;
  doc.forEach((node, pos) => {
    if (node.textContent === text) at = pos;
  });
  return at;
};

describe("foldable headings", () => {
  it("offers an arrow on headings with a section, not on the page title", () => {
    const { editor } = openEditor(NOTE);
    expect(arrows(editor.view.dom)).toEqual(["Plan", "Détail", "Budget"]);
  });

  it("hides the section down to the next heading of the same level, leaving the file alone", () => {
    const { editor, save } = openEditor(NOTE);
    editor.view.dispatch(toggleFold(editor.state, headingPos(editor.state.doc, "Plan")));
    expect(hidden(editor.view.dom)).toEqual(["Étape un", "Détail", "Texte"]);
    cursorAtStartOf(editor, "Chiffres");
    type(editor, "Les ");
    expect(hidden(editor.view.dom)).toEqual(["Étape un", "Détail", "Texte"]);
    expect(save()).toBe(NOTE.replace("Chiffres", "Les Chiffres"));
    editor.view.dispatch(toggleFold(editor.state, headingPos(editor.state.doc, "Plan")));
    expect(hidden(editor.view.dom)).toEqual([]);
  });

  it("unfolds a section the cursor moves into", () => {
    const { editor } = openEditor(NOTE);
    editor.view.dispatch(toggleFold(editor.state, headingPos(editor.state.doc, "Plan")));
    cursorAtStartOf(editor, "Texte");
    expect(hidden(editor.view.dom)).toEqual([]);
  });
});
