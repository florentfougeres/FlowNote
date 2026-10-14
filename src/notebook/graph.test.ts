import { describe, expect, it } from "vitest";
import { dependencyGraph, descendants, undefinedNames } from "./graph";

const cells = [
  { id: "imports", defs: ["pl"], refs: [] },
  { id: "data", defs: ["ventes"], refs: ["pl"] },
  { id: "sql", defs: ["par_mois"], refs: ["ventes"] },
  { id: "chart", defs: [], refs: ["par_mois", "plt"] },
  { id: "other", defs: ["x"], refs: [] },
];

describe("cell dependency graph (groundwork for reactivity)", () => {
  it("links a cell to the cells reading what it defines", () => {
    const graph = dependencyGraph(cells);
    expect([...graph.get("imports")!]).toEqual(["data"]);
    expect([...graph.get("data")!]).toEqual(["sql"]);
    expect([...graph.get("other")!]).toEqual([]);
  });

  it("lists the cells to re-run, in document order", () => {
    expect(descendants(cells, "imports")).toEqual(["data", "sql", "chart"]);
    expect(descendants(cells, "sql")).toEqual(["chart"]);
    expect(descendants(cells, "other")).toEqual([]);
  });

  it("a redefined name goes to the closest earlier definition", () => {
    const redefined = [
      { id: "a", defs: ["x"], refs: [] },
      { id: "b", defs: ["x"], refs: [] },
      { id: "c", defs: [], refs: ["x"] },
    ];
    expect(descendants(redefined, "b")).toEqual(["c"]);
    expect(descendants(redefined, "a")).toEqual([]);
  });

  it("reports names no cell defines", () => {
    expect(undefinedNames(cells, "chart")).toEqual(["plt"]);
  });
});
