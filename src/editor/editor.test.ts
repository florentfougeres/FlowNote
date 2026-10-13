// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cursorAtStartOf, destroyEditors, openEditor as open, press, type } from "./testUtils";

afterEach(destroyEditors);

describe("Markdown shortcuts", () => {
  it("headings", () => {
    const { editor, save } = open();
    type(editor, "## Titre");
    expect(save()).toBe("## Titre\n");
  });

  it("bullet lists keep the typed bullet", () => {
    const { editor, save } = open();
    type(editor, "* un");
    press(editor, "Enter");
    type(editor, "deux");
    expect(save()).toBe("* un\n* deux\n");
  });

  it("ordered lists", () => {
    const { editor, save } = open();
    type(editor, "1. un");
    press(editor, "Enter");
    type(editor, "deux");
    expect(save()).toBe("1. un\n2. deux\n");
  });

  it("tasks, and Enter creates an unchecked task", () => {
    const { editor, save } = open();
    type(editor, "[x] fait");
    press(editor, "Enter");
    type(editor, "à faire");
    expect(save()).toBe("- [x] fait\n- [ ] à faire\n");
  });

  it("`- [ ] ` typed in one go", () => {
    const { editor, save } = open();
    type(editor, "- [ ] tâche");
    expect(save()).toBe("- [ ] tâche\n");
  });

  it("inline marks keep the typed delimiters", () => {
    const { editor, save } = open();
    type(editor, "du **gras** et __gras__, de l'*italique* et _italique_, ~~barré~~ ==fort== `code` fin");
    expect(save()).toBe("du **gras** et __gras__, de l'*italique* et _italique_, ~~barré~~ ==fort== `code` fin\n");
  });

  it("quotes and callouts", () => {
    const { editor, save } = open();
    type(editor, "> [!tip]- Astuce");
    press(editor, "Enter");
    type(editor, "Contenu");
    expect(save()).toBe("> [!tip]- Astuce\n> Contenu\n");
  });

  it("dividers", () => {
    const { editor, save } = open("Avant\n");
    press(editor, "Enter");
    type(editor, "---");
    type(editor, "Après");
    expect(save()).toBe("Avant\n\n---\n\nAprès\n");
  });

  it("code blocks", () => {
    const { editor, save } = open();
    type(editor, "```ts ");
    type(editor, "const x = 1;");
    expect(save()).toBe("```ts\nconst x = 1;\n```\n");
  });
});

describe("block keyboard behaviour", () => {
  it("Enter on an empty list item leaves the list", () => {
    const { editor, save } = open("- un\n");
    press(editor, "Enter");
    press(editor, "Enter");
    type(editor, "texte");
    expect(save()).toBe("- un\n\ntexte\n");
  });

  it("Backspace at the start of a heading turns it into text", () => {
    const { editor, save } = open("## Titre\n");
    cursorAtStartOf(editor, "Titre");
    press(editor, "Backspace");
    expect(save()).toBe("Titre\n");
  });

  it("Backspace at the start of a list item turns it into text", () => {
    const { editor, save } = open("- un\n- deux\n");
    cursorAtStartOf(editor, "deux");
    press(editor, "Backspace");
    expect(save()).toBe("- un\n\ndeux\n");
  });

  it("Tab nests a list item and Shift-Tab brings it back", () => {
    const { editor, save } = open("- un\n- deux\n");
    cursorAtStartOf(editor, "deux");
    press(editor, "Tab");
    expect(save()).toBe("- un\n  - deux\n");
    press(editor, "Tab", { shiftKey: true });
    expect(save()).toBe("- un\n- deux\n");
  });

  it("Mod-Enter toggles a task", () => {
    const { editor, save } = open("- [ ] tâche\n");
    press(editor, "Enter", { ctrlKey: true });
    expect(save()).toBe("- [x] tâche\n");
  });

  it("Enter in a callout title starts its body", () => {
    const { editor, save } = open("> [!note] Titre\n> Corps\n");
    cursorAtStartOf(editor, "Titre");
    editor.commands.setTextSelection(editor.state.selection.from + "Titre".length);
    press(editor, "Enter");
    type(editor, "Nouveau");
    expect(save()).toBe("> [!note] Titre\n> Nouveau\n>\n> Corps\n");
  });

  it("untouched blocks stay byte-identical while editing elsewhere", () => {
    const src = "# Titre   \n\n* liste  à  espaces\n*   bizarre\n\nTexte\n";
    const { editor, save } = open(src);
    type(editor, " ajouté");
    expect(save()).toBe("# Titre   \n\n* liste  à  espaces\n*   bizarre\n\nTexte ajouté\n");
  });
});
