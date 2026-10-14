import { describe, expect, it } from "vitest";
import {
  attachmentFolder,
  DEFAULT_CONFIG,
  linkTextFor,
  newNoteFolder,
  parseObsidianConfig,
  pastedImageName,
  relativePath,
  renamePlan,
  rewriteLinks,
  resolveLink,
  sanitizeName,
  subpageFolder,
  uniquePath,
} from "./links";

const FILES = [
  "Accueil.md",
  "Projets/Mon Notion.md",
  "Projets/Mon Notion/Stack.md",
  "Archive/Stack.md",
  "Perso/Idées.md",
  "Écrits/Cours DuckDB/img/cli.png",
  "image.png",
];

describe("resolveLink", () => {
  it("finds notes by name anywhere", () => {
    expect(resolveLink("Idées", FILES)).toBe("Perso/Idées.md");
    expect(resolveLink("Idées#Section", FILES)).toBe("Perso/Idées.md");
    expect(resolveLink("Idées|alias", FILES)).toBe("Perso/Idées.md");
  });

  it("prefers an exact path, then the linking note's folder, then the shortest path", () => {
    expect(resolveLink("Projets/Mon Notion/Stack", FILES)).toBe("Projets/Mon Notion/Stack.md");
    expect(resolveLink("Stack", FILES, "Projets/Mon Notion/Autre.md")).toBe("Projets/Mon Notion/Stack.md");
    expect(resolveLink("Stack", FILES, "Accueil.md")).toBe("Archive/Stack.md");
  });

  it("finds attachments by file name", () => {
    expect(resolveLink("cli.png", FILES)).toBe("Écrits/Cours DuckDB/img/cli.png");
    expect(resolveLink("image.png", FILES)).toBe("image.png");
    expect(resolveLink("absente", FILES)).toBeNull();
  });
});

describe("link text", () => {
  it("uses the shortest unambiguous form", () => {
    expect(linkTextFor("Perso/Idées.md", FILES)).toBe("Idées");
    expect(linkTextFor("Archive/Stack.md", FILES)).toBe("Archive/Stack");
    expect(linkTextFor("Écrits/Cours DuckDB/img/cli.png", FILES)).toBe("cli.png");
  });
});

describe("locations", () => {
  it("attachments follow the Obsidian setting", () => {
    const note = "Projets/Mon Notion.md";
    expect(attachmentFolder(note, DEFAULT_CONFIG)).toBe("");
    expect(attachmentFolder(note, { ...DEFAULT_CONFIG, attachmentFolderPath: "./" })).toBe("Projets");
    expect(attachmentFolder(note, { ...DEFAULT_CONFIG, attachmentFolderPath: "./assets" })).toBe("Projets/assets");
    expect(attachmentFolder(note, { ...DEFAULT_CONFIG, attachmentFolderPath: "Pièces jointes" })).toBe("Pièces jointes");
  });

  it("new notes follow the Obsidian setting; sub-pages go in a folder named after their parent", () => {
    expect(newNoteFolder("Projets/Mon Notion.md", DEFAULT_CONFIG)).toBe("");
    expect(newNoteFolder("Projets/Mon Notion.md", { ...DEFAULT_CONFIG, newFileLocation: "current" })).toBe("Projets");
    expect(subpageFolder("Projets/Mon Notion.md")).toBe("Projets/Mon Notion");
    expect(subpageFolder("Accueil.md")).toBe("Accueil");
  });

  it("unique names and Obsidian naming", () => {
    expect(uniquePath("Archive", "Stack.md", FILES)).toBe("Archive/Stack 1.md");
    expect(uniquePath("", "Nouvelle.md", FILES)).toBe("Nouvelle.md");
    expect(pastedImageName(new Date(2026, 9, 13, 19, 5, 3), "png")).toBe("Pasted image 20261013190503.png");
    expect(sanitizeName("a/b: c?")).toBe("a b c");
    expect(relativePath("Projets/Mon Notion.md", "Projets/img/a.png")).toBe("img/a.png");
    expect(relativePath("Projets/Mon Notion.md", "image.png")).toBe("../image.png");
  });

  it("reads Obsidian settings with defaults", () => {
    expect(parseObsidianConfig("{}")).toEqual(DEFAULT_CONFIG);
    expect(parseObsidianConfig('{"attachmentFolderPath":"./","newFileLocation":"current"}').attachmentFolderPath).toBe("./");
    expect(parseObsidianConfig("pas du json")).toEqual(DEFAULT_CONFIG);
  });
});

