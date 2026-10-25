// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { noteHtmlDocument, noteToHtml } from "./copyHtml";
import { destroyEditors, openEditor as open } from "./testUtils";

afterEach(destroyEditors);

describe("noteToHtml", () => {
  it("keeps the structure and turns Obsidian syntax into text", () => {
    const { editor } = open(
      "[TOC]\n\n## Partie\n\nUn **gras**, un [[Autre note|alias]] et `code` %%caché%%.\n\n- [x] fait\n- [ ] à faire\n\n> [!tip] Astuce\n> Corps\n\n![[image.png]]\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n",
    );
    const html = noteToHtml(editor.state.doc, "Ma note");
    const page = document.createElement("div");
    page.innerHTML = html;
    expect(page.querySelector("h1")?.textContent).toBe("Ma note");
    expect(page.querySelector("h2")?.textContent).toBe("Partie");
    expect(html).not.toContain("[TOC]");
    expect(html).not.toContain("caché");
    expect(page.querySelector("p")?.textContent).toBe("Un gras, un alias et code .");
    expect([...page.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["☑ fait", "☐ à faire"]);
    expect(page.querySelector("blockquote strong")?.textContent).toBe("Astuce");
    expect(page.querySelector("blockquote")?.textContent).toContain("Corps");
    expect(page.querySelector("img")).toBeNull();
    expect(page.querySelector("td")?.getAttribute("style")).toContain("border");
  });
});

describe("noteHtmlDocument", () => {
  it("is a standalone page, one block per line, with the note's HTML rendered", () => {
    const { editor } = open("## Partie\n\n- un\n- deux\n\n<div><b>bloc</b></div>\n");
    const html = noteHtmlDocument(editor.state.doc, "Ma note");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Ma note</title>");
    expect(html).toMatch(/\n {4}<h2>Partie<\/h2>\n/);
    expect(html).toMatch(/<ul>\n {6}<li>/);
    expect(html).toContain("<div><b>bloc</b></div>");
  });
});
