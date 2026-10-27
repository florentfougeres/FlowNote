// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { Node as PMNode } from "@tiptap/pm/model";
import { moveSection } from "./sections";
import { destroyEditors, openEditor } from "./testUtils";

afterEach(destroyEditors);

const NOTE = "# Titre\n\nIntro\n\n## Plan\n\nÉtape **un**\n\n### Détail\n\nTexte\n\n## Budget\n\n- Chiffres\n";

const headingPos = (doc: PMNode, text: string) => {
  let at = -1;
  doc.forEach((node, pos) => {
    if (node.type.name === "heading" && node.textContent === text) at = pos;
  });
  return at;
};

describe("moving a section", () => {
  it("moves a heading with everything under it, sub-headings included, and keeps the blocks as written", () => {
    const { editor, save } = openEditor(NOTE);
    const { doc } = editor.state;
    editor.view.dispatch(moveSection(editor.state, headingPos(doc, "Plan"), doc.content.size)!);
    expect(save()).toBe("# Titre\n\nIntro\n\n## Budget\n\n- Chiffres\n\n## Plan\n\nÉtape **un**\n\n### Détail\n\nTexte\n");
    expect(editor.state.selection.$from.parent.textContent).toBe("Plan");
  });

  it("moves a section before another heading", () => {
    const { editor, save } = openEditor(NOTE);
    const { doc } = editor.state;
    editor.view.dispatch(moveSection(editor.state, headingPos(doc, "Budget"), headingPos(doc, "Plan"))!);
    expect(save()).toBe("# Titre\n\nIntro\n\n## Budget\n\n- Chiffres\n\n## Plan\n\nÉtape **un**\n\n### Détail\n\nTexte\n");
  });

  it("refuses the title, a target inside the section, and a place above the title", () => {
    const { editor } = openEditor(NOTE);
    const { doc } = editor.state;
    expect(moveSection(editor.state, headingPos(doc, "Titre"), doc.content.size)).toBeNull();
    expect(moveSection(editor.state, headingPos(doc, "Plan"), headingPos(doc, "Détail"))).toBeNull();
    expect(moveSection(editor.state, headingPos(doc, "Plan"), headingPos(doc, "Budget"))).toBeNull();
    expect(moveSection(editor.state, headingPos(doc, "Budget"), 0)).toBeNull();
  });
});
