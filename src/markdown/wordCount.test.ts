import { describe, expect, it } from "vitest";
import { countWords, readingMinutes } from "./wordCount";

describe("word count", () => {
  it("counts the words read, not the markup", () => {
    const note = [
      "---",
      "tags: [a, b]",
      "---",
      "# Un titre",
      "",
      "Voir [la doc](https://example.com/x) et [[Projet|mon projet]] ou [[Stack]].",
      "- [ ] l'été 2026",
      "```js",
      "const ignored = true;",
      "```",
      "<!-- caché --> %%aussi%% https://nu.fr",
    ].join("\n");
    expect(countWords(note)).toBe(12);
    expect(countWords("")).toBe(0);
  });

  it("gives a reading time", () => {
    expect(readingMinutes(0)).toBe(0);
    expect(readingMinutes(40)).toBe(1);
    expect(readingMinutes(1000)).toBe(4);
  });
});
