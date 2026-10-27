import { describe, expect, it } from "vitest";
import { DEFAULT_TASK_CONFIG as C } from "./config";
import { frontmatterValues, taskInfo } from "./task";
import { occurrences, recurrenceText, setRecurrence, toggleOccurrence } from "./recurrence";

const TASK = `---
status: open
priority: normal
scheduled: 2026-10-19
due: 2026-10-20
recurrence: DTSTART:20261019;FREQ=WEEKLY;BYDAY=MO
dateCreated: 2026-10-01T09:00:00.000+02:00
tags:
  - task
---

Arroser les plantes.
`;
const info = (text: string) => taskInfo("T/Arroser.md", text, C);

describe("recurring tasks", () => {
  it("lists the occurrences in a range", () => {
    expect(occurrences(info(TASK), "2026-10-15", "2026-11-05")).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
  });

  it("completes an occurrence like TaskNotes: next scheduled and due, the rest kept", () => {
    const now = new Date(2026, 9, 19, 10, 0);
    const done = toggleOccurrence(TASK, info(TASK), "2026-10-19", C, now);
    const v = frontmatterValues(done);
    expect(v.complete_instances).toEqual(["2026-10-19"]);
    expect(v.scheduled).toBe("2026-10-26");
    expect(v.due).toBe("2026-10-27");
    expect(v.status).toBe("open");
    expect(done).not.toContain("completedDate");
    expect(done.endsWith("\nArroser les plantes.\n")).toBe(true);
    // Undone: the occurrence is to do again.
    const undone = toggleOccurrence(done, info(done), "2026-10-19", C, now);
    expect(frontmatterValues(undone).complete_instances).toEqual([]);
    expect(frontmatterValues(undone).scheduled).toBe("2026-10-19");
  });

  it("sets and removes a rule", () => {
    const now = new Date(2026, 9, 27, 8, 0);
    const plain = "---\nstatus: open\ntags: [task]\n---\n";
    const weekly = setRecurrence(plain, "FREQ=WEEKLY;BYDAY=TU", "scheduled", C, now);
    expect(frontmatterValues(weekly)).toMatchObject({ recurrence: "DTSTART:20261027;FREQ=WEEKLY;BYDAY=TU", scheduled: "2026-10-27" });
    const none = setRecurrence(weekly, null, "scheduled", C, now);
    expect(frontmatterValues(none).recurrence).toBeUndefined();
  });

  it("says rules in French", () => {
    expect(recurrenceText("DTSTART:20261019;FREQ=WEEKLY;BYDAY=MO,TH")).toBe("Tous les lundis et jeudis");
    expect(recurrenceText("FREQ=DAILY;INTERVAL=2")).toBe("Tous les 2 jours");
    expect(recurrenceText("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")).toBe("Du lundi au vendredi");
    expect(recurrenceText("FREQ=MONTHLY;BYMONTHDAY=1")).toBe("Le 1er de chaque mois");
    expect(recurrenceText("FREQ=MONTHLY;BYDAY=-1FR")).toBe("Le dernier vendredi de chaque mois");
    expect(recurrenceText("FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15;COUNT=3")).toBe("Tous les ans le 15 mars, 3 fois");
  });
});

describe("changing the rule", () => {
  it("moves the scheduled date to the rule's first occurrence", () => {
    const text = "---\nstatus: open\nscheduled: 2026-11-03\ntags: [task]\n---\n";
    const next = setRecurrence(text, "FREQ=WEEKLY;BYDAY=MO,TH", "scheduled", C, new Date(2026, 9, 27));
    expect(frontmatterValues(next)).toMatchObject({ scheduled: "2026-11-05", recurrence: "DTSTART:20261103;FREQ=WEEKLY;BYDAY=MO,TH" });
  });
});
