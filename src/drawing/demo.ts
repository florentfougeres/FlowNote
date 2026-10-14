import { newDrawingFile, parseDrawing, serializeDrawing, type SceneElement } from "./format";

/** A small drawing for the demo vault. */
export function demoDrawing(): string {
  const base = { angle: 0, strokeColor: "#1e1e1e", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: { type: 3 }, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false, version: 1, versionNonce: 1 };
  const box = (id: string, x: number, color: string, seed: number): SceneElement => ({ ...base, id, type: "rectangle", x, y: 80, width: 180, height: 90, backgroundColor: color, seed });
  const text = (id: string, x: number, value: string, seed: number): SceneElement => ({
    ...base,
    id,
    type: "text",
    x,
    y: 112,
    width: 140,
    height: 25,
    backgroundColor: "transparent",
    roundness: null,
    seed,
    text: value,
    originalText: value,
    fontSize: 20,
    fontFamily: 5,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: null,
    lineHeight: 1.25,
    autoResize: true,
  });
  const arrow: SceneElement = { ...base, id: "fleche", type: "arrow", x: 290, y: 125, width: 110, height: 0, backgroundColor: "transparent", roundness: { type: 2 }, seed: 7, points: [[0, 0], [110, 0]], startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: "arrow", lastCommittedPoint: null };
  const file = parseDrawing(newDrawingFile());
  file.scene.elements = [box("idee", 100, "#ffec99", 1), text("idee-texte", 120, "Une idée", 2), arrow, box("note", 410, "#a5d8ff", 3), text("note-texte", 430, "Une note", 4)];
  return serializeDrawing(file);
}
