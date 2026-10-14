import { describe, expect, it } from "vitest";
import { addLink, linkMarkdown, newReadingList, parseReadingList, setChecked, siteOf } from "./readingList";

const LIST = `# Lectures

- [ ] https://example.com/sans-theme

## IA
- [ ] [Comprendre les transformers](https://example.com/transformers)
- [x] [Prompt \\[guide\\]](https://example.com/prompts) #ia

## Dev
Articles techniques.

- [ ] Rust async https://example.com/rust-async
- [ ] une tâche sans lien

\`\`\`
- [ ] https://example.com/dans-du-code
\`\`\`

## Voile
`;

describe("reading list", () => {
  it("reads themes and links, ignoring code and tasks without a link", () => {
    const sections = parseReadingList(LIST);
    expect(sections.map((s) => [s.title, s.items.map((i) => [i.checked, i.title, i.url])])).toEqual([
      [null, [[false, "https://example.com/sans-theme", "https://example.com/sans-theme"]]],
      [
        "IA",
        [
          [false, "Comprendre les transformers", "https://example.com/transformers"],
          [true, "Prompt [guide]", "https://example.com/prompts"],
        ],
      ],
      ["Dev", [[false, "Rust async", "https://example.com/rust-async"]]],
      ["Voile", []],
    ]);
  });

  it("checks a link by flipping one character", () => {
    const item = parseReadingList(LIST)[1].items[0];
    const checked = setChecked(LIST, item.line, true);
    expect(checked).toBe(LIST.replace("- [ ] [Comprendre", "- [x] [Comprendre"));
    expect(setChecked(checked, item.line, false)).toBe(LIST);
    const crlf = LIST.replace(/\n/g, "\r\n");
    expect(setChecked(crlf, item.line, true)).toBe(checked.replace(/\n/g, "\r\n"));
  });

  it("adds a link at the end of its theme, or creates the theme", () => {
    expect(addLink(LIST, "ia", "Nouveau", "https://n.fr")).toBe(
      LIST.replace("#ia\n", "#ia\n- [ ] [Nouveau](https://n.fr)\n"),
    );
    expect(addLink(LIST, "Voile", "", "https://v.fr")).toBe(`${LIST}\n- [ ] https://v.fr\n`);
    expect(addLink(LIST, "Cuisine", "Pâtes", "https://p.fr")).toBe(`${LIST}\n## Cuisine\n\n- [ ] [Pâtes](https://p.fr)\n`);
    expect(addLink(LIST, null, "Vrac", "https://x.fr")).toBe(LIST.replace("sans-theme\n", "sans-theme\n- [ ] [Vrac](https://x.fr)\n"));
    expect(addLink("# Lectures\n\nIntro.\n\n## Dev\n", null, "A", "https://a.fr")).toBe("# Lectures\n\nIntro.\n\n- [ ] [A](https://a.fr)\n\n## Dev\n");
    expect(newReadingList("IA", "Un titre", "https://a.fr")).toBe("# Lectures\n\n## IA\n\n- [ ] [Un titre](https://a.fr)\n");
  });

  it("writes links Obsidian reads", () => {
    expect(linkMarkdown("Un [crochet]", "https://a.fr/x(1)")).toBe("[Un \\[crochet\\]](https://a.fr/x%281%29)");
    expect(siteOf("https://www.example.com/a")).toBe("example.com");
  });
});
