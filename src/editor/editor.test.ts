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

  it("Backspace at the start of an H1 turns it into text", () => {
    const { editor, save } = open("# Titre\n");
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

  it("Backspace in an empty first line removes it", () => {
    const { editor, save } = open("texte\n");
    editor.commands.setTextSelection(1);
    press(editor, "Enter");
    editor.commands.setTextSelection(1);
    press(editor, "Backspace");
    expect(save()).toBe("texte\n");
    type(editor, "dé");
    expect(save()).toBe("détexte\n");
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

describe("tables", () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("typing in a cell, Tab to the next cell", () => {
    const { editor, save } = open("| A | B |\n|---|---|\n| 1 | 2 |\n");
    cursorAtStartOf(editor, "1");
    type(editor, "x");
    press(editor, "Tab");
    type(editor, "y");
    // Tab puts the cursor at the end of the next cell.
    expect(save()).toBe("| A | B |\n|---|---|\n| x1 | 2y |\n");
  });

  it("Enter at the last row adds a row below", () => {
    const { editor, save } = open("| A | B |\n|---|---|\n| 1 | 2 |\n");
    cursorAtStartOf(editor, "1");
    press(editor, "Enter");
    type(editor, "nouveau");
    expect(save()).toBe("| A | B |\n|---|---|\n| 1 | 2 |\n| nouveau |  |\n");
  });

  it("the slash menu inserts a real table", async () => {
    const { editor, save } = open();
    type(editor, "/tableau");
    await tick();
    press(editor, "Enter");
    type(editor, "Nom");
    press(editor, "Tab");
    type(editor, "Rôle");
    expect(save()).toBe("| Nom | Rôle |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n");
  });

  it("columns can be added and aligned", () => {
    const { editor, save } = open("| A | B |\n|---|---|\n| 1 | 2 |\n");
    cursorAtStartOf(editor, "B");
    editor.commands.addColumnAfter();
    cursorAtStartOf(editor, "A");
    editor.commands.setCellAttribute("align", "center");
    expect(save()).toBe("| A | B |  |\n| :---: | --- | --- |\n| 1 | 2 |  |\n");
  });
});

describe("table navigation", () => {
  it("Tab after the last cell adds a row; Shift-Tab goes back", () => {
    const { editor, save } = open("| A | B |\n|---|---|\n| 1 | 2 |\n");
    cursorAtStartOf(editor, "2");
    press(editor, "Tab");
    type(editor, "c");
    press(editor, "Tab", { shiftKey: true });
    type(editor, "!");
    expect(save()).toBe("| A | B |\n|---|---|\n| 1 | 2! |\n| c |  |\n");
  });
});

describe("find and replace", () => {
  it("finds matches across marks, steps through them, replaces one or all", async () => {
    const { findState, findStep, replaceAll, replaceCurrent, setFindQuery } = await import("./find");
    const { editor, save } = open("Un **chat** noir\n\n- le Chat dort\n\n```\nchat\n```\n");
    setFindQuery(editor.view, "chat", false);
    expect(findState(editor.state).matches).toHaveLength(3);
    expect(editor.view.dom.querySelectorAll(".find-match")).toHaveLength(3);
    setFindQuery(editor.view, "chat", true);
    expect(findState(editor.state).matches).toHaveLength(2);
    findStep(editor.view, 1);
    replaceCurrent(editor.view, "loup");
    expect(findState(editor.state).matches).toHaveLength(1);
    expect(replaceAll(editor.view, "chien")).toBe(1);
    expect(save()).toMatch(/^Un \*\*(chien|loup)\*\* noir\n\n- le Chat dort\n\n```\n(loup|chien)\n```\n$/);
  });

  it("replacing leaves other blocks byte-identical", async () => {
    const { replaceAll, setFindQuery } = await import("./find");
    const source = "* item  \n* autre\n\nTexte  avec   espaces et cible\n";
    const { editor, save } = open(source);
    setFindQuery(editor.view, "cible", false);
    replaceAll(editor.view, "but");
    expect(save()).toBe("* item  \n* autre\n\nTexte  avec   espaces et but\n");
  });
});

describe("table handles operations", () => {
  const TABLE = "| A | B |\n| - | :-: |\n| 1 | 2 |\n| 3 | 4 |\n";
  const ref = async (editor: ReturnType<typeof open>["editor"]) => {
    const { tableAt } = await import("./tableOps");
    let pos = -1;
    editor.state.doc.descendants((node, p) => (node.type.name === "table" && pos < 0 ? ((pos = p), false) : true));
    return tableAt(editor, pos)!;
  };

  it("inserts and deletes rows and columns", async () => {
    const ops = await import("./tableOps");
    const { editor, save } = open(TABLE);
    ops.insertRow(editor, await ref(editor), 3);
    ops.insertColumn(editor, await ref(editor), 1);
    expect(save()).toBe("| A |  | B |\n| --- | --- | :---: |\n| 1 |  | 2 |\n| 3 |  | 4 |\n|  |  |  |\n");
    ops.deleteColumn(editor, await ref(editor), 1);
    ops.deleteRow(editor, await ref(editor), 3);
    expect(save()).toBe(TABLE); // back to the original: written verbatim
  });

  it("moving a body row above the header turns it into the header", async () => {
    const ops = await import("./tableOps");
    const { editor, save } = open(TABLE);
    ops.moveRow(editor, await ref(editor), 1, 0);
    expect(save()).toBe("| 1 | 2 |\n| - | :-: |\n| A | B |\n| 3 | 4 |\n");
    const header = (await ref(editor)).node.child(0).child(0);
    expect(header.type.name).toBe("tableHeader");
  });

  it("moves columns with their alignment, and aligns a column", async () => {
    const ops = await import("./tableOps");
    const { editor, save } = open(TABLE);
    ops.moveColumn(editor, await ref(editor), 1, 0);
    expect(save()).toBe("| B | A |\n| :---: | --- |\n| 2 | 1 |\n| 4 | 3 |\n");
    ops.alignColumn(editor, await ref(editor), 1, "right");
    expect(save()).toBe("| B | A |\n| :---: | ---: |\n| 2 | 1 |\n| 4 | 3 |\n");
  });
});

describe("mermaid", () => {
  it("the slash item writes a standard ```mermaid block", async () => {
    const { editor, save } = open("");
    type(editor, "/mermaid");
    await new Promise((r) => setTimeout(r, 0));
    press(editor, "Enter");
    expect(save()).toBe("```mermaid\ngraph TD\n  A[Début] --> B[Fin]\n```\n");
    expect(editor.view.dom.querySelector(".code-block.is-mermaid")).not.toBeNull();
  });
});

describe("callout types", () => {
  it("every Obsidian type and alias gets its icon and color; unknown types look like notes", async () => {
    const { calloutInfo } = await import("./callouts");
    const { editor } = open("> [!faq] Une question\n> Texte\n\n> [!perso]\n> Autre\n");
    const callouts = [...editor.view.dom.querySelectorAll<HTMLElement>(".callout")];
    expect(callouts.map((c) => c.style.getPropertyValue("--callout"))).toEqual([`rgb(${calloutInfo("question").color})`, `rgb(${calloutInfo("note").color})`]);
    expect(callouts.every((c) => c.querySelector(".callout-icon svg"))).toBe(true);
    expect(calloutInfo("TLDR").type).toBe("abstract");
  });

  it("the slash menu's other callouts open the picker; picking writes the type", async () => {
    const { calloutPicker } = await import("./callouts");
    const { editor, save } = open("");
    type(editor, "/autres");
    await new Promise((r) => setTimeout(r, 0));
    press(editor, "Enter");
    expect(calloutPicker.state).not.toBeNull();
    calloutPicker.state!.onPick("bug");
    calloutPicker.open(null);
    type(editor, "Plantage");
    expect(save()).toBe("> [!bug]\n> Plantage\n");
  });

  it("changing the type of an existing callout keeps the rest verbatim", async () => {
    const { calloutPicker } = await import("./callouts");
    const { editor, save } = open("Avant  \n\n> [!note]- Titre\n> Corps\n");
    editor.view.dom.querySelector(".callout-icon")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    calloutPicker.state!.onPick("example");
    calloutPicker.open(null);
    expect(save()).toBe("Avant  \n\n> [!example]- Titre\n> Corps\n");
  });
});

describe("click under the last block", () => {
  it("an empty line added at the end leaves the file as it was", () => {
    const md = "Texte\n\n```plotly\ndata: []\n```\n";
    const { editor, save } = open(md);
    editor.view.dispatch(editor.state.tr.insert(editor.state.doc.content.size, editor.schema.nodes.paragraph.create()));
    expect(save()).toBe(md);
  });
});

describe("table of contents ([TOC], HedgeDoc)", () => {
  it("a [TOC] paragraph lists the headings and is written back as is", () => {
    const source = "# Titre\n\n[TOC]\n\n## Partie A\n\nTexte\n\n### Détail\n";
    const { editor, save } = open(source);
    const toc = editor.view.dom.querySelector(".toc");
    expect([...toc!.querySelectorAll(".toc-item")].map((b) => b.textContent)).toEqual(["Titre", "Partie A", "Détail"]);
    expect(editor.view.dom.querySelector("p.toc-source")?.textContent).toBe("[TOC]");
    expect(save()).toBe(source);
  });

  it("the cursor in the paragraph shows its text to edit it", () => {
    const { editor } = open("[TOC]\n\n# Titre\n");
    cursorAtStartOf(editor, "[TOC]");
    expect(editor.view.dom.querySelector(".toc-source")).toBeNull();
    expect(editor.view.dom.querySelector(".toc")).not.toBeNull();
  });

  it("the slash item writes [TOC] and moves to the line below", async () => {
    const { editor, save } = open("");
    type(editor, "/sommaire");
    await new Promise((r) => setTimeout(r, 0));
    press(editor, "Enter");
    type(editor, "suite");
    expect(save()).toBe("[TOC]\n\nsuite\n");
  });
});

describe("moving blocks", () => {
  it("⌥↑ and ⌥↓ move the block, like ⌘⇧↑ and ⌘⇧↓", () => {
    const { editor, save } = open("un\n\ndeux\n\ntrois\n");
    cursorAtStartOf(editor, "trois");
    press(editor, "ArrowUp", { altKey: true });
    expect(save()).toBe("un\n\ntrois\n\ndeux\n");
    press(editor, "ArrowUp", { altKey: true });
    press(editor, "ArrowDown", { altKey: true });
    expect(save()).toBe("un\n\ntrois\n\ndeux\n");
  });
});
