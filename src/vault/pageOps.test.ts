import { describe, expect, it } from "vitest";
import { createMemoryVault } from "./vault";
import { deletePage, renamePage, subpagesOf } from "./pageOps";

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
