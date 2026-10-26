import { describe, expect, it } from "vitest";
import { backlinksTo } from "./backlinks";

const files = ["Projets/Mon Notion.md", "Idées.md", "Journal.md", "Code.md", "Carte.mindmap.md", "Autre.md"];

describe("backlinksTo", () => {
  it("lists the notes linking to a page, with the line of the link", () => {
    const notes: [string, string][] = [
      ["Idées.md", "---\ntags: [x]\n---\n# Idées\n\n- Voir **[[Mon Notion|le projet]]** demain\n"],
      ["Journal.md", "Rien ici.\n\n> Lien Markdown : [projet](Projets/Mon%20Notion.md)\n"],
      ["Autre.md", "Lien vers [[Idées]] seulement.\n"],
      ["Projets/Mon Notion.md", "Je me cite : [[Mon Notion]]\n"],
    ];
    expect(backlinksTo("Projets/Mon Notion.md", notes, files)).toEqual([
      { path: "Idées.md", excerpt: "Voir le projet demain" },
      { path: "Journal.md", excerpt: "Lien Markdown : projet" },
    ]);
  });

  it("ignores links in code and in mind map data", () => {
    const notes: [string, string][] = [
      ["Code.md", "```\n[[Mon Notion]]\n```\nEt `[[Mon Notion]]`.\n"],
      ["Carte.mindmap.md", '{"topic": "[[Mon Notion]]"}\n'],
    ];
    expect(backlinksTo("Projets/Mon Notion.md", notes, files)).toEqual([]);
  });
});
