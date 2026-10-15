import { describe, expect, it } from "vitest";
import { backlinksTo, linkMention, unlinkedMentions } from "./backlinks";

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

describe("unlinkedMentions", () => {
  const notes: [string, string][] = [
    ["Idées.md", "---\ntitle: Mon Notion\n---\nJ'avance sur mon notion ce soir.\n"],
    ["Journal.md", "Déjà lié : [[Mon Notion]], puis Mon Notion encore.\n"],
    ["Code.md", "`Mon Notion` et https://x.fr/Mon-Notion et MonNotionnel.\n"],
    ["Autre.md", "- Revoir **Mon Notion** demain\n"],
  ];

  it("finds the title as a whole word in prose, not in links, code or front matter", () => {
    const mentions = unlinkedMentions("Projets/Mon Notion.md", notes, files);
    expect(mentions.map((m) => [m.path, m.excerpt, m.found])).toEqual([
      ["Autre.md", "Revoir Mon Notion demain", "Mon Notion"],
      ["Idées.md", "J'avance sur mon notion ce soir.", "mon notion"],
    ]);
  });

  it("turns a mention into a link, with an alias when the case differs", () => {
    const [autre, idees] = unlinkedMentions("Projets/Mon Notion.md", notes, files);
    expect(linkMention(notes[3][1], autre, "Mon Notion")).toBe("- Revoir **[[Mon Notion]]** demain\n");
    expect(linkMention(notes[0][1], idees, "Mon Notion")).toBe("---\ntitle: Mon Notion\n---\nJ'avance sur [[Mon Notion|mon notion]] ce soir.\n");
    expect(linkMention("Texte changé", autre, "Mon Notion")).toBeNull();
  });
});
