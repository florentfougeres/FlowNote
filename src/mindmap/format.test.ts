import { describe, expect, it } from "vitest";
import { isMindmapPath, newMindmapFile, outline, parseMindmap, serializeMindmap } from "./format";

describe("mind map files", () => {
  it("are notes named .mindmap.md", () => {
    expect(isMindmapPath("Idées/Projet.mindmap.md")).toBe(true);
    expect(isMindmapPath("Projet.md")).toBe(false);
  });

  it("start with a central idea and three branches", () => {
    const file = newMindmapFile("Projet");
    expect(file.startsWith("---\nmindmap-plugin: flownote\ntags: [mindmap]\n---\n\n# Mind map\n\n- Projet\n  - Branche 1\n  - Branche 2\n  - Branche 3\n\n%%\n```json\n")).toBe(true);
    expect(parseMindmap(file).data.nodeData.children?.map((c) => c.topic)).toEqual(["Branche 1", "Branche 2", "Branche 3"]);
  });

  it("read and write back the same file, keeping the text before the map", () => {
    const md = serializeMindmap({
      prefix: "---\nmindmap-plugin: flownote\n---\nMa note libre.\n\n",
      data: { nodeData: { id: "root", topic: "Racine", children: [{ id: "a", topic: "A\nsur deux lignes", children: [{ id: "b", topic: "B" }] }] }, direction: 2, theme: { name: "Latte" } },
      eol: "\n",
    });
    expect(md).toContain("Ma note libre.\n\n# Mind map\n\n- Racine\n  - A sur deux lignes\n    - B\n");
    expect(md).not.toContain("Latte");
    const parsed = parseMindmap(md);
    expect(parsed.prefix).toBe("---\nmindmap-plugin: flownote\n---\nMa note libre.\n\n");
    expect(serializeMindmap(parsed)).toBe(md);
  });

  it("keep Windows line endings", () => {
    const md = newMindmapFile("X").replace(/\n/g, "\r\n");
    const parsed = parseMindmap(md);
    expect(parsed.eol).toBe("\r\n");
    expect(serializeMindmap(parsed)).toBe(md);
  });

  it("open a note without map data as a new map named after it", () => {
    const parsed = parseMindmap("Juste du texte", "Projet");
    expect(parsed.prefix).toBe("Juste du texte\n");
    expect(parsed.data.nodeData.topic).toBe("Projet");
    expect(parseMindmap("# Mind map\n```json\n{oups\n```\n", "Projet").data.nodeData.topic).toBe("Projet");
  });

  it("write a readable outline", () => {
    expect(outline({ id: "r", topic: "", children: [{ id: "a", topic: "  A  " }] })).toEqual(["- …", "  - A"]);
  });
});
