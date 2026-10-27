// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { destroyEditors, openEditor as open, type } from "./testUtils";
import { pastedUrl, pasteUrlWithTitle } from "./linkTitle";

afterEach(destroyEditors);

const url = "https://example.com/article";
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("A web address pasted alone takes the page's title", () => {
  it("only a bare address", () => {
    expect(pastedUrl(` ${url}\n`)).toBe(url);
    expect(pastedUrl(`voir ${url}`)).toBeNull();
    expect(pastedUrl("example.com")).toBeNull();
  });

  it("becomes [Title](address) when the title arrives", async () => {
    const { editor, save } = open("");
    type(editor, "Lire : ");
    expect(pasteUrlWithTitle(editor.view, url, async () => "Un  [bon] article\n")).toBe(true);
    expect(save()).toBe(`Lire : ${url}\n`);
    await settle();
    expect(save()).toBe(`Lire : [Un [bon] article](${url})\n`);
  });

  it("stays bare without a title", async () => {
    const { editor, save } = open("");
    pasteUrlWithTitle(editor.view, url, async () => null);
    await settle();
    expect(save()).toBe(`${url}\n`);
  });

  it("is left alone when edited before the title arrives", async () => {
    const { editor, save } = open("");
    let answer: (title: string) => void = () => {};
    pasteUrlWithTitle(editor.view, url, () => new Promise((resolve) => (answer = resolve)));
    editor.view.dispatch(editor.state.tr.insertText("x", 5));
    answer("Titre");
    await settle();
    expect(save()).toBe(`${url.slice(0, 4)}x${url.slice(4)}\n`);
  });

  it("not in code", () => {
    const { editor } = open("```\n\n```\n");
    editor.commands.setTextSelection(2);
    expect(pasteUrlWithTitle(editor.view, url, async () => "Titre")).toBe(false);
  });
});
