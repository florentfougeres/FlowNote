// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { TextSelection } from "@tiptap/pm/state";
import { cursorAtStartOf, destroyEditors, openEditor as open, press, type } from "./testUtils";
import { linkTarget } from "./LinkPrompt";
import { codeFromPreceding } from "./backticks";
import { markdownForClipboard } from "./clipboard";

afterEach(destroyEditors);

const select = (editor: ReturnType<typeof open>["editor"], from: number, to = from) =>
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)));

/** Puts the cursor at the start of the last block, after emptying it when asked. */
function startOfLast(editor: ReturnType<typeof open>["editor"], empty = false) {
  const last = editor.state.doc.lastChild!;
  const start = editor.state.doc.content.size - last.nodeSize + 1;
  if (empty) editor.view.dispatch(editor.state.tr.delete(start, start + last.content.size));
  select(editor, start);
}

describe("Backspace at the start of a line goes up to the line above", () => {
  it.each([
    ["a list", "- un\n- deux", "- un\n- deuxfin\n", "- un\n- deux\n"],
    ["a task list", "- [ ] tâche", "- [ ] tâchefin\n", "- [ ] tâche\n"],
    ["a quote", "> cité", "> citéfin\n", "> cité\n"],
    ["a callout", "> [!note] T\n> corps", "> [!note] T\n> corpsfin\n", "> [!note] T\n> corps\n"],
    ["a paragraph", "Avant", "Avantfin\n", "Avant\n"],
  ])("under %s", (_name, above, withText, emptyLine) => {
    const first = open(`${above}\n\nfin\n`);
    startOfLast(first.editor);
    press(first.editor, "Backspace");
    expect(first.save()).toBe(withText);

    const second = open(`${above}\n\nfin\n`);
    startOfLast(second.editor, true);
    press(second.editor, "Backspace");
    expect(second.save()).toBe(emptyLine);
  });

  it("under a table, the cursor goes to the last cell", () => {
    const { editor, save } = open("| a | b |\n| - | - |\n| c | d |\n\nfin\n");
    startOfLast(editor);
    press(editor, "Backspace");
    type(editor, "!");
    expect(save()).toBe("| a | b |\n| - | - |\n| c | d! |\n\nfin\n");
  });

  it("under a divider, the divider is selected, not deleted", () => {
    const { editor, save } = open("---\n\nfin\n");
    startOfLast(editor);
    press(editor, "Backspace");
    expect(save()).toBe("---\n\nfin\n");
    expect(editor.state.selection.constructor.name).toBe("NodeSelection");
  });
});

describe("Line breaks left at the edge of a block", () => {
  it("a block emptied around a hard break leaves no backslash", () => {
    const { editor, save } = open("a\\\nb\n\nfin\n");
    cursorAtStartOf(editor, "a");
    const at = editor.state.selection.from;
    editor.view.dispatch(editor.state.tr.delete(at, at + 1));
    expect(save()).toBe("b\n\nfin\n");
    cursorAtStartOf(editor, "b");
    const again = editor.state.selection.from;
    editor.view.dispatch(editor.state.tr.delete(again, again + 1));
    expect(save()).toBe("fin\n");
  });

  it("a trailing hard break is dropped", () => {
    const { editor, save } = open("a\\\nb\n");
    cursorAtStartOf(editor, "b");
    const at = editor.state.selection.from;
    editor.view.dispatch(editor.state.tr.delete(at, at + 1));
    expect(save()).toBe("a\n");
  });
});

describe("Backticks", () => {
  it("typed over a selection make it code", () => {
    const { editor, save } = open("abc def ghi\n");
    select(editor, 5, 8);
    type(editor, "`");
    type(editor, "!");
    expect(save()).toBe("abc `def`! ghi\n");
  });

  it("typed before text already followed by a backtick", () => {
    const { editor, save } = open("abc def ghi\n");
    select(editor, 8);
    type(editor, "`");
    select(editor, 5);
    type(editor, "`");
    expect(save()).toBe("abc `def` ghi\n");
  });

  it("typed around existing text", () => {
    const { editor, save } = open("abc def ghi\n");
    select(editor, 5);
    type(editor, "`");
    select(editor, 9);
    type(editor, "`");
    expect(save()).toBe("abc `def` ghi\n");
  });
});

