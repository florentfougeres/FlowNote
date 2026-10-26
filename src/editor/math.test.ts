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

describe("raw blocks", () => {
  it("⌘↵ keeps the source once, even when leaving the page fires the field's blur", async () => {
    const { editor, save } = open("Avant\n\n$$\nx\n$$\n");
    const block = editor.view.dom.querySelector<HTMLElement>('.raw-block[data-kind="math"]')!;
    block.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const field = block.querySelector("textarea")!;
    // As in browsers: the field leaving the page loses the focus first.
    const replaceWith = field.replaceWith.bind(field);
    field.replaceWith = (...nodes) => {
      field.dispatchEvent(new FocusEvent("blur"));
      replaceWith(...nodes);
    };
    field.value = "$$\ny^2\n$$";
    // An error in an event handler does not reach dispatchEvent: the window gets it.
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener("error", onError);
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true }));
    window.removeEventListener("error", onError);
    expect(errors).toEqual([]);
    expect(block.querySelector("textarea")).toBeNull();
    expect(save()).toBe("Avant\n\n$$\ny^2\n$$\n");
  });
});
