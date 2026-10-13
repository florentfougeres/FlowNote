import { describe, expect, it } from "vitest";
import { relativeDate } from "./HistoryPanel";

describe("relativeDate", () => {
  it("formats dates relative to now, in French", () => {
    const now = new Date("2026-10-13T12:00:00Z").getTime();
    expect(relativeDate("2026-10-13T11:59:30Z", now)).toBe("à l'instant");
    expect(relativeDate("2026-10-13T09:00:00Z", now)).toBe("il y a 3 heures");
    expect(relativeDate("2026-10-12T12:00:00Z", now)).toBe("hier");
  });
});