describe("Backtick from a dead key (composition)", () => {
  it("a closing backtick after text opened by one makes it code", () => {
    const { editor, save } = open("abc `def ghi\n");
    editor.view.dispatch(editor.state.tr.insertText("`", 9));
    const tr = codeFromPreceding(editor.state, 9);
    expect(tr).not.toBeNull();
    editor.view.dispatch(tr!);
    expect(save()).toBe("abc `def` ghi\n");
    expect(editor.state.selection.from).toBe(8);
  });

  /** A dead key: composition events around the text it types at `at`. */
  async function compose(editor: ReturnType<typeof open>["editor"], at: number, text: string) {
    select(editor, at);
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    editor.view.dispatch(editor.state.tr.insertText(text, at));
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: text }));
    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  it("before then after a word of an existing note", async () => {
    const { editor, save } = open("Une note avec un mot au milieu.\n");
    await compose(editor, 18, "`");
    expect(save()).toBe("Une note avec un `mot au milieu.\n");
    await compose(editor, 22, "`");
    expect(save()).toBe("Une note avec un `mot` au milieu.\n");
  });

  it("after then before a word", async () => {
    const { editor, save } = open("Une note avec un mot au milieu.\n");
    await compose(editor, 21, "`");
    await compose(editor, 18, "`");
    expect(save()).toBe("Une note avec un `mot` au milieu.\n");
  });

  it("when the key ending the dead key adds a character", async () => {
    const { editor, save } = open("Un `mot ici\n");
    await compose(editor, 8, "`,");
    expect(save()).toBe("Un `mot`, ici\n");
  });

  it("a backtick arriving as a plain change of the page (no key, no composition)", async () => {
    const { editor, save } = open("Une note avec un `mot au milieu.\n");
    editor.view.dispatch(editor.state.tr.insertText("`", 22));
    await Promise.resolve();
    expect(save()).toBe("Une note avec un `mot` au milieu.\n");
  });

  it("a pasted backtick is left as it is", async () => {
    const { editor, save } = open("Un `mot ici\n");
    editor.view.someProp("handlePaste", (f) => f(editor.view, new Event("paste") as ClipboardEvent, editor.state.doc.slice(0, 0)));
    editor.view.dispatch(editor.state.tr.insertText("`", 8));
    await Promise.resolve();
    // Kept as text: the file escapes it.
    expect(save()).toBe("Un \\`mot\\` ici\n");
  });

  it("a lone backtick changes nothing", () => {
    const { editor } = open("abc def\n");
    editor.view.dispatch(editor.state.tr.insertText("`", 4));
    expect(codeFromPreceding(editor.state, 4)).toBeNull();
  });
});

describe("Heading marks", () => {
  it("Backspace at the start of a heading removes one #", () => {
    const { editor, save } = open("### Titre\n");
    cursorAtStartOf(editor, "Titre");
    press(editor, "Backspace");
    expect(save()).toBe("## Titre\n");
    press(editor, "Backspace");
    press(editor, "Backspace");
    expect(save()).toBe("Titre\n");
  });

  it("# typed at the start of a heading adds one", () => {
    const { editor, save } = open("## Titre\n");
    cursorAtStartOf(editor, "Titre");
    type(editor, "#");
    expect(save()).toBe("### Titre\n");
  });

  it("the level shows in the margin while the cursor is in the heading", () => {
    const { editor } = open("## Titre\n\nTexte\n");
    cursorAtStartOf(editor, "Titre");
    expect(editor.view.dom.querySelector(".heading-mark")?.textContent).toBe("##");
    cursorAtStartOf(editor, "Texte");
    expect(editor.view.dom.querySelector(".heading-mark")).toBeNull();
  });
});

