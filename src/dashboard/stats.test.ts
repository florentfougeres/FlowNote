import { describe, expect, it } from "vitest";
import { bookmarkedFiles, computeStats, noteAliases, tagTree } from "./stats";

const notes: [string, string][] = [
  ["Accueil.md", "---\ntags: [projet, perso]\n---\nVoir [[Projets]] et [[Absente]] et [lien](Dossier/Note.md). #idee\n\n```\n[[Pas un lien]] #pasuntag\n```\n"],
  ["Projets.md", "# Projets\n\n#projet #idee/produit et `#code`\n"],
  ["Dossier/Note.md", "---\ntags:\n  - perso\n---\nRetour vers [[Accueil]].\n"],
  ["Seule.md", "Personne ne me cite.\n"],
  ["Croquis.excalidraw.md", '---\nexcalidraw-plugin: parsed\n---\n%%\n## Drawing\n```json\n{"x": "[[Inexistant]]"}\n```\n%%'],
];
const files = notes.map(([p]) => p);

describe("dashboard statistics", () => {
  it("counts pages, tags, broken links and orphans", () => {
    const stats = computeStats(notes, files);
    expect(stats.notes).toBe(4);
    expect(stats.drawings).toBe(1);
    expect(stats.tagCount).toBe(4);
    expect(Object.fromEntries(stats.tags)).toEqual({ projet: 2, perso: 2, idee: 1, "idee/produit": 1 });
    // Property tags and text tags alike, each page once.
    expect(stats.tagPages.perso).toEqual(["Accueil.md", "Dossier/Note.md"]);
    expect(stats.tagPages.projet).toEqual(["Accueil.md", "Projets.md"]);
    expect(stats.brokenLinks).toEqual([{ from: "Accueil.md", target: "Absente" }]);
    expect(stats.orphans).toEqual(["Croquis.excalidraw.md", "Seule.md"]);
  });

  it("reads Obsidian bookmarks, groups included", () => {
    const json = JSON.stringify({ items: [{ type: "file", path: "A.md" }, { type: "group", title: "G", items: [{ type: "file", path: "B.md" }, { type: "search", query: "x" }] }] });
    expect(bookmarkedFiles(json)).toEqual(["A.md", "B.md"]);
    expect(bookmarkedFiles("{}")).toEqual([]);
    expect(bookmarkedFiles("pas du json")).toEqual([]);
  });
});

describe("aliases", () => {
  it("reads the aliases property in its three forms", () => {
    expect(noteAliases("---\naliases: [Chantiers, \"Mes projets\"]\n---\n")).toEqual(["Chantiers", "Mes projets"]);
    expect(noteAliases("---\naliases:\n  - Chantiers\n  - Mes projets\n---\n")).toEqual(["Chantiers", "Mes projets"]);
    expect(noteAliases("---\nalias: Mes projets, Chantiers\n---\n")).toEqual(["Mes projets", "Chantiers"]);
    expect(noteAliases("Pas de propriétés")).toEqual([]);
  });
});

describe("tag tree", () => {
  it("nests tags on /, counting the notes of each tag and its nested ones", () => {
    const tree = tagTree([
      ["A.md", "#projet/site et #Projet/logo"],
      ["B.md", "---\ntags: [projet, perso]\n---\n#projet/site"],
      ["C.md", "`#code` seulement"],
    ]);
    expect(tree).toEqual([
      { name: "perso", tag: "perso", count: 1, children: [] },
      {
        name: "projet",
        tag: "projet",
        count: 2,
        children: [
          { name: "logo", tag: "projet/logo", count: 1, children: [] },
          { name: "site", tag: "projet/site", count: 2, children: [] },
        ],
      },
    ]);
  });
});
