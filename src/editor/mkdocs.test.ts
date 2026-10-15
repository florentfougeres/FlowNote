// @vitest-environment jsdom
import { afterAll, beforeAll, afterEach, describe, expect, it } from "vitest";
import { setMkdocsSyntax } from "../markdown/flavor";
import { cursorAtStartOf, destroyEditors, openEditor as open } from "./testUtils";

afterEach(destroyEditors);

describe("MkDocs Material in the editor", () => {
  beforeAll(() => setMkdocsSyntax(true));
  afterAll(() => setMkdocsSyntax(false));

  it("shows admonitions as callouts and tabs with their names, the file unchanged", () => {
    const source = '!!! warning "Attention"\n    Corps.\n\n=== "Python"\n\n    print(1)\n\n=== "Bash"\n\n    echo 1\n';
    const { editor, save } = open(source);
    const dom = editor.view.dom;
    expect(dom.querySelector(".callout")?.getAttribute("data-callout")).toBe("warning");
    expect([...dom.querySelectorAll(".content-tab-name")].map((b) => b.textContent)).toEqual(["Python", "Bash"]);
    expect(dom.querySelector(".content-tabs")?.getAttribute("data-active")).toBe("0");
    expect(save()).toBe(source);
  });

  it("draws keys, sub, sup, Jinja, buttons and abbreviations, the text unchanged", () => {
    const source = "Touches ++ctrl+alt+del++, H~2~O, x^2^, ^^ins^^ et {{ page.title }} sur le HTML.\n\n[Aller](https://x.fr){: .md-button }\n\n*[HTML]: Hyper Text Markup Language\n";
    const { editor, save } = open(source);
    const dom = editor.view.dom;
    expect([...dom.querySelectorAll(".mk-keys kbd")].map((k) => k.textContent)).toHaveLength(3);
    // Hidden markers split a decoration in several spans.
    const text = (selector: string) => [...dom.querySelectorAll(selector)].map((e) => e.textContent).join("");
    expect(text(".mk-sub")).toBe("~2~");
    expect(text(".mk-sup")).toBe("^2^");
    expect(text(".mk-ins")).toBe("^^ins^^");
    expect(dom.querySelector(".mk-jinja")?.textContent).toBe("{{ page.title }}");
    expect(dom.querySelector("a .mk-button")).not.toBeNull();
    expect(dom.querySelector(".mk-abbr")?.getAttribute("title")).toBe("Hyper Text Markup Language");
    expect(dom.querySelector(".mk-abbr-definition")).not.toBeNull();
    expect(save()).toBe(source);
  });

  it("shows the markers again with the cursor in the construct", () => {
    const { editor } = open("Avant x^2^ après\n");
    expect(editor.view.dom.querySelectorAll(".mk-hidden")).toHaveLength(2);
    cursorAtStartOf(editor, "Avant");
    editor.commands.setTextSelection(editor.state.selection.from + 8);
    expect(editor.view.dom.querySelectorAll(".mk-hidden")).toHaveLength(0);
  });

  it("does nothing without the setting", () => {
    setMkdocsSyntax(false);
    try {
      const { editor } = open("x^2^ et !!! note\n");
      expect(editor.view.dom.querySelector(".mk-sup, .callout")).toBeNull();
    } finally {
      setMkdocsSyntax(true);
    }
  });
});
