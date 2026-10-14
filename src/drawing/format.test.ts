import { describe, expect, it } from "vitest";
import { compressScene, drawingName, isDrawingPath, newDrawingFile, parseDrawing, serializeDrawing } from "./format";

const rect = { id: "r1", type: "rectangle", x: 0, y: 0, width: 10, height: 10 };
const label = { id: "t1", type: "text", text: "Bonjour\nmonde", originalText: "Bonjour\nmonde", x: 0, y: 0 };
const image = { id: "i1", type: "image", fileId: "abc123", x: 0, y: 0 };

/** A file as the Obsidian plugin writes it (compressed drawing data). */
function pluginFile(elements: unknown[]): string {
  const json = JSON.stringify({ type: "excalidraw", version: 2, source: "https://github.com/zsviczian/obsidian-excalidraw-plugin", elements, appState: { viewBackgroundColor: "#ffffff", gridSize: null, scrollX: 120, zoom: { value: 2 } }, files: {} });
  const compressed = compressScene(json).replace(/(.{64})/g, "$1\n");
  return [
    "---",
    "",
    "excalidraw-plugin: parsed",
    "tags: [excalidraw]",
    "",
    "---",
    "Notes au dos du dessin.",
    "",
    "# Excalidraw Data",
    "",
    "## Text Elements",
    "Bonjour",
    "monde ^t1",
    "",
    "## Embedded Files",
    "abc123: [[Pièces jointes/photo.png]]",
    "",
    "%%",
    "## Drawing",
    "```compressed-json",
    compressed,
    "```",
    "%%",
  ].join("\n");
}

describe("drawing files (.excalidraw.md)", () => {
  it("recognises drawing paths", () => {
    expect(isDrawingPath("Dossier/Schéma.excalidraw.md")).toBe(true);
    expect(isDrawingPath("Note.md")).toBe(false);
    expect(drawingName("Dossier/Schéma.excalidraw.md")).toBe("Schéma");
  });

  it("reads files written by the Obsidian plugin, compressed or not", () => {
    const file = parseDrawing(pluginFile([rect, label, image]));
    expect(file.compressed).toBe(true);
    expect(file.scene.elements.map((e) => e.id)).toEqual(["r1", "t1", "i1"]);
    expect(file.embedded.get("abc123")).toBe("Pièces jointes/photo.png");
    expect(file.prefix).toContain("Notes au dos du dessin.");
    const again = parseDrawing(serializeDrawing(file));
    expect(again.compressed).toBe(false);
    expect(again.scene.elements).toEqual(file.scene.elements);
  });

  it("writes text elements, embedded files and the scene, without view state or deleted elements", () => {
    const file = parseDrawing(pluginFile([rect, label, image, { id: "gone", type: "ellipse", isDeleted: true }]));
    const out = serializeDrawing(file);
    expect(out.startsWith("---\n\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n\n---\nNotes au dos du dessin.\n\n# Excalidraw Data\n")).toBe(true);
    expect(out).toContain("## Text Elements\nBonjour\nmonde ^t1\n");
    expect(out).toContain("## Embedded Files\nabc123: [[Pièces jointes/photo.png]]\n");
    expect(out).toMatch(/%%\n## Drawing\n```json\n\{[\s\S]*\}\n```\n%%$/);
    expect(out).not.toContain("gone");
    expect(out).not.toContain("scrollX");
  });

  it("drops embedded files no longer used, keeps CRLF line endings", () => {
    const file = parseDrawing(pluginFile([rect, image]).replace(/\n/g, "\r\n"));
    file.scene.elements = [rect];
    const out = serializeDrawing(file);
    expect(out).not.toContain("Embedded Files");
    expect(out.includes("\r\n")).toBe(true);
    expect(out.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });

  it("a new drawing is a valid, empty plugin file", () => {
    const text = newDrawingFile();
    expect(text).toContain("excalidraw-plugin: parsed");
    expect(parseDrawing(text).scene.elements).toEqual([]);
  });

  it("refuses a file without drawing data", () => {
    expect(() => parseDrawing("# Juste une note\n")).toThrow(/données de dessin/);
  });
});
