import { describe, expect, it } from "vitest";
import { noteExcerpt } from "./recents";

describe("noteExcerpt", () => {
  it("skips the front matter, the title and the blocks that are not text", () => {
    const text = "---\ntags: [projet]\n---\n# Site Maison Pain\n\n> [!tip] Objectif\n> Un site **rapide**, lisible.\n\n```js\ncode()\n```\nClient : [[Maison Pain]].\n";
    expect(noteExcerpt(text)).toBe("Un site rapide, lisible. Client : Maison Pain.");
  });

  it("leaves out the headings and the HTML comments", () => {
    expect(noteExcerpt("## Objectifs\n- [ ] Passer le TJM <!-- note -->\n## Suite\nDeux identités\n")).toBe("Passer le TJM Deux identités");
  });

  it("cuts a long text", () => {
    expect(noteExcerpt("mot ".repeat(100), 20)).toMatch(/^.{1,20}$/);
    expect(noteExcerpt("mot ".repeat(100), 20).endsWith("…")).toBe(true);
  });
});
