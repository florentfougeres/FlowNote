import { describe, expect, it } from "vitest";
import { dayOf, monthGrid, moveToDay } from "./CalendarView";
import { coverOf } from "./GalleryView";
import { baseOfNote, baseProperties } from "./RowProperties";
import { parseBase } from "./baseFile";
import type { BaseRow } from "./rows";

const row = (values: BaseRow["values"], image: string | null = null): BaseRow => ({ path: "P/a.md", name: "a", values, image, file: { name: "a", path: "P/a.md", folder: "P", ctime: null, mtime: null, tags: [], links: 0 } });

describe("calendar", () => {
  it("reads the day of dates and date-times", () => {
    expect(dayOf("2026-10-14")).toBe("2026-10-14");
    expect(dayOf("2026-10-14T09:30")).toBe("2026-10-14");
    expect(dayOf("demain")).toBeNull();
    expect(dayOf(null)).toBeNull();
  });
  it("moves a date and keeps its time", () => {
    expect(moveToDay("2026-10-14T09:30", "2026-10-20")).toBe("2026-10-20T09:30");
    expect(moveToDay(undefined, "2026-10-20")).toBe("2026-10-20");
  });
  it("lays a month out in weeks from Monday", () => {
    const weeks = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(weeks[0][0].getDate()).toBe(28);
    expect(weeks[0][3].getDate()).toBe(1);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.length).toBe(5);
  });
});

describe("gallery covers", () => {
  it("reads wikilinks, Markdown images and URLs", () => {
    expect(coverOf(row({ cover: "[[photo.png]]" }), "cover")).toBe("photo.png");
    expect(coverOf(row({ cover: "![[photo.png|300]]" }), "cover")).toBe("photo.png");
    expect(coverOf(row({ cover: "https://x.org/a.jpg" }), "cover")).toBe("https://x.org/a.jpg");
    expect(coverOf(row({}, "img/a.png"), null)).toBe("img/a.png");
    expect(coverOf(row({}), "cover")).toBeNull();
  });
});

describe("rows of a base", () => {
  const base = (folder: string) => ({ path: `${folder}.base`, model: parseBase(`filters:\n  and:\n    - file.inFolder("${folder}")\nviews:\n  - type: table\n    name: T\n    order:\n      - file.name\n      - statut\n      - formula.x\n`).model });
  it("finds the deepest base holding a note", () => {
    const bases = [base("Projets"), base("Projets/Archives")];
    expect(baseOfNote("Projets/a.md", bases)?.path).toBe("Projets.base");
    expect(baseOfNote("Projets/Archives/b.md", bases)?.path).toBe("Projets/Archives.base");
    expect(baseOfNote("Autre/c.md", bases)).toBeNull();
    expect(baseOfNote("Projets/dessin.excalidraw.md", bases)?.path).toBe("Projets.base");
  });
  it("lists the note properties of its views", () => {
    expect(baseProperties(base("Projets").model)).toEqual(["statut"]);
  });
});
