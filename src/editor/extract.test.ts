// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { destroyEditors, openEditor as open } from "./testUtils";
import { blockRange, extractToNote, selectionRange } from "./extract";
import { splitAlt } from "./views/imageResize";

afterEach(destroyEditors);

function setup(markdown: string, name: string | null = null) {
  const created: Record<string, string> = {};
  const opened = open(markdown, {
    notePath: "Projets/Note.md",
    files: ["Projets/Note.md"],
    askName: async (_title, initial) => name ?? initial,
    createFile: async (path, content) => {
      created[path] = String(content);
    },
  });
  return { ...opened, created };
}

const topBlock = (editor: ReturnType<typeof open>["editor"], index: number) => {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += editor.state.doc.child(i).nodeSize;
  return { pos, node: editor.state.doc.child(index) };
};

describe("Extracting to a new note", () => {
  it("a block: the note is created next to this one, a link takes its place", async () => {
    const { editor, save, created, bridge } = setup("Avant\n\nUne idée à creuser **vite**\n\nAprès\n");
    await extractToNote(editor, bridge.current, blockRange(editor.state.doc, topBlock(editor, 1))!);
    expect(created).toEqual({ "Projets/Une idée à creuser vite.md": "Une idée à creuser **vite**\n" });
    expect(save()).toBe("Avant\n\n[[Une idée à creuser vite]]\n\nAprès\n");
  });

  it("a heading: its section goes, the heading stays with the link", async () => {
    const { editor, save, created, bridge } = setup("## Budget\n\n- un\n- deux\n\n## Suite\n");
    await extractToNote(editor, bridge.current, blockRange(editor.state.doc, topBlock(editor, 0))!);
    expect(created["Projets/Budget.md"]).toBe("- un\n- deux\n");
    expect(save()).toBe("## Budget\n\n[[Budget]]\n\n## Suite\n");
  });

  it("a selection inside a line, under the name typed", async () => {
    const { editor, save, created, bridge } = setup("Voir le devis du client ici\n", "Devis");
    const range = selectionRange(editor.state.doc, 9, 24)!;
    expect(range.name).toBe("devis du client");
    await extractToNote(editor, bridge.current, range);
    expect(created["Projets/Devis.md"]).toBe("devis du client\n");
    expect(save()).toBe("Voir le [[Devis]] ici\n");
  });

  it("nothing when the name is not given", async () => {
    const { editor, save, created, bridge } = setup("Texte\n");
    bridge.current.askName = async () => null;
    await extractToNote(editor, bridge.current, blockRange(editor.state.doc, topBlock(editor, 0))!);
    expect(created).toEqual({});
    expect(save()).toBe("Texte\n");
  });
});

describe("Image sizes in Markdown images", () => {
  it("the width after the last |", () => {
    expect(splitAlt("Logo|300")).toEqual({ text: "Logo", size: { width: 300, height: null } });
    expect(splitAlt("|120x80")).toEqual({ text: "", size: { width: 120, height: 80 } });
    expect(splitAlt("a|b")).toEqual({ text: "a|b", size: null });
  });

  it("a new width is written in the alt text, the rest of the line kept", () => {
    const { editor, save } = open("Voir ![Logo](logo.png) ici\n");
    let pos = -1;
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === "image") pos = p;
    });
    const node = editor.state.doc.nodeAt(pos)!;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, alt: "Logo|240", raw: null }));
    expect(save()).toBe("Voir ![Logo|240](logo.png) ici\n");
  });
});
