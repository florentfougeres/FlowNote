// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { editorExtensions } from "./extensions";
import { loadMarkdown, NoteSession } from "../markdown/note";

let editors: Editor[] = [];
afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
});

/** Opens Markdown in a real editor; the cursor is placed at the end of the document. */
function open(markdown = "") {
  const { doc, layout } = loadMarkdown(markdown);
  const editor = new Editor({ extensions: editorExtensions(), content: doc });
  editors.push(editor);
  const session = new NoteSession(layout, editor.state.doc);
  editor.commands.focus("end");
  return { editor, save: () => session.serialize(editor.state.doc) };
}

/** Types text character by character, going through input rules like a keyboard would. */
function type(editor: Editor, text: string) {
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const insert = () => editor.state.tr.insertText(char, from, to);
    const handled = editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, char, insert));
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(char, from, to));
  }
}

function press(editor: Editor, key: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers });
  const handled = editor.view.someProp("handleKeyDown", (f) => f(editor.view, event));
  if (!handled) throw new Error(`key not handled: ${key}`);
}

function cursorAtStartOf(editor: Editor, text: string) {
  let pos = -1;
  editor.state.doc.descendants((node, p) => {
    if (pos < 0 && node.isText && node.text!.startsWith(text)) pos = p;
    return pos < 0;
  });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
}

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
