// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { insertAttachments, type VaultBridge } from "./bridge";
import { linkItems } from "./wikilinks";
import { destroyEditors, openEditor, press, type } from "./testUtils";
import { DEFAULT_CONFIG } from "../vault/links";

afterEach(destroyEditors);

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const FILES = ["Note.md", "Perso/Idées.md", "Archive/Idées.md", "Écrits/img/cli.png", "Projets.md"];

function vault(overrides: Partial<VaultBridge> = {}): Partial<VaultBridge> {
  const files = [...FILES];
  return {
    notePath: "Note.md",
    files,
    createFile: vi.fn(async (path: string) => void files.push(path)),
    ...overrides,
  };
}

describe("link suggestions", () => {
  it("lists notes, best matches first, and offers to create a missing one", () => {
    expect(linkItems("pro", FILES, false).map((i) => i.title)).toEqual(["Projets", "Créer « pro »"]);
    expect(linkItems("Idées", FILES, false).filter((i) => i.path).length).toBe(2);
    expect(linkItems("Idées", FILES, false).some((i) => i.create)).toBe(false);
    expect(linkItems("cli", FILES, true).map((i) => i.path)).toEqual(["Écrits/img/cli.png"]);
  });

  it("[[ inserts the shortest unambiguous link", async () => {
    const { editor, links, save } = openEditor("", vault());
    type(editor, "Voir [[Proj");
    await tick();
    expect(links.state?.items[0].title).toBe("Projets");
    press(editor, "Enter");
    expect(save()).toBe("Voir [[Projets]]\n");
  });

  it("ambiguous names get their path", async () => {
    const { editor, save } = openEditor("", vault());
    type(editor, "[[Idées");
    await tick();
    press(editor, "Enter");
    expect(save()).toMatch(/^\[\[(Perso|Archive)\/Idées\]\]\n$/);
  });

  it("![[ embeds an attachment", async () => {
    const { editor, save } = openEditor("", vault());
    type(editor, "![[cli");
    await tick();
    press(editor, "Enter");
    expect(save()).toBe("![[cli.png]]\n");
  });

  it("creates a missing note at the configured location, then links it", async () => {
    const bridge = vault();
    const { editor, save } = openEditor("", bridge);
    type(editor, "[[Nouvelle idée");
    await tick();
    press(editor, "ArrowUp"); // the "create" item is last
    press(editor, "Enter");
    await tick();
    expect(bridge.createFile).toHaveBeenCalledWith("Nouvelle idée.md", "");
    expect(save()).toBe("[[Nouvelle idée]]\n");
  });

  it("uses Markdown links when the vault is configured without wikilinks", async () => {
    const { editor, save } = openEditor("", vault({ config: { ...DEFAULT_CONFIG, useMarkdownLinks: true } }));
    type(editor, "[[Proj");
    await tick();
    press(editor, "Enter");
    expect(save()).toBe("[Projets](Projets.md)\n");
  });

  it("Escape keeps the typed text", async () => {
    const { editor, links, save } = openEditor("", vault());
    type(editor, "[[Pro");
    await tick();
    press(editor, "Escape");
    await tick();
    expect(links.state).toBeNull();
    expect(save()).toBe("[[Pro\n");
  });

  it("unresolved links are marked", () => {
    const { editor } = openEditor("[[Projets]] et [[Absente]]\n", vault());
    const classes = [...editor.view.dom.querySelectorAll("[data-target]")].map((el) => el.className);
    expect(classes).toEqual(["wikilink", "wikilink unresolved"]);
  });
});

describe("sub-pages", () => {
  it("the slash command creates Note/Name.md, links it and opens it", async () => {
    const openPath = vi.fn();
    const bridge = vault({ askName: async () => "Ma sous-page", openPath });
    const { editor, save } = openEditor("", bridge);
    type(editor, "/sous");
    await tick();
    press(editor, "Enter");
    await tick();
    await tick();
    expect(bridge.createFile).toHaveBeenCalledWith("Note/Ma sous-page.md", "");
    expect(save()).toBe("[[Ma sous-page]]\n");
    expect(openPath).toHaveBeenCalledWith("Note/Ma sous-page.md");
  });
});

describe("attachments", () => {
  it("dropped files are saved with the Obsidian settings and embedded", async () => {
    const bridge = vault({ config: { ...DEFAULT_CONFIG, attachmentFolderPath: "./assets" }, notePath: "Perso/Idées.md" });
    const { editor, save, bridge: ref } = openEditor("Texte\n", bridge);
    const bytes = new Uint8Array([137, 80, 78, 71]);
    await insertAttachments(editor, ref.current, [{ name: "photo.png", bytes }], editor.state.doc.content.size - 1);
    expect(bridge.createFile).toHaveBeenCalledWith("Perso/assets/photo.png", bytes);
    expect(save()).toBe("Texte![[photo.png]]\n");
  });
});

describe("tags", () => {
  it("are updated while typing", () => {
    const { editor } = openEditor("Texte #ancien\n\nAutre bloc #fixe\n");
    const tags = () => [...editor.view.dom.querySelectorAll(".tag")].map((el) => el.textContent);
    editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize - 1);
    type(editor, " #neuf");
    expect(tags()).toEqual(["#ancien", "#neuf", "#fixe"]);
    const { from } = editor.state.selection;
    editor.view.dispatch(editor.state.tr.delete(from - 5, from));
    expect(tags()).toEqual(["#ancien", "#fixe"]);
  });

  it("highlights #tags but not headings, numbers or code", () => {
    const { editor } = openEditor("Un #projet/notion et #42 et `#code`\n");
    const tags = [...editor.view.dom.querySelectorAll(".tag")].map((el) => el.textContent);
    expect(tags).toEqual(["#projet/notion"]);
  });
});

describe("emoji", () => {
  it("finds emoji by shortcode and by French name", async () => {
    const { loadEmojis, searchEmojis } = await import("./emoji");
    const entries = await loadEmojis();
    expect(searchEmojis("calendar", entries)[0].emoji).toBe("📆");
    expect(searchEmojis("calendrier", entries).map((e) => e.emoji)).toContain("📅");
    expect(searchEmojis("fus", entries).map((e) => e.emoji)).toContain("🚀");
  });

  it(":cal opens the menu and inserts the Unicode emoji", async () => {
    const { loadEmojis } = await import("./emoji");
    await loadEmojis();
    const { editor, emojis, save } = openEditor();
    type(editor, "Réunion :calend");
    await tick();
    expect(emojis.state?.items[0].emoji).toBe("📆");
    press(editor, "Enter");
    expect(save()).toBe("Réunion 📆\n");
  });

  it(":shortcode: typed in full is converted; colons in prose are not", async () => {
    const { loadEmojis } = await import("./emoji");
    await loadEmojis();
    const { editor, emojis, save } = openEditor();
    type(editor, "Note : à 12:30 :tada: fin");
    await tick();
    expect(emojis.state === null || emojis.state.items.length === 0).toBe(true);
    expect(save()).toBe("Note : à 12:30 🎉 fin\n");
  });
});
