import { describe, expect, it } from "vitest";
import { loadMarkdown } from "./note";
import { noteProperties, readProperties, renameProperty, setProperty, splitFrontmatter, vaultPropertyKeys } from "./frontmatter";

const FM = `---
# Métadonnées de la note
title: Mon projet
tags: [projet, carnet]
aliases:
  - FlowNote
  - Mon Carnet
published: false
priority: 2
created: 2026-10-13
updated: 2026-10-13T19:05
---`;

describe("splitFrontmatter", () => {
  it("finds the block the editor finds", () => {
    for (const text of ["---\na: 1\n---\nTexte", "---\n---\nTexte", "---  \na: 1\n---  \nTexte", "\uFEFF---\r\na: 1\r\n---\r\nTexte"]) {
      const front = splitFrontmatter(text);
      expect(front?.body).toBe("Texte");
      expect(front?.block.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")).toBe(`${loadMarkdown(text).layout.frontmatter}\n`);
    }
  });

  it("has nothing for a note without front matter", () => {
    expect(splitFrontmatter("# Titre\n---\n")).toBeNull();
    expect(splitFrontmatter("Texte\n---\na: 1\n---")).toBeNull();
    expect(noteProperties("# Titre")).toEqual([]);
  });

  it("reads the properties, CRLF or not", () => {
    expect(noteProperties("---\r\ntags: [a, b]\r\n---\r\n")).toEqual([{ key: "tags", type: "list", value: ["a", "b"] }]);
    expect(noteProperties("---\n---\n")).toEqual([]);
  });
});

describe("reading properties", () => {
  it("types values like Obsidian", () => {
    expect(readProperties(FM).properties).toEqual([
      { key: "title", type: "text", value: "Mon projet" },
      { key: "tags", type: "list", value: ["projet", "carnet"] },
      { key: "aliases", type: "list", value: ["FlowNote", "Mon Carnet"] },
      { key: "published", type: "checkbox", value: false },
      { key: "priority", type: "number", value: 2 },
      { key: "created", type: "date", value: "2026-10-13" },
      { key: "updated", type: "datetime", value: "2026-10-13T19:05" },
    ]);
  });

  it("reads tags written on one line as a list, as Obsidian does", () => {
    expect(readProperties("---\ntags: projet, perso  idée\n---").properties).toEqual([{ key: "tags", type: "list", value: ["projet", "perso", "idée"] }]);
    // Another text property keeps its commas; edited tags become a YAML list.
    expect(readProperties("---\nlieu: Paris, France\n---").properties[0]).toEqual({ key: "lieu", type: "text", value: "Paris, France" });
    expect(setProperty("---\ntags: projet, perso\n---", "tags", ["projet", "perso", "neuf"])).toContain("neuf");
  });

  it("reports invalid YAML instead of guessing", () => {
    const result = readProperties("---\ntags: [non fermé\n---");
    expect(result.error).not.toBeNull();
  });
});

describe("editing properties", () => {
  it("adding a tag keeps the flow style, comments and the other keys", () => {
    const next = setProperty(FM, "tags", ["projet", "carnet", "obsidian"])!;
    expect(next).toBe(FM.replace("tags: [projet, carnet]", "tags: [projet, carnet, obsidian]"));
  });

  it("block lists stay block lists", () => {
    const next = setProperty(FM, "aliases", ["FlowNote"])!;
    expect(next).toContain("aliases:\n  - FlowNote\npublished");
  });

  it("scalars, removal, rename and creation", () => {
    let next = setProperty(FM, "published", true)!;
    expect(next).toContain("published: true");
    next = setProperty(next, "priority", undefined)!;
    expect(next).not.toContain("priority");
    next = renameProperty(next, "title", "titre");
    expect(next).toContain("titre: Mon projet");
    expect(next.startsWith("---\n# Métadonnées de la note\n")).toBe(true);
    expect(() => renameProperty(next, "titre", "tags")).toThrow();
  });

  it("a note without frontmatter gets one; removing everything removes it", () => {
    const created = setProperty(null, "tags", ["idée"])!;
    expect(created).toBe("---\ntags:\n  - idée\n---");
    expect(setProperty(created, "tags", undefined)).toBeNull();
    expect(setProperty(created, "statut", null)).toBe("---\ntags:\n  - idée\nstatut: null\n---");
  });
});

describe("vaultPropertyKeys", () => {
  it("lists the vault's properties, the most used first, with their usual type", () => {
    const notes: [string, string][] = [
      ["a.md", "---\ntags: [x]\nstatut: fait\nbudget: 3\n---\nTexte"],
      ["b.md", "---\ntags: [y]\nstatut:\n---\n"],
      ["c.md", "Sans propriétés"],
    ];
    expect(vaultPropertyKeys(notes)).toEqual([
      { key: "statut", count: 2, type: "text" },
      { key: "tags", count: 2, type: "list" },
      { key: "budget", count: 1, type: "number" },
    ]);
  });
});
