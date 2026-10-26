import { describe, expect, it } from "vitest";
import { isDue, nextSchedule, noteCards, noteDeck, withSchedule } from "./cards";

const NOTE = `---
tags: [flashcards/anglais]
---
# Vocabulaire

- to bake::cuire au four
Pain:::bread <!--SR:!2026-10-20,3,250-->

Quelle farine pour
une baguette ?
?
T65
<!--SR:!2026-11-02,6,270-->

\`\`\`
pas::une carte
\`\`\`
`;

describe("flashcards", () => {
  it("reads the deck from the #flashcards tag", () => {
    expect(noteDeck(NOTE)).toBe("flashcards/anglais");
    expect(noteDeck("Rien à réviser :: ici")).toBeNull();
    expect(noteCards("A.md", "Rien à réviser :: ici")).toEqual([]);
  });

  it("reads one-line, reversed and multi-line cards with their reviews", () => {
    const cards = noteCards("A.md", NOTE);
    expect(cards.map((c) => [c.front, c.back, c.side, c.from, c.to, c.schedules[c.side] ?? null])).toEqual([
      ["to bake", "cuire au four", 0, 5, 5, null],
      ["Pain", "bread", 0, 6, 6, { due: "2026-10-20", interval: 3, ease: 250 }],
      ["bread", "Pain", 1, 6, 6, null],
      ["Quelle farine pour\nune baguette ?", "T65", 0, 8, 11, { due: "2026-11-02", interval: 6, ease: 270 }],
    ]);
  });

  it("knows the cards due: new ones and those whose date has come", () => {
    const today = new Date(2026, 9, 26);
    expect(noteCards("A.md", NOTE).map((c) => isDue(c, today))).toEqual([true, true, true, false]);
  });

  it("schedules like the Spaced Repetition plugin", () => {
    const today = new Date(2026, 9, 26);
    expect(nextSchedule("good", null, today)).toEqual({ due: "2026-10-29", interval: 3, ease: 250 });
    expect(nextSchedule("easy", null, today)).toEqual({ due: "2026-10-30", interval: 4, ease: 270 });
    expect(nextSchedule("hard", null, today)).toEqual({ due: "2026-10-27", interval: 1, ease: 230 });
    // Six days late on a 3-day interval: half the delay counts for "Correct".
    expect(nextSchedule("good", { due: "2026-10-20", interval: 3, ease: 250 }, today)).toEqual({ due: "2026-11-10", interval: 15, ease: 250 });
  });

  it("writes the review after the card, changing nothing else", () => {
    const cards = noteCards("A.md", NOTE);
    const schedule = { due: "2026-10-29", interval: 3, ease: 250 };
    const lines = (text: string | null) => text?.split("\n");
    expect(lines(withSchedule(NOTE, cards[0], schedule))?.[5]).toBe("- to bake::cuire au four <!--SR:!2026-10-29,3,250-->");
    // The other way of a reversed card: a second entry.
    expect(lines(withSchedule(NOTE, cards[2], schedule))?.[6]).toBe("Pain:::bread <!--SR:!2026-10-20,3,250!2026-10-29,3,250-->");
    const multi = withSchedule(NOTE, cards[3], schedule);
    expect(multi).toBe(NOTE.replace("<!--SR:!2026-11-02,6,270-->", "<!--SR:!2026-10-29,3,250-->"));
  });

  it("adds the comment line after a new multi-line card, and a placeholder for a way not reviewed", () => {
    const note = "#flashcards\n\nQuestion\n??\nRéponse\n\nSuite\n";
    const [, reverse] = noteCards("A.md", note);
    expect(withSchedule(note, reverse, { due: "2026-10-27", interval: 1, ease: 230 })).toBe("#flashcards\n\nQuestion\n??\nRéponse\n<!--SR:!2000-01-01,1,250!2026-10-27,1,230-->\n\nSuite\n");
  });

  it("refuses to write when the card moved", () => {
    const [card] = noteCards("A.md", NOTE);
    expect(withSchedule(NOTE.replace("# Vocabulaire\n", ""), card, { due: "2026-10-29", interval: 3, ease: 250 })).toBeNull();
  });
});