describe("updating links after a rename", () => {
  const before = ["Index.md", "Projets/Mon Notion.md", "Projets/Mon Notion/Stack.md", "Archive/Stack.md", "img/a.png"];
  const renames = renamePlan("Projets/Mon Notion.md", "Projets/FlowNote.md", before);
  const after = before.map((f) => renames.get(f) ?? f);
  const change = (oldNotePath: string, newNotePath = oldNotePath) => ({ oldNotePath, newNotePath, filesBefore: before, filesAfter: after, renames });

  it("plans the note and its sub-pages folder", () => {
    expect([...renames]).toEqual([
      ["Projets/Mon Notion.md", "Projets/FlowNote.md"],
      ["Projets/Mon Notion/Stack.md", "Projets/FlowNote/Stack.md"],
    ]);
  });

  it("rewrites wikilinks, keeping sections and aliases, and nothing else", () => {
    const src = "Voir [[Mon Notion]], [[Mon Notion#Plan|le plan]] et ![[Mon Notion]].\nAutre : [[Index]] et [[Archive/Stack]].\n";
    expect(rewriteLinks(src, change("Index.md"))).toBe("Voir [[FlowNote]], [[FlowNote#Plan|le plan]] et ![[FlowNote]].\nAutre : [[Index]] et [[Archive/Stack]].\n");
    expect(rewriteLinks("[[Index]] seulement\n", change("Index.md"))).toBeNull();
  });

  it("path links to moved sub-pages are updated", () => {
    expect(rewriteLinks("[[Projets/Mon Notion/Stack]]\n", change("Index.md"))).toBe("[[Projets/FlowNote/Stack]]\n");
  });

  it("relative Markdown links, including those of notes that moved", () => {
    expect(rewriteLinks("[Projet](Projets/Mon%20Notion.md#plan)\n", change("Index.md"))).toBe("[Projet](Projets/FlowNote.md#plan)\n");
    // The sub-page moved: its link to an unchanged file is recomputed.
    expect(rewriteLinks("![](../../img/a.png) et [web](https://x.y)\n", change("Projets/Mon Notion/Stack.md", "Projets/FlowNote/Stack.md"))).toBeNull();
    expect(rewriteLinks("[parent](../Mon%20Notion.md)\n", change("Projets/Mon Notion/Stack.md", "Projets/FlowNote/Stack.md"))).toBe("[parent](../FlowNote.md)\n");
  });

  it("leaves code alone", () => {
    const src = "```\n[[Mon Notion]]\n```\n`[[Mon Notion]]` mais [[Mon Notion]]\n";
    expect(rewriteLinks(src, change("Index.md"))).toBe("```\n[[Mon Notion]]\n```\n`[[Mon Notion]]` mais [[FlowNote]]\n");
  });
});

describe("links to drawings", () => {
  it("[[Name.excalidraw]] resolves to Name.excalidraw.md; titles drop the suffix", async () => {
    const { resolveLink, noteTitle, linkTextFor } = await import("./links");
    const files = ["Croquis.excalidraw.md", "Dossier/Note.md", "img.png"];
    expect(resolveLink("Croquis.excalidraw", files)).toBe("Croquis.excalidraw.md");
    expect(resolveLink("img.png", files)).toBe("img.png");
    expect(noteTitle("Dossier/Croquis.excalidraw.md")).toBe("Croquis");
    expect(linkTextFor("Croquis.excalidraw.md", files)).toBe("Croquis.excalidraw");
  });
});
