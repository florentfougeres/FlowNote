import { describe, expect, it } from "vitest";
import { backlinksTo } from "./backlinks";

const files = ["Projets/Mon Carnet.md", "Idées.md", "Journal.md", "Code.md", "Carte.mindmap.md", "Autre.md"];

describe("backlinksTo", () => {
  it("lists the notes linking to a page, with the line of the link", () => {
    const notes: [string, string][] = [
      ["Idées.md", "---\ntags: [x]\n---\n# Idées\n\n- Voir **[[Mon Carnet|le projet]]** demain\n"],
      ["Journal.md", "Rien ici.\n\n> Lien Markdown : [projet](Projets/Mon%20Carnet.md)\n"],
      ["Autre.md", "Lien vers [[Idées]] seulement.\n"],
      ["Projets/Mon Carnet.md", "Je me cite : [[Mon Carnet]]\n"],
    ];
    expect(backlinksTo("Projets/Mon Carnet.md", notes, files)).toEqual([
      { path: "Idées.md", excerpt: "Voir le projet demain" },
      { path: "Journal.md", excerpt: "Lien Markdown : projet" },
    ]);
  });

  it("ignores links in code and in mind map data", () => {
    const notes: [string, string][] = [
      ["Code.md", "```\n[[Mon Carnet]]\n```\nEt `[[Mon Carnet]]`.\n"],
      ["Carte.mindmap.md", '{"topic": "[[Mon Carnet]]"}\n'],
    ];
    expect(backlinksTo("Projets/Mon Carnet.md", notes, files)).toEqual([]);
  });
});
