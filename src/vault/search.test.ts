import { describe, expect, it } from "vitest";
import { createMemoryVault } from "./vault";
import { matchesIn, searchVault } from "./search";

describe("vault search", () => {
  it("finds every occurrence, case-insensitive by default", async () => {
    const vault = createMemoryVault("t", { "A.md": "Un projet\nautre ligne\nProjet et projet", "B/C.md": "rien", "img.png": "projet" });
    const hits = await searchVault(vault, "projet");
    expect(hits.map((h) => [h.path, h.line, h.from])).toEqual([
      ["A.md", 0, 3],
      ["A.md", 2, 0],
      ["A.md", 2, 10],
    ]);
    expect(await searchVault(vault, "Projet", true)).toHaveLength(1);
    expect(await searchVault(vault, "  ")).toEqual([]);
  });

  it("matches accents literally", () => {
    expect(matchesIn("Idées et idees", "idées", false)).toEqual([[0, 5]]);
  });

  it("finds the words of a drawing, not its data", async () => {
    const vault = createMemoryVault("Test", {
      "Croquis.excalidraw.md": '---\nexcalidraw-plugin: parsed\n---\n==⚠ Dessin FlowNote / Excalidraw ==\n\n## Text Elements\nUne note ^abc\n\n%%\n```json\n{\n  "text": "Une note",\n  "id": "note"\n}\n```\n%%\n',
    });
    const hits = await searchVault(vault, "note");
    expect(hits.map((h) => h.text)).toEqual(["Une note ^abc"]);
  });
});
