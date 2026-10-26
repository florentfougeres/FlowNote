// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { insertAttachments, type VaultBridge } from "./bridge";
import { anchorItems, linkItems } from "./wikilinks";
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

  it("finds notes by their aliases, written as the link's text", () => {
    const aliases = new Map([["Projets.md", ["Chantiers"]]]);
    const [found] = linkItems("chant", FILES, false, aliases);
    expect(found).toMatchObject({ path: "Projets.md", alias: "Chantiers", title: "Chantiers" });
    expect(linkItems("Chantiers", FILES, false, aliases).some((i) => i.create)).toBe(false);
    expect(linkItems("pro", FILES, false, aliases)[0].alias).toBeUndefined();
  });

  it("lists the headings or the blocks of a note after #", () => {
    const headings = [
      { level: 1, text: "Titre" },
      { level: 2, text: "Plan : 2027" },
    ];
    const blocks = [{ line: 4, pos: null, text: "Une idée", id: null }];
    expect(anchorItems("pla", "Note.md", headings, blocks).map((i) => i.heading)).toEqual(["Plan 2027"]);
    expect(anchorItems("^idée", "Note.md", headings, blocks)).toMatchObject([{ block: { line: 4, id: null }, title: "Une idée" }]);
  });

  it("[[ inserts the shortest unambiguous link", async () => {
    const { editor, links, save } = openEditor("", vault());
    type(editor, "Voir [[Proj");
    await tick();
    expect(links.state?.items[0].title).toBe("Projets");
    press(editor, "Enter");
    expect(save()).toBe("Voir [[Projets]]\n");
  });

  it("[[#^ links to a block of the note, giving it an identifier", async () => {
    const { editor, links, save } = openEditor("Une idée à garder.\n\nVoir :\n", vault());
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    type(editor, " [[#^idée");
    await tick();
    expect(links.state?.items[0].title).toBe("Une idée à garder.");
    press(editor, "Enter");
    await tick();
    expect(save()).toMatch(/^Une idée à garder\. \^([a-z0-9]{6})\n\nVoir : \[\[#\^\1\]\]\n$/);
  });

  it("[[Note# links to a heading of another note", async () => {
    const { editor, save } = openEditor("", vault({ readNote: async () => "# Projets\n\n## Plan : 2027\n\ntexte\n" }));
    type(editor, "[[Projets#plan");
    await tick();
    await tick();
    press(editor, "Enter");
    expect(save()).toBe("[[Projets#Plan 2027]]\n");
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
  it("the slash command creates Note/Name.md with its title, links it and opens it", async () => {
    const openPath = vi.fn();
    const bridge = vault({ askName: async () => "Ma sous-page", openPath });
    const { editor, save } = openEditor("", bridge);
    type(editor, "/sous");
    await tick();
    press(editor, "Enter");
    await tick();
    await tick();
    expect(bridge.createFile).toHaveBeenCalledWith("Note/Ma sous-page.md", "# Ma sous-page\n");
    expect(save()).toBe("[[Ma sous-page]]\n");
    expect(openPath).toHaveBeenCalledWith("Note/Ma sous-page.md");
  });
});

describe("templates", () => {
  it("/modèle inserts the chosen template's blocks in place of the empty line", async () => {
    const pickTemplate = vi.fn(async (title: string) => `## Ordre du jour de ${title}\n\n- [ ] Point 1\n`);
    const { editor, save } = openEditor("# Réunion\n", vault({ notePath: "Réunion.md", pickTemplate }));
    editor.commands.focus("end");
    press(editor, "Enter");
    type(editor, "/modèle");
    await tick();
    press(editor, "Enter");
    await tick();
    expect(pickTemplate).toHaveBeenCalledWith("Réunion");
    expect(save()).toBe("# Réunion\n\n## Ordre du jour de Réunion\n\n- [ ] Point 1\n");
  });

  it("/modèle is not offered without templates", async () => {
    const { editor, slash } = openEditor("", vault());
    type(editor, "/modèle");
    await tick();
    expect(slash.state?.items.some((i) => i.key === "template") ?? false).toBe(false);
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
    const { editor } = openEditor("Un #projet/carnet et #42 et `#code`\n");
    const tags = [...editor.view.dom.querySelectorAll(".tag")].map((el) => el.textContent);
    expect(tags).toEqual(["#projet/carnet"]);
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

  it(":cal opens the menu and writes the shortcode, displayed as the emoji", async () => {
    const { loadEmojis } = await import("./emoji");
    await loadEmojis();
    const { editor, emojis, save } = openEditor();
    type(editor, "Réunion :calend");
    await tick();
    expect(emojis.state?.items[0].icon).toBe("📆");
    press(editor, "Enter");
    expect(save()).toBe("Réunion :calendar:\n");
    type(editor, " demain");
    expect(editor.view.dom.querySelector(".emoji-shortcode")?.textContent).toBe("📆");
  });

  it("shortcodes stay text in the note; colons in prose and code are left alone", async () => {
    const { loadEmojis, findShortcodes } = await import("./emoji");
    await loadEmojis();
    const { editor, emojis, save } = openEditor();
    type(editor, "Note : à 12:30 :tada: fin");
    await tick();
    expect(emojis.state === null || emojis.state.items.length === 0).toBe(true);
    expect(save()).toBe("Note : à 12:30 :tada: fin\n");
    const { editor: other } = openEditor("Attention :warning: et `:warning:` et 10:100:5 et :inconnu:\n");
    expect(findShortcodes(other.state.doc).map((s) => s.emoji)).toEqual(["⚠️"]);
    // One-letter shortcodes too (:x: ❌, :o: ⭕), never inside a word (a:b:c).
    const { editor: short } = openEditor("Non :x: et :o: mais a:b:c\n");
    expect(findShortcodes(short.state.doc).map((s) => s.emoji)).toEqual(["❌\u{FE0F}", "⭕\u{FE0F}"]);
  });

  it("existing shortcodes are displayed as emoji, and revealed under the cursor", async () => {
    const { loadEmojis } = await import("./emoji");
    await loadEmojis();
    const { editor, save } = openEditor("Danger :warning: ici\n\nAutre ligne\n");
    const shown = () => [...editor.view.dom.querySelectorAll(".emoji-shortcode")].map((e) => e.textContent);
    expect(shown()).toEqual(["⚠️"]);
    editor.commands.setTextSelection(10); // inside ":warning:"
    expect(shown()).toEqual([]);
    editor.commands.setTextSelection(3);
    expect(shown()).toEqual(["⚠️"]);
    expect(save()).toBe("Danger :warning: ici\n\nAutre ligne\n");
  });

  it("a shortcode typed shows as its emoji at its closing colon, like a highlight", async () => {
    const { loadEmojis } = await import("./emoji");
    await loadEmojis();
    const { editor, save } = openEditor("");
    type(editor, "## Fait :white_check_mark:");
    const shown = () => [...editor.view.dom.querySelectorAll(".emoji-shortcode")].map((e) => e.textContent);
    // The cursor right after the code: the emoji, at once.
    expect(shown()).toEqual(["✅\u{FE0F}"]);
    // ← goes inside the code: its text shows, to be changed.
    editor.commands.setTextSelection(editor.state.selection.from - 1);
    expect(shown()).toEqual([]);
    editor.commands.setTextSelection(editor.state.doc.firstChild!.nodeSize - 1);
    expect(shown()).toEqual(["✅\u{FE0F}"]);
    expect(save()).toBe("## Fait :white_check_mark:\n");
    // ← right after the emoji goes into its code; ⌫ right after it removes it whole.
    press(editor, "ArrowLeft");
    expect(shown()).toEqual([]);
    editor.commands.setTextSelection(editor.state.doc.firstChild!.nodeSize - 1);
    press(editor, "Backspace");
    expect(save()).toBe("## Fait \n");
  });
});
