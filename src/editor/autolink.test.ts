// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { destroyEditors, openEditor, press, type } from "./testUtils";
import { findUrls } from "./autolink";

afterEach(destroyEditors);

const links = (editor: ReturnType<typeof openEditor>["editor"]) => {
  const found: string[] = [];
  editor.state.doc.descendants((node) => {
    const link = node.marks.find((m) => m.type.name === "link");
    if (node.isText && link) found.push(`${node.text}=${link.attrs.href}`);
  });
  return found;
};

describe("typed web addresses become links", () => {
  it("once the cursor leaves them, the file keeping the bare address", () => {
    const { editor, save } = openEditor("Voir\n");
    type(editor, " https://a.io/mdbase/");
    expect(links(editor)).toEqual([]);
    type(editor, " ici");
    expect(links(editor)).toEqual(["https://a.io/mdbase/=https://a.io/mdbase/"]);
    expect(save()).toBe("Voir https://a.io/mdbase/ ici\n");
  });

  it("with Enter at the end of the line", () => {
    const { editor, save } = openEditor("Voir\n");
    type(editor, " https://a.io/x");
    press(editor, "Enter");
    expect(links(editor)).toEqual(["https://a.io/x=https://a.io/x"]);
    expect(save()).toBe("Voir https://a.io/x\n");
  });

  it("not in code", () => {
    const { editor } = openEditor("`https://a.io/x` b\n");
    type(editor, " c");
    expect(links(editor)).toEqual([]);
  });

  it("a link edited into something else is no longer a link", () => {
    const { editor } = openEditor("https://a.io/x b\n");
    editor.commands.setTextSelection({ from: 1, to: 9 });
    type(editor, "z");
    expect(links(editor)).toEqual([]);
  });
});

describe("findUrls", () => {
  it.each([
    ["(voir https://a.io/x).", "https://a.io/x"],
    ["https://fr.wikipedia.org/wiki/A_(b).", "https://fr.wikipedia.org/wiki/A_(b)"],
    ["[https://a.io/x]", "https://a.io/x"],
    ["www.a.io, puis", "www.a.io"],
    ["https:// rien", null],
    ["xhttps://a.io", null],
    // A Markdown link's destination being typed is left to its input rule.
    ["[doc](https://a.io/x", null],
    ["![image](https://a.io/x.png", null],
  ])("%s", (text, url) => {
    expect(findUrls(text)[0] ? text.slice(findUrls(text)[0].from, findUrls(text)[0].to) : null).toBe(url);
  });
});
