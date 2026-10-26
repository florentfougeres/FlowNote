// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { noteToHtml } from "./copyHtml";
import { texOf } from "./math";
import { destroyEditors, openEditor as open, type } from "./testUtils";

afterEach(destroyEditors);

/** Until KaTeX (loaded on first use) has drawn every formula of the note. */
async function drawn(dom: HTMLElement) {
  for (let i = 0; i < 100 && [...dom.querySelectorAll(".math-inline, .math-block")].some((m) => !m.querySelector(".katex")); i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("math", () => {
  it("reads the TeX inside the delimiters", () => {
    expect(texOf("$x^2$")).toBe("x^2");
    expect(texOf("$$\n\\frac{a}{b}\n$$")).toBe("\\frac{a}{b}");
    expect(texOf("$$ x $$")).toBe("x");
  });

  it("draws inline and block formulas, and writes the file back unchanged", async () => {
    const note = "La formule $E = mc^2$ en ligne.\n\n$$\n\\sum_{k=1}^{n} k\n$$\n";
    const { editor, save } = open(note);
    await drawn(editor.view.dom);
    expect(editor.view.dom.querySelector(".math-inline .katex")).not.toBeNull();
    expect(editor.view.dom.querySelector(".math-block .katex-display")).not.toBeNull();
    expect(save()).toBe(note);
  });

  it("`$…$` typed becomes a formula, with Obsidian's rule", () => {
    const { editor, save } = open("");
    type(editor, "Aire $\\pi r^2$ ici");
    expect(editor.state.doc.firstChild?.child(1).attrs).toMatchObject({ kind: "inlineMath", source: "$\\pi r^2$" });
    expect(save()).toBe("Aire $\\pi r^2$ ici\n");
    // A price, or a space just inside the dollars, stays text.
    const prices = open("");
    type(prices.editor, "De 5$ à 10$ et $ x $");
    let formulas = 0;
    prices.editor.state.doc.descendants((node) => void (node.attrs.kind === "inlineMath" && formulas++));
    expect(formulas).toBe(0);
  });

  it("`$$` then a space makes a formula block", () => {
    const { editor, save } = open("");
    type(editor, "$$ ");
    expect(editor.state.doc.firstChild?.attrs.kind).toBe("math");
    expect(save()).toBe("$$\n\n$$\n");
  });

  it("goes out as MathML in the exported HTML", async () => {
    const { editor } = open("Soit $x^2$.\n");
    await drawn(editor.view.dom);
    const html = noteToHtml(editor.state.doc, "Maths");
    expect(html).toContain("<math");
    expect(html).not.toContain("$x^2$");
  });
});
