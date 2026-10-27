import { describe, expect, it } from "vitest";
import { cardsCenter, cloneCards, colorValue, facingSide, newCanvasId, parseCanvas, pickCards, serializeCanvas } from "./format";

/** A canvas as Obsidian 1.14 writes it. */
const OBSIDIAN = `{
	"nodes":[
		{"id":"g1","x":-40,"y":-40,"width":700,"height":400,"type":"group","label":"Projet"},
		{"id":"a1","x":0,"y":0,"width":250,"height":60,"color":"4","type":"text","text":"# Idée\\n\\nUne **carte**"},
		{"id":"b2","x":400,"y":0,"width":400,"height":400,"type":"file","file":"Projets/Site.md","subpath":"#Plan"},
		{"id":"c3","x":0,"y":200,"width":400,"height":300,"type":"link","url":"https://obsidian.md"}
	],
	"edges":[
		{"id":"e1","fromNode":"a1","fromSide":"right","toNode":"b2","toSide":"left","label":"détaille"},
		{"id":"e2","fromNode":"a1","fromSide":"bottom","toNode":"c3","toSide":"top","fromEnd":"arrow","toEnd":"none","color":"#ff0000"}
	]
}`;

describe("canvas files", () => {
  it("writes back a canvas from Obsidian byte for byte", () => {
    const data = parseCanvas(OBSIDIAN)!;
    expect(data.nodes.map((n) => n.type)).toEqual(["group", "text", "file", "link"]);
    expect(data.edges[1].toEnd).toBe("none");
    expect(serializeCanvas(data)).toBe(OBSIDIAN);
  });

  it("keeps unknown keys and writes keys in Obsidian's order", () => {
    const data = parseCanvas('{"nodes":[{"type":"text","text":"x","id":"n","plugin":{"a":1},"x":1.6,"y":2,"width":3,"height":4}],"edges":[],"version":"1.0"}')!;
    data.nodes[0].color = "2";
    expect(serializeCanvas(data)).toBe(
      ["{", '\t"nodes":[', "\t\t{", '\t\t\t"plugin":{"a":1},', '\t\t\t"id":"n",', '\t\t\t"x":2,', '\t\t\t"y":2,', '\t\t\t"width":3,', '\t\t\t"height":4,', '\t\t\t"color":"2",', '\t\t\t"type":"text",', '\t\t\t"text":"x"', "\t\t}", "\t],", '\t"edges":[],', '\t"version":"1.0"', "}"].join("\n"),
    );
  });

  it("reads empty, partial and broken files", () => {
    expect(parseCanvas("")).toEqual({ nodes: [], edges: [] });
    expect(parseCanvas("pas du json")).toBeNull();
    expect(serializeCanvas({ nodes: [], edges: [] })).toBe('{\n\t"nodes":[],\n\t"edges":[]\n}');
    // Arrows to missing cards are dropped; missing sides face the other card.
    const data = parseCanvas('{"nodes":[{"id":"a","type":"text","text":"","x":0,"y":0,"width":100,"height":50},{"id":"b","type":"text","text":"","x":300,"y":0,"width":100,"height":50}],"edges":[{"id":"e","fromNode":"a","toNode":"b"},{"id":"f","fromNode":"a","toNode":"z"}]}')!;
    expect(data.edges).toEqual([{ id: "e", fromNode: "a", toNode: "b", fromSide: "right", toSide: "left" }]);
  });

  it("knows colors, sides and ids", () => {
    expect(colorValue("4")).toBe("#44cf6e");
    expect(colorValue("#abc")).toBe("#abc");
    expect(colorValue("rouge")).toBeNull();
    const at = (x: number, y: number) => ({ id: "", type: "text" as const, x, y, width: 100, height: 100 });
    expect(facingSide(at(0, 0), at(0, 300))).toBe("bottom");
    expect(facingSide(at(0, 0), at(-300, 0))).toBe("left");
    expect(newCanvasId()).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("copied cards", () => {
  const data = parseCanvas(OBSIDIAN)!;

  it("copies the cards with the arrows between them only", () => {
    const picked = pickCards(data, ["a1", "b2"]);
    expect(picked.nodes.map((n) => n.id)).toEqual(["a1", "b2"]);
    expect(picked.edges.map((e) => e.id)).toEqual(["e1"]);
  });

  it("pastes copies with new ids around a point, arrows following", () => {
    const picked = pickCards(data, ["a1", "b2"]);
    const copies = cloneCards(picked, { x: 1000, y: 1000 });
    expect(copies.nodes.every((n) => !["a1", "b2"].includes(n.id))).toBe(true);
    expect(cardsCenter(copies.nodes)).toEqual({ x: 1000, y: 1000 });
    expect(copies.nodes[0]).toMatchObject({ type: "text", text: "# Idée\n\nUne **carte**", width: 250 });
    expect(copies.edges[0]).toMatchObject({ fromNode: copies.nodes[0].id, toNode: copies.nodes[1].id, label: "détaille" });
    expect(copies.edges[0].id).not.toBe("e1");
  });
});
