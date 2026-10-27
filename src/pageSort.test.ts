import { describe, expect, it } from "vitest";
import { sortPages } from "./pageSort";

const items = [
  { path: "Zoé.md", label: "Zoé" },
  { path: null, label: "Archives" },
  { path: "Note 10.md", label: "Note 10" },
  { path: "Note 2.md", label: "Note 2" },
  { path: null, label: "Clients" },
];
const times = new Map([
  ["Zoé.md", { ctime: 1, mtime: 30 }],
  ["Note 10.md", { ctime: 3, mtime: 10 }],
  ["Note 2.md", { ctime: 2, mtime: 20 }],
]);
const labels = (sort: Parameters<typeof sortPages>[1]) => sortPages(items, sort, times).map((i) => i.label);

describe("sortPages", () => {
  it("puts folders first and sorts names with numbers in order", () => {
    expect(labels("name-asc")).toEqual(["Archives", "Clients", "Note 2", "Note 10", "Zoé"]);
    expect(labels("name-desc")).toEqual(["Clients", "Archives", "Zoé", "Note 10", "Note 2"]);
  });

  it("sorts pages by their file times, folders staying by name", () => {
    expect(labels("mtime-desc")).toEqual(["Archives", "Clients", "Zoé", "Note 2", "Note 10"]);
    expect(labels("ctime-asc")).toEqual(["Archives", "Clients", "Zoé", "Note 2", "Note 10"]);
    expect(labels("ctime-desc")).toEqual(["Archives", "Clients", "Note 10", "Note 2", "Zoé"]);
  });
});
