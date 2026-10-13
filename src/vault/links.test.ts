import { describe, expect, it } from "vitest";
import {
  attachmentFolder,
  DEFAULT_CONFIG,
  linkTextFor,
  newNoteFolder,
  parseObsidianConfig,
  pastedImageName,
  relativePath,
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