describe("Inline code marks", () => {
  it("→ at the end steps over the backtick, then Backspace removes the code", () => {
    const { editor, save } = open("abc `def` ghi\n");
    select(editor, 8);
    expect(editor.view.dom.querySelectorAll(".code-mark")).toHaveLength(2);
    press(editor, "ArrowRight");
    expect(editor.state.selection.from).toBe(8);
    press(editor, "Backspace");
    expect(save()).toBe("abc def ghi\n");
  });

  it("Backspace inside the code still deletes a letter", () => {
    const { editor, save } = open("abc `def` ghi\n");
    select(editor, 8);
    editor.view.dispatch(editor.state.tr.delete(7, 8));
    expect(save()).toBe("abc `de` ghi\n");
  });

  it("Delete before the opening backtick removes the code", () => {
    const { editor, save } = open("abc `def` ghi\n");
    select(editor, 5);
    press(editor, "Delete");
    expect(save()).toBe("abc def ghi\n");
  });

  it("⌘E in the code removes it", () => {
    const { editor, save } = open("abc `def` ghi\n");
    select(editor, 6);
    press(editor, "e", { ctrlKey: true });
    expect(save()).toBe("abc def ghi\n");
  });
});

describe("⌘K", () => {
  it("links the selected text", () => {
    const { editor } = open("abc def\n");
    select(editor, 5, 8);
    expect(linkTarget(editor.state)).toEqual({ from: 5, to: 8, href: "" });
  });

  it("edits the link around the cursor", () => {
    const { editor } = open("voir [le site](https://example.com) ici\n");
    cursorAtStartOf(editor, "le site");
    select(editor, editor.state.selection.from + 2);
    expect(linkTarget(editor.state)?.href).toBe("https://example.com");
  });

  it("does nothing without a selection nor a link (the page search opens)", () => {
    const { editor } = open("abc def\n");
    select(editor, 3);
    expect(linkTarget(editor.state)).toBeNull();
  });
});

describe("HedgeDoc admonitions", () => {
  const md = 'Avant\n\n:::info\nUn **texte**\n\n- liste\n:::\n\n:::spoiler {state="open"} Détails\ncaché\n:::\n\n::::warning\n:::danger\nimbriqué\n:::\n::::\n\n```\n:::info\n:::\n```\n\nFin\n';

  it("are callouts, the file unchanged", () => {
    const { editor, save } = open(md);
    expect(save()).toBe(md);
    const callouts = editor.getJSON().content!.filter((n) => n.type === "callout");
    expect(callouts.map((n) => [n.attrs?.calloutType, n.attrs?.fold])).toEqual([
      ["info", ""],
      ["spoiler", "+"],
      ["warning", ""],
    ]);
  });

  it("keep their syntax when edited", () => {
    const { editor, save } = open(md);
    cursorAtStartOf(editor, "caché");
    type(editor, "X");
    cursorAtStartOf(editor, "imbriqué");
    type(editor, "Y");
    expect(save()).toBe(md.replace("caché", "Xcaché").replace("imbriqué", "Yimbriqué"));
  });

  it("an unclosed container stays text", () => {
    const { editor } = open(":::info\ntexte\n");
    expect(editor.state.doc.firstChild!.type.name).toBe("paragraph");
  });

  it("`:::warning ` typed at the start of a line", () => {
    const { editor, save } = open("Avant\n");
    editor.commands.focus("end");
    editor.commands.enter();
    type(editor, ":::warning texte");
    expect(save()).toBe("Avant\n\n:::warning\ntexte\n:::\n");
  });
});

describe("Copy", () => {
  it("puts the selection's Markdown on the clipboard as text", () => {
    const { editor } = open("## Titre\n\n- **un** [[Page]]\n- deux\n\nfin\n");
    select(editor, 1, editor.state.doc.content.size - 1);
    expect(markdownForClipboard(editor.state.selection.content())).toBe("## Titre\n\n- **un** [[Page]]\n- deux\n\nfin");
  });

  it("part of a line gives its Markdown", () => {
    const { editor } = open("abc `def` ghi\n");
    select(editor, 5, 10);
    expect(markdownForClipboard(editor.state.selection.content())).toBe("`def` g");
  });
});
