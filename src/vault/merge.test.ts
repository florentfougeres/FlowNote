import { describe, expect, it } from "vitest";
import { createMemoryVault } from "./vault";
import { mergePage, mergedText, mergedTitle } from "./merge";

describe("mergedText", () => {
  it("adds the text under a heading, its headings one level down", () => {
    const source = "# Idées\n\nUne idée.\n\n## Détail\n\n```md\n# pas un titre\n```\n";
    expect(mergedTitle(source, "idees")).toBe("Idées");
    expect(mergedText("# Projet\n\nTexte.\n", source, "Idées")).toBe("# Projet\n\nTexte.\n\n## Idées\n\nUne idée.\n\n### Détail\n\n```md\n# pas un titre\n```\n");
  });

  it("joins the properties, keeping the target's", () => {
    const target = "---\ntags: [projet]\nstatut: en cours\n---\n# B\n";
    const source = "---\ntags: [projet, site]\nstatut: fini\nclient: Maison Pain\n---\nTexte\n";
    expect(mergedText(target, source, "A")).toBe("---\ntags: [projet, site]\nstatut: en cours\nclient: Maison Pain\n---\n# B\n\n## A\n\nTexte\n");
  });

  it("gives the target properties when it had none", () => {
    expect(mergedText("Texte B\n", "---\nclient: Les Mots\n---\nTexte A\n", "A")).toBe("---\nclient: Les Mots\n---\nTexte B\n\n## A\n\nTexte A\n");
  });

  it("leaves the target's properties as written when the source has none", () => {
    expect(mergedText("---\na:   1\n---\n", "Texte", "A")).toBe("---\na:   1\n---\n## A\n\nTexte\n");
  });
});

describe("mergePage", () => {
  it("merges, points the links to the new heading and removes the note", async () => {
    const v = createMemoryVault("t", {
      "Projets/Site.md": "# Site\n\nVoir [[Projet]] et [le devis](../devis.md).\n",
      "Projet.md": "# Projet\n\nLié à [[Site]].\n",
      "Index.md": "[[Site]], [[Site#Plan|le plan]], ![[Site]] et [site](Projets/Site.md).\n",
      "devis.md": "",
    });
    const result = await mergePage(v, "Projets/Site.md", "Projet.md");
    expect((await v.files()).sort()).toEqual(["Index.md", "Projet.md", "devis.md"]);
    expect(await v.read("Projet.md")).toBe("# Projet\n\nLié à [[Projet#Site|Site]].\n\n## Site\n\nVoir [[Projet]] et [le devis](devis.md).\n");
    expect(await v.read("Index.md")).toBe("[[Projet#Site|Site]], [[Projet#Plan|le plan]], ![[Projet#Site]] et [site](Projet.md#Site).\n");
    expect(result.updatedNotes.sort()).toEqual(["Index.md", "Projet.md"]);
  });

  it("refuses a note with sub-pages", async () => {
    const v = createMemoryVault("t", { "A.md": "", "A/B.md": "", "C.md": "" });
    await expect(mergePage(v, "A.md", "C.md")).rejects.toThrow("sous-pages");
  });
});
