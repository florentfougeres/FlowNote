import { describe, expect, it } from "vitest";
import { addLink, linkMarkdown, newReadingList, normalizeTag, parseReadingList, setChecked, setTags, siteOf } from "./readingList";

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

  it("reads tags outside the link, not in it nor in the title", () => {
    const md = [
      "- [ ] [C# #1 en #pratique](https://a.fr/page#ancre) #dev #Vidéo/longue",
      "- [ ] #avant Rust async https://b.fr/x#y #rust",
      "- [x] https://c.fr #2024 #a",
    ].join("\n");
    expect(parseReadingList(md)[0].items.map((i) => [i.title, i.url, i.tags])).toEqual([
      ["C# #1 en #pratique", "https://a.fr/page#ancre", ["dev", "Vidéo/longue"]],
      ["Rust async", "https://b.fr/x#y", ["avant", "rust"]],
      ["#2024", "https://c.fr", ["a"]],
    ]);
    expect(parseReadingList(LIST)[1].items[1].tags).toEqual(["ia"]);
  });

  it("tags a link by touching only its tags", () => {
    const md = "# Lectures\n\n- [ ] [A](https://a.fr) #un et du texte #deux\n- [ ] https://b.fr\n";
    expect(setTags(md, 2, ["un", "deux"])).toBe(md);
    expect(setTags(md, 2, ["UN", "deux"])).toBe(md);
    expect(setTags(md, 2, ["deux", "trois"])).toBe("# Lectures\n\n- [ ] [A](https://a.fr) et du texte #deux #trois\n- [ ] https://b.fr\n");
    expect(setTags(md, 2, [])).toBe("# Lectures\n\n- [ ] [A](https://a.fr) et du texte\n- [ ] https://b.fr\n");
    expect(setTags(md, 3, ["lu"])).toBe("# Lectures\n\n- [ ] [A](https://a.fr) #un et du texte #deux\n- [ ] https://b.fr #lu\n");
    expect(setTags("- [ ] #a https://b.fr #a\r\n", 0, ["a"])).toBe("- [ ] #a https://b.fr\r\n");
    expect(setTags(md, 0, ["x"])).toBe(md);
  });

  it("adds a link with its tags", () => {
    expect(addLink("# Lectures\n", "IA", "T", "https://t.fr", ["llm", "video"])).toBe("# Lectures\n\n## IA\n\n- [ ] [T](https://t.fr) #llm #video\n");
    expect(newReadingList(null, "", "https://t.fr", ["a"])).toBe("# Lectures\n\n- [ ] https://t.fr #a\n");
  });

  it("normalizes typed tags", () => {
    expect(normalizeTag("#Machine learning")).toBe("Machine-learning");
    expect(normalizeTag(" vidéo/longue! ")).toBe("vidéo/longue");
    expect(normalizeTag("2024")).toBeNull();
    expect(normalizeTag("#")).toBeNull();
  });
});
