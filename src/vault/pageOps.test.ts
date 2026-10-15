import { describe, expect, it } from "vitest";
import { createMemoryVault } from "./vault";
import { deletePage, followFolder, moveFolder, movePage, renameFolder, renamePage, retargetBaseFolders, retargetRowOrder, subpagesOf } from "./pageOps";

function vault() {
  return createMemoryVault("Test", {
    "Index.md": "Voir [[Mon Notion]] et [[Mon Notion/Stack|la stack]].\n",
    "Projets/Mon Notion.md": "Sous-page : [[Stack]]\n",
    "Projets/Mon Notion/Stack.md": "Retour : [parent](../Mon%20Notion.md)\n",
    "Projets/Mon Notion/schema.png": new Uint8Array([1]),
  });
}

describe("renamePage", () => {
  it("moves the note and its sub-pages and updates links everywhere", async () => {
    const v = vault();
    const result = await renamePage(v, "Projets/Mon Notion.md", "FlowNote");
    expect(result.path).toBe("Projets/FlowNote.md");
    expect((await v.files()).sort()).toEqual(["Index.md", "Projets/FlowNote.md", "Projets/FlowNote/Stack.md", "Projets/FlowNote/schema.png"]);
    // "Stack" is unique: Obsidian's shortest form drops the folders.
    expect(await v.read("Index.md")).toBe("Voir [[FlowNote]] et [[Stack|la stack]].\n");
    expect(await v.read("Projets/FlowNote/Stack.md")).toBe("Retour : [parent](../FlowNote.md)\n");
    expect(await v.read("Projets/FlowNote.md")).toBe("Sous-page : [[Stack]]\n");
    expect(result.updatedNotes.sort()).toEqual(["Index.md", "Projets/FlowNote/Stack.md"]);
  });

  it("refuses an existing name and keeps everything as it was", async () => {
    const w = vault();
    await w.create("Projets/Pris.md", "");
    await expect(renamePage(w, "Projets/Mon Notion.md", "Pris")).rejects.toThrow();
    expect(await w.read("Index.md")).toContain("[[Mon Notion]]");
  });

  it("an unchanged title does nothing", async () => {
    const v = vault();
    expect(await renamePage(v, "Index.md", "Index")).toEqual({ path: "Index.md", updatedNotes: [] });
  });
});

describe("deletePage", () => {
  it("removes the page with its sub-pages", async () => {
    const v = vault();
    const files = await v.files();
    expect(subpagesOf("Projets/Mon Notion.md", files)).toEqual(["Projets/Mon Notion/Stack.md"]);
    await deletePage(v, "Projets/Mon Notion.md", files);
    expect(await v.files()).toEqual(["Index.md"]);
  });

  it("removes a base and its rows, and still removes the rows when the base file fails", async () => {
    const v = createMemoryVault("t", { "Livres.base": "filters:\n", "Livres/Dune.md": "a", "Autre.md": "b" });
    await deletePage(v, "Livres.base", await v.files());
    expect(await v.files()).toEqual(["Autre.md"]);

    const w = createMemoryVault("t", { "Livres.base": "filters:\n", "Livres/Dune.md": "a" });
    const files = await w.files();
    const remove = w.remove.bind(w);
    w.remove = async (path) => (path === "Livres.base" ? Promise.reject(new Error("occupé")) : remove(path));
    await expect(deletePage(w, "Livres.base", files)).rejects.toThrow("Livres.base : Error: occupé");
    expect(await w.files()).toEqual(["Livres.base"]);
  });
});

describe("renaming keeps compound extensions", () => {
  it("mind maps and bases keep theirs", async () => {
    const vault = createMemoryVault("t", { "Carte.mindmap.md": "x", "Projets.base": "filters:\n", "Projets/A.md": "a" });
    expect((await renamePage(vault, "Carte.mindmap.md", "Idées")).path).toBe("Idées.mindmap.md");
    expect((await renamePage(vault, "Projets.base", "Clients")).path).toBe("Clients.base");
    expect(await vault.files()).toContain("Clients/A.md");
  });
});

describe("folders", () => {
  it("renames a folder and updates links and base filters", async () => {
    const v = createMemoryVault("Test", {
      "Index.md": "[[Archives/Vieux/Note|note]] et [lien](Archives/Vieux/Note.md)\n",
      "Archives/Vieux/Note.md": "Voir [[Index]]\n",
      "Archives/Suivi.base": 'filters:\n  and:\n    - file.inFolder("Archives/Suivi")\n',
      "Archives/Suivi/Ligne.md": "",
    });
    const result = await renameFolder(v, "Archives", "Classement");
    expect(result.path).toBe("Classement");
    expect((await v.files()).sort()).toEqual(["Classement/Suivi.base", "Classement/Suivi/Ligne.md", "Classement/Vieux/Note.md", "Index.md"]);
    expect(await v.read("Index.md")).toBe("[[Note|note]] et [lien](Classement/Vieux/Note.md)\n");
    expect(await v.read("Classement/Suivi.base")).toContain('file.inFolder("Classement/Suivi")');
    expect(result.updatedNotes.sort()).toEqual(["Classement/Suivi.base", "Index.md"]);
  });

  it("refuses a taken name and creates empty folders shown in the tree", async () => {
    const v = vault();
    await expect(renameFolder(v, "Projets/Mon Notion", "mon notion")).resolves.toMatchObject({ path: "Projets/mon notion" });
    await v.createFolder("Vide/Sous");
    await expect(v.createFolder("Vide")).rejects.toThrow();
    await expect(v.createFolder("Projets")).rejects.toThrow();
    expect((await v.tree()).map((e) => [e.path, e.children?.map((c) => c.path)])).toContainEqual(["Vide", ["Vide/Sous"]]);
    await v.createFolder("Autre");
    await expect(renameFolder(v, "Autre", "vide")).rejects.toThrow("existe déjà");
    await renameFolder(v, "Vide", "Rangé");
    expect((await v.tree()).map((e) => e.path)).toContain("Rangé");
    await v.remove("Rangé");
    expect((await v.tree()).map((e) => e.path)).not.toContain("Rangé");
  });

  it("moves base filters of sub-folders only", () => {
    expect(retargetBaseFolders('file.inFolder("A") or file.inFolder("A/B") or file.inFolder("AB")', "A", "C")).toBe('file.inFolder("C") or file.inFolder("C/B") or file.inFolder("AB")');
  });
});

