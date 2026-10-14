import { describe, expect, it } from "vitest";
import type { TicketInfo } from "./agenda";
import { applyChange, boardColumns, DEFAULT_COLUMNS, normalizeColumns, planMove, statusFor } from "./board";

const ticket = (path: string, column: string, order: number | null, extra: Partial<TicketInfo> = {}): TicketInfo => ({
  path,
  id: Number(path.match(/\d+/)?.[0] ?? 0),
  title: path,
  status: column === "closed" ? "closed" : "open",
  column,
  order,
  tags: [],
  due: null,
  created: null,
  closed: null,
  comments: 0,
  tasks: { done: 0, total: 0 },
  ...extra,
});

describe("ticket board", () => {
  it("keeps open first and closed last, whatever the settings say", () => {
    expect(normalizeColumns([{ status: "review", label: "En revue" }, { status: "closed", label: "Fini" }])).toEqual([
      { status: "open", label: "À faire" },
      { status: "review", label: "En revue" },
      { status: "closed", label: "Fini" },
    ]);
    expect(statusFor("En revue", DEFAULT_COLUMNS)).toBe("en-revue");
    expect(statusFor("En cours", [...DEFAULT_COLUMNS, { status: "en-cours", label: "x" }])).toBe("en-cours-2");
  });

  it("puts each ticket in its column, ordered by hand then by due date", () => {
    const columns = boardColumns(
      [ticket("1.md", "open", null, { due: "2026-10-20" }), ticket("2.md", "open", 2), ticket("3.md", "open", 1), ticket("4.md", "closed", null), ticket("5.md", "unknown", null), ticket("6.md", "in-progress", null)],
      DEFAULT_COLUMNS,
    );
    expect(columns.map((c) => c.map((t) => t.path))).toEqual([["3.md", "2.md", "1.md", "5.md"], ["6.md"], ["4.md"]]);
  });

  it("moving a card between two ordered ones rewrites that ticket only", () => {
    const cards = [ticket("1.md", "open", 1), ticket("2.md", "open", 2)];
    expect(planMove(ticket("9.md", "in-progress", 5), "open", cards, 1)).toEqual([{ path: "9.md", status: "open", order: 1.5 }]);
    expect(planMove(ticket("9.md", "open", 5), "open", cards, 2)).toEqual([{ path: "9.md", order: 3 }]);
    expect(planMove(ticket("9.md", "open", 5), "open", cards, 0)).toEqual([{ path: "9.md", order: 0 }]);
    expect(planMove(ticket("9.md", "open", null), "closed", [], 0)).toEqual([{ path: "9.md", status: "closed", order: 1 }]);
  });

  it("renumbers the column when the neighbours have no order or no room is left", () => {
    expect(planMove(ticket("9.md", "open", null), "open", [ticket("1.md", "open", null), ticket("2.md", "open", 2)], 1)).toEqual([
      { path: "1.md", order: 1 },
      { path: "9.md", order: 2 },
      { path: "2.md", order: 3 },
    ]);
    const tight = [ticket("1.md", "open", 1), ticket("2.md", "open", 1.0001)];
    expect(planMove(ticket("9.md", "open", 4), "open", tight, 1).map((c) => [c.path, c.order])).toEqual([
      ["9.md", 2],
      ["2.md", 3],
    ]);
  });

  it("writes status, closing date and order, keeping the rest of the file", () => {
    const md = "---\ntype: ticket\nid: 3\nstatus: open\ntags: [bug]\n---\n\nTexte.\n";
    const now = new Date(2026, 9, 14, 21, 5);
    expect(applyChange(md, { path: "3.md", status: "in-progress", order: 2 }, now)).toBe("---\ntype: ticket\nid: 3\nstatus: in-progress\ntags: [bug]\norder: 2\n---\n\nTexte.\n");
    const closed = applyChange(md, { path: "3.md", status: "closed", order: 1.5 }, now);
    expect(closed).toBe("---\ntype: ticket\nid: 3\nstatus: closed\ntags: [bug]\nclosed: 2026-10-14T21:05\norder: 1.5\n---\n\nTexte.\n");
    expect(applyChange(closed, { path: "3.md", status: "open", order: 1 }, now)).toBe("---\ntype: ticket\nid: 3\nstatus: open\ntags: [bug]\norder: 1\n---\n\nTexte.\n");
    const crlf = "---\r\ntype: ticket\r\nstatus: open\r\n---\r\nTexte\r\n";
    expect(applyChange(crlf, { path: "x.md", order: 4 }, now)).toBe("---\r\ntype: ticket\r\nstatus: open\r\norder: 4\r\n---\r\nTexte\r\n");
  });
});
