import { describe, expect, it } from "vitest";
import { dayOf, formatDateValue, monthGrid, parseTypedDate } from "./DatePicker";
import { isoDay } from "./dates";

describe("date picker", () => {
  it("reads the values written in the files", () => {
    expect(isoDay(dayOf("2026-10-15")!)).toBe("2026-10-15");
    expect(isoDay(dayOf("2026-10-15T09:30")!)).toBe("2026-10-15");
    expect(dayOf("demain")).toBeNull();
  });

  it("understands typed dates", () => {
    const today = new Date(2026, 9, 15, 12);
    expect(isoDay(parseTypedDate("17/10/2026", today)!)).toBe("2026-10-17");
    expect(isoDay(parseTypedDate("3/2", today)!)).toBe("2026-02-03");
    expect(isoDay(parseTypedDate("01.12.27", today)!)).toBe("2027-12-01");
    expect(parseTypedDate("31/02/2026", today)).toBeNull();
  });

  it("shows six weeks starting on Monday", () => {
    const days = monthGrid(new Date(2026, 9, 1));
    expect(days).toHaveLength(42);
    expect(isoDay(days[0])).toBe("2026-09-28");
    expect(days[0].getDay()).toBe(1);
  });

  it("formats with the time when there is one", () => {
    expect(formatDateValue("2026-10-15T09:30")).toMatch(/15 oct\. 2026 · 09:30$/);
  });
});