describe("moving", () => {
  it("moves a page with its sub-pages into a folder; links follow", async () => {
    const v = vault();
    await v.createFolder("Archives");
    const result = await movePage(v, "Projets/Mon Notion.md", "Archives");
    expect(result.path).toBe("Archives/Mon Notion.md");
    expect((await v.files()).sort()).toEqual(["Archives/Mon Notion.md", "Archives/Mon Notion/Stack.md", "Archives/Mon Notion/schema.png", "Index.md"]);
    expect(await v.read("Archives/Mon Notion/Stack.md")).toBe("Retour : [parent](../Mon%20Notion.md)\n");
    expect(await v.read("Index.md")).toBe("Voir [[Mon Notion]] et [[Stack|la stack]].\n");
    await expect(movePage(v, "Archives/Mon Notion.md", "Archives")).resolves.toEqual({ path: "Archives/Mon Notion.md", updatedNotes: [] });
    await v.create("Index/x.md", "");
    await v.create("Archives/Index.md", "");
    await expect(movePage(v, "Index.md", "Archives")).rejects.toThrow("existe déjà");
  });

  it("moves a base with its rows, and its folder filter", async () => {
    const v = createMemoryVault("Test", {
      "Suivi.base": 'filters:\n  and:\n    - file.inFolder("Suivi")\n',
      "Suivi/Ligne.md": "",
      "Classement/Note.md": "",
    });
    await movePage(v, "Suivi.base", "Classement");
    expect((await v.files()).sort()).toEqual(["Classement/Note.md", "Classement/Suivi.base", "Classement/Suivi/Ligne.md"]);
    expect(await v.read("Classement/Suivi.base")).toContain('file.inFolder("Classement/Suivi")');
  });

  it("moves a folder, never into itself", async () => {
    const v = vault();
    await v.createFolder("Archives");
    await expect(moveFolder(v, "Projets", "Projets/Mon Notion")).rejects.toThrow("lui-même");
    const result = await moveFolder(v, "Projets", "Archives");
    expect(result.path).toBe("Archives/Projets");
    expect(await v.read("Index.md")).toBe("Voir [[Mon Notion]] et [[Stack|la stack]].\n");
    expect((await v.files()).sort()).toContain("Archives/Projets/Mon Notion/Stack.md");
    await moveFolder(v, "Archives/Projets", "");
    expect((await v.files()).sort()).toContain("Projets/Mon Notion.md");
  });
});

describe("followFolder", () => {
  it("follows the folder or a parent, and falls back when it is deleted", () => {
    expect(followFolder("Tickets", "Tickets", "Suivi", "Tickets")).toBe("Suivi");
    expect(followFolder("Projets/Tickets", "Projets", "Archives/Projets", "Tickets")).toBe("Archives/Projets/Tickets");
    expect(followFolder("Projets/Tickets", "Proj", "X", "Tickets")).toBe("Projets/Tickets");
    expect(followFolder("Suivi", "Suivi", null, "Tickets")).toBe("Tickets");
    expect(followFolder("", "Suivi", "X", "Tickets")).toBe("");
  });
});

describe("retargetRowOrder", () => {
  const base = 'filters:\n  and:\n    - file.inFolder("Projets")\nviews:\n  - type: table\n    name: Tableau\n    # ordre choisi à la main\n    rowOrder:\n      - Projets/B.md\n      - Projets/A.md\n';

  it("renames the moved notes in the manual order, comments kept", () => {
    const next = retargetRowOrder(base, new Map([["Projets/A.md", "Projets/Alpha.md"]]));
    expect(next).toContain("# ordre choisi à la main");
    expect(next).toContain("- Projets/Alpha.md");
    expect(next).not.toContain("Projets/A.md");
    expect(retargetRowOrder(base, new Map([["Autre.md", "X.md"]]))).toBe(base);
  });

  it("follows a page rename in the vault", async () => {
    const v = createMemoryVault("Test", { "Projets.base": base, "Projets/A.md": "", "Projets/B.md": "" });
    const result = await renamePage(v, "Projets/A.md", "Alpha");
    expect(await v.read("Projets.base")).toContain("- Projets/Alpha.md");
    expect(result.updatedNotes).toContain("Projets.base");
  });
});
