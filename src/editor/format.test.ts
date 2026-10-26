// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/core";
import { clearFormatting, highlightAt, setHighlight, toggleUnderline } from "./format";
import { filterLanguages } from "./codeLanguages";
import { openSlashMenu } from "./slash";
import { destroyEditors, openEditor as open, press, type } from "./testUtils";

afterEach(destroyEditors);

function select(editor: Editor, text: string) {
  let from = -1;
  editor.state.doc.descendants((node, pos) => {
    if (from < 0 && node.isText && node.text!.includes(text)) from = pos + node.text!.indexOf(text);
    return from < 0;
  });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, from + text.length)));
}

describe("selection toolbar commands", () => {
  it("underline is written as <u>, and removed again", () => {
    const { editor, save } = open("un mot ici\n");
    select(editor, "mot");
    toggleUnderline(editor);
    expect(save()).toBe("un <u>mot</u> ici\n");
    select(editor, "mot");
    toggleUnderline(editor);
    expect(save()).toBe("un mot ici\n");
  });

  it("a highlight changes colour from the cursor, like in Bear", () => {
    const { editor, save } = open("je ==test== du fluo\n");
    select(editor, "es");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, editor.state.selection.from)));
    expect(highlightAt(editor.state)?.color).toBe(null);
    setHighlight(editor, "green");
    expect(save()).toBe("je ==🟢test== du fluo\n");
    setHighlight(editor, null);
    expect(save()).toBe("je ==test== du fluo\n");
  });

  it("the eraser removes formatting but keeps links", () => {
    const { editor, save } = open("**gras** et [lien](https://a.fr)\n");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, editor.state.doc.content.size - 1)));
    clearFormatting(editor);
    expect(save()).toBe("gras et [lien](https://a.fr)\n");
  });
});

describe("code languages", () => {
  it("names starting with the query come first", () => {
    expect(filterLanguages("py").map((l) => l.language).slice(0, 2)).toEqual(["py", "python"]);
  });

  it("```py offers languages; a choice makes a code block", async () => {
    const { editor, save } = open();
    type(editor, "```pyth");
    await new Promise((resolve) => setTimeout(resolve));
    press(editor, "Enter");
    type(editor, "print(1)");
    expect(save()).toBe("```python\nprint(1)\n```\n");
  });
});

describe("the + button's slash", () => {
  it("goes away when the menu closes unused", async () => {
    const { editor, save } = open("Texte\n");
    // The + button puts the cursor in an empty block first.
    press(editor, "Enter");
    const before = save();
    openSlashMenu(editor);
    expect(save()).not.toBe(before);
    await new Promise((resolve) => setTimeout(resolve));
    press(editor, "Escape");
    await new Promise((resolve) => setTimeout(resolve));
    expect(save()).toBe(before);
  });

  it("goes away when another + is clicked, even after a change elsewhere", async () => {
    const { editor, save } = open("Un\n\nDeux\n");
    editor.commands.setTextSelection(3);
    press(editor, "Enter");
    openSlashMenu(editor);
    await new Promise((resolve) => setTimeout(resolve));
    // A change elsewhere, then the + of an empty line at the end.
    const end = editor.state.doc.content.size;
    editor.view.dispatch(editor.state.tr.insert(end, editor.schema.nodes.paragraph.create()));
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    openSlashMenu(editor);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(save()).toBe("Un\n\nDeux\n\n/\n");
    press(editor, "Escape");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(save()).toBe("Un\n\nDeux\n");
  });

  it("goes away when the note loses the focus (a click outside it)", async () => {
    const { editor, save } = open("Texte\n");
    press(editor, "Enter");
    const before = save();
    openSlashMenu(editor);
    await new Promise((resolve) => setTimeout(resolve));
    editor.view.dom.dispatchEvent(new FocusEvent("blur"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(save()).toBe(before);
  });
});

describe("HTML typed in a note", () => {
  it("becomes HTML when the cursor leaves its paragraph", () => {
    const { editor, save } = open();
    type(editor, "<h3>Thailand</h3>");
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
    press(editor, "Enter");
    type(editor, "Du <u>souligné</u> ici");
    press(editor, "Enter");
    expect(editor.state.doc.firstChild?.type.name).toBe("rawBlock");
    expect(save()).toBe("<h3>Thailand</h3>\n\nDu <u>souligné</u> ici\n");
    expect(editor.state.doc.child(1).content.toJSON()?.some((n: { marks?: { type: string }[] }) => n.marks?.some((m) => m.type === "inlineHtml"))).toBe(true);
  });
});
