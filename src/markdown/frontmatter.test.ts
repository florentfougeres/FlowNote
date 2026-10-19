import { describe, expect, it } from "vitest";
import { addProperty, readProperties, renameProperty, setProperty } from "./frontmatter";

const FM = `---
# Métadonnées de la note
title: Mon projet
tags: [projet, notion]
aliases:
  - FlowNote
  - Mon Notion
published: false
priority: 2
created: 2026-10-13
updated: 2026-10-13T19:05
---`;

describe("reading properties", () => {
  it("types values like Obsidian", () => {
    expect(readProperties(FM).properties).toEqual([
      { key: "title", type: "text", value: "Mon projet" },
      { key: "tags", type: "list", value: ["projet", "notion"] },
      { key: "aliases", type: "list", value: ["FlowNote", "Mon Notion"] },
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
    const next = setProperty(FM, "tags", ["projet", "notion", "obsidian"])!;
    expect(next).toBe(FM.replace("tags: [projet, notion]", "tags: [projet, notion, obsidian]"));
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
    expect(addProperty(created).key).toBe("propriété");
  });
});
