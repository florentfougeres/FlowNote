import { describe, expect, it } from "vitest";
import { newDashboardFile, parseDashboard, serializeDashboard, settle } from "./format";

describe("dashboard format", () => {
  it("round-trips a file byte for byte", () => {
    const text = newDashboardFile();
    expect(serializeDashboard(parseDashboard(text))).toBe(text);
  });
  it("keeps unknown keys and ignores ## inside code", () => {
    const text = "---\ntags: [a]\nflownote-dashboard:\n  A: [0, 0, 4, 3]\n---\n## A\n```\n## pas un titre\n```\n## B\nx\n";
    const board = parseDashboard(text);
    expect(board.widgets.map((w) => w.title)).toEqual(["A", "B"]);
    expect(board.widgets[0]).toMatchObject({ x: 0, y: 0, w: 4, h: 3 });
    expect(serializeDashboard(board)).toContain("tags: [a]");
  });
  it("settles overlapping widgets", () => {
    const w = (y: number) => ({ title: "", body: "", x: 0, y, w: 6, h: 2 });
    expect(settle([w(0), w(1)], 1).map((x) => x.y)).toEqual([3, 1]);
  });
});
