import { describe, expect, it } from "vitest";
import { EditorState } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { schema } from "../editor/schema";
import { loadMarkdown, NoteSession, serializeTopLevelBlockWithReport } from "./note";
import { parseFragment } from "./parse";
import { EMPTY_NOTE, FULL_NOTE, MEANING_BLOCKS, NO_FRONTMATTER, ONLY_FRONTMATTER, STYLE_BLOCKS, WEIRD_SPACING } from "./fixtures";

function open(src: string) {
  const { doc, layout } = loadMarkdown(src);
  const node = schema.nodeFromJSON(doc);
  const session = new NoteSession(layout, node);
  return { state: EditorState.create({ schema, doc: node }), session };
}

/** Finds the document position right after the first occurrence of `text`. */
function positionAfter(doc: PMNode, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return found < 0;
    const at = node.text!.indexOf(text);
    if (at >= 0) found = pos + at + text.length;
    return false;
  });
  if (found < 0) throw new Error(`text not found: ${text}`);
  return found;
}

function changedLines(before: string, after: string): string[] {
  const a = before.split("\n");
  const b = after.split("\n");
  return b.filter((line, i) => line !== a[i]);
}

describe("unchanged notes are written back byte for byte", () => {
  for (const [name, src] of Object.entries({ FULL_NOTE, NO_FRONTMATTER, EMPTY_NOTE, ONLY_FRONTMATTER, WEIRD_SPACING })) {
    it(name, () => {
      const { state, session } = open(src);
      expect(session.serialize(state.doc)).toBe(src);
    });
  }
});

describe("byte order mark", () => {
  it("is kept, and does not shift source positions", () => {
    const src = "\uFEFF# Titre\n\n- un\n- deux\n";
    const { state, session } = open(src);
    expect(session.serialize(state.doc)).toBe(src);
    const tr = state.tr.insertText("!", positionAfter(state.doc, "deux"));
    expect(session.serialize(tr.doc)).toBe("\uFEFF# Titre\n\n- un\n- deux!\n");
  });
});

describe("nested identical marks", () => {
  it("_a _b_ c_ is one italic run", () => {
    const [paragraph] = parseFragment("_Note : _objet_ non ordonné_");
    expect(paragraph.content).toEqual([{ type: "text", text: "Note : objet non ordonné", marks: [{ type: "italic", attrs: { marker: "_" } }] }]);
    expect(serializeTopLevelBlockWithReport(paragraph).exact).toBe(true);
  });
});

describe("line endings", () => {
  it("CRLF files stay CRLF, including edited blocks", () => {
    const src = "# Titre\r\n\r\nPremier\r\n- a\r\n- b\r\n";
    const { state, session } = open(src);
    expect(session.serialize(state.doc)).toBe(src);
    const tr = state.tr.insertText("!", positionAfter(state.doc, "Premier"));
    expect(session.serialize(tr.doc)).toBe("# Titre\r\n\r\nPremier!\r\n- a\r\n- b\r\n");
  });
});

describe("re-serialized blocks keep their original Markdown", () => {
  for (const source of STYLE_BLOCKS) {
    it(JSON.stringify(source), () => {
      const blocks = parseFragment(source);
      expect(blocks).toHaveLength(1);
      const report = serializeTopLevelBlockWithReport(blocks[0]);
      expect(report.exact).toBe(true);
      expect(report.markdown).toBe(source);
    });
  }
});

describe("re-serialized blocks keep their meaning", () => {
  for (const source of MEANING_BLOCKS) {
    it(JSON.stringify(source), () => {
      const [block] = parseFragment(source);
      expect(serializeTopLevelBlockWithReport(block).exact).toBe(true);
    });
  }
});

describe("every block of a full note re-serializes to the same content", () => {
  it("FULL_NOTE", () => {
    const { doc, layout } = loadMarkdown(FULL_NOTE);
    const inexact = doc.content!.filter((block) => !serializeTopLevelBlockWithReport(block, layout.context).exact);
    expect(inexact).toEqual([]);
  });
});

describe("Obsidian syntax is recognised", () => {
  it("wikilinks, embeds, highlights and comments", () => {
    const [paragraph] = parseFragment("Voir [[Note|alias]] ![[img.png]] ==fort== %%note%%");
    const types = paragraph.content!.map((n) => n.type);
    expect(types).toContain("wikilink");
    expect(types).toContain("inlineRaw");
    expect(paragraph.content!.some((n) => n.marks?.some((m) => m.type === "highlight"))).toBe(true);
    const embed = paragraph.content!.find((n) => n.type === "wikilink" && n.attrs?.embed);
    expect(embed?.attrs?.target).toBe("img.png");
  });

  it("coloured highlights (Bear): the emoji becomes the colour, and is written back", () => {
    const [paragraph] = parseFragment("je ==🟡test== et ==🔵bleu== du fluo");
    const colors = paragraph.content!.flatMap((n) => n.marks?.filter((m) => m.type === "highlight").map((m) => m.attrs?.color) ?? []);
    expect(colors).toEqual(["yellow", "blue"]);
    expect(paragraph.content!.some((n) => n.text?.includes("🟡"))).toBe(false);
    const { doc, layout } = loadMarkdown("je ==🟡test== et ==🔵bleu== du fluo\n");
    expect(serializeTopLevelBlockWithReport(doc.content![0], layout.context).markdown).toBe("je ==🟡test== et ==🔵bleu== du fluo");
  });

  it("HTML around text (underline, span) is a mark, written back as is", () => {
    for (const line of ['un <u>souligné</u> ici', 'du <span style="color: red">rouge</span> et <sup>2</sup>']) {
      const [paragraph] = parseFragment(line);
      expect(paragraph.content!.some((n) => n.marks?.some((m) => m.type === "inlineHtml"))).toBe(true);
      const { doc, layout } = loadMarkdown(`${line}\n`);
      expect(serializeTopLevelBlockWithReport(doc.content![0], layout.context)).toEqual({ markdown: line, exact: true });
    }
    // A lone tag stays verbatim.
    const [lone] = parseFragment("a <span> b");
    expect(lone.content!.some((n) => n.type === "inlineRaw")).toBe(true);
  });

  it("escaped wikilinks stay literal", () => {
    const [paragraph] = parseFragment("\\[\\[pas un lien]]");
    expect(paragraph.content!.every((n) => n.type === "text")).toBe(true);
  });

  it("URLs between brackets are literal links that serialize back", () => {
    for (const source of ["Voir [https://a.io/x] ici", "[[https://a.io/x]]"]) {
      const { doc, layout } = loadMarkdown(source);
      const [paragraph] = doc.content!;
      expect(paragraph.content!.some((n) => n.marks?.some((m) => m.type === "link" && m.attrs?.kind === "literal"))).toBe(true);
      expect(serializeTopLevelBlockWithReport(paragraph, layout.context)).toMatchObject({ exact: true });
    }
  });

  it("callouts carry type and fold state", () => {
    const [callout] = parseFragment("> [!faq]- Question\n> Réponse");
    expect(callout.type).toBe("callout");
    expect(callout.attrs).toMatchObject({ calloutType: "faq", fold: "-" });
  });
});

describe("edits only touch the edited block", () => {
  it("typing in one paragraph", () => {
    const { state, session } = open(FULL_NOTE);
    const tr = state.tr.insertText(" (modifié)", positionAfter(state.doc, "Un tag #idee/produit"));
    const out = session.serialize(tr.doc);
    expect(changedLines(FULL_NOTE, out)).toEqual(["Un tag #idee/produit (modifié) et un lien [Obsidian](https://obsidian.md \"Site\")."]);
  });

  it("checking a task only flips its box", () => {
    const { state, session } = open(FULL_NOTE);
    let itemPos = -1;
    state.doc.descendants((node, pos) => {
      if (itemPos < 0 && node.type.name === "listItem" && node.attrs.checked === false) itemPos = pos;
      return itemPos < 0;
    });
    const tr = state.tr.setNodeMarkup(itemPos, undefined, { ...state.doc.nodeAt(itemPos)!.attrs, checked: true });
    const out = session.serialize(tr.doc);
    expect(changedLines(FULL_NOTE, out)).toEqual(["- [x] Tâche à faire"]);
  });

  it("moving a block keeps both blocks verbatim", () => {
    const src = "# A\n\nPremier\n\nSecond\n";
    const { state, session } = open(src);
    const first = state.doc.child(1);
    const firstPos = state.doc.child(0).nodeSize;
    const tr = state.tr.delete(firstPos, firstPos + first.nodeSize);
    tr.insert(tr.doc.content.size, first);
    expect(session.serialize(tr.doc)).toBe("# A\n\nSecond\n\nPremier\n");
  });

  it("an edited block keeps its original single-newline spacing", () => {
    const src = "# Titre\nTexte collé\n";
    const { state, session } = open(src);
    const tr = state.tr.insertText(" modifié", positionAfter(state.doc, "Titre"));
    expect(session.serialize(tr.doc)).toBe("# Titre modifié\nTexte collé\n");
  });

  it("spacing is widened when keeping it would merge blocks", () => {
    const src = "# Titre\nTexte collé\n";
    const { state, session } = open(src);
    const tr = state.tr.setNodeMarkup(0, schema.nodes.paragraph);
    expect(session.serialize(tr.doc)).toBe("Titre\n\nTexte collé\n");
  });

  it("new paragraphs are separated by a blank line", () => {
    const src = "Premier\n";
    const { state, session } = open(src);
    const tr = state.tr.insert(state.doc.content.size, schema.nodes.paragraph.create(null, schema.text("Nouveau *texte*")));
    expect(session.serialize(tr.doc)).toBe("Premier\n\nNouveau \\*texte\\*\n");
  });
});

describe("tables", () => {
  it("are parsed into rows and cells with alignment", () => {
    const [table] = parseFragment("| Nom | Âge |\n| :-- | --: |\n| **Ana** | 3 |\n| [[Bob]] | 4 |");
    expect(table.type).toBe("table");
    const [header, first] = table.content!;
    expect(header.content!.map((c) => [c.type, c.attrs?.align])).toEqual([
      ["tableHeader", "left"],
      ["tableHeader", "right"],
    ]);
    expect(first.content![0].content![0].content![0].marks?.[0].type).toBe("bold");
  });

  for (const source of [
    "| A | B |\n|---|---|\n| 1 | 2 |",
    "| Colonne | Valeur |\n| ------- | ------ |\n| a       | 1      |\n| bbbb    | 22     |",
    "| Centré | Droite |\n| :----: | -----: |\n| x | y |",
    "a | b\n--- | ---\nc | d",
    "| Code | Pipe |\n| --- | --- |\n| `a \\| b` | x \\| y |",
  ]) {
    it(`re-serialize exactly: ${JSON.stringify(source.slice(0, 30))}`, () => {
      const [table] = parseFragment(source);
      const report = serializeTopLevelBlockWithReport(table);
      expect(report.exact).toBe(true);
      expect(report.markdown).toBe(source);
    });
  }

  it("an edited cell keeps the table style (padded columns are realigned)", () => {
    const src = "| Colonne | Valeur |\n| ------- | ------ |\n| alpha   | 1      |\n";
    const { state, session } = open(src);
    const tr = state.tr.insertText(" plus long", positionAfter(state.doc, "alpha"));
    expect(session.serialize(tr.doc)).toBe("| Colonne         | Valeur |\n| --------------- | ------ |\n| alpha plus long | 1      |\n");
  });

  it("an edited cell in a compact table stays compact", () => {
    const src = "| A | B |\n|---|---|\n| un | deux |\n";
    const { state, session } = open(src);
    const tr = state.tr.insertText(" | trois", positionAfter(state.doc, "deux"));
    expect(session.serialize(tr.doc)).toBe("| A | B |\n|---|---|\n| un | deux \\| trois |\n");
  });
});

describe("frontmatter edits", () => {
  it("only the frontmatter changes; adding and removing it keeps the body", () => {
    const src = "---\ntitle: A\n---\n\n# Titre\n\nTexte\n";
    const { state, session } = open(src);
    session.setFrontmatter("---\ntitle: B\n---");
    expect(session.serialize(state.doc)).toBe("---\ntitle: B\n---\n\n# Titre\n\nTexte\n");
    session.setFrontmatter(null);
    expect(session.serialize(state.doc)).toBe("\n# Titre\n\nTexte\n");
    const plain = open("# Titre\n");
    plain.session.setFrontmatter("---\ntags:\n  - idée\n---");
    expect(plain.session.serialize(plain.state.doc)).toBe("---\ntags:\n  - idée\n---\n# Titre\n");
  });
});

describe("notes with an empty body", () => {
  it("typing in a note that only has front matter keeps the front matter separate", () => {
    const { state, session } = open("---\ntype: ticket\nid: 2\n---\n\n");
    const tr = state.tr.insertText("Une description", 1);
    expect(session.serialize(tr.doc)).toBe("---\ntype: ticket\nid: 2\n---\n\nUne description\n");
    const tight = open("---\na: 1\n---\n");
    expect(tight.session.serialize(tight.state.tr.insertText("Texte", 1).doc)).toBe("---\na: 1\n---\nTexte\n");
    const bare = open("---\na: 1\n---");
    expect(bare.session.serialize(bare.state.tr.insertText("Texte", 1).doc)).toBe("---\na: 1\n---\nTexte\n");
    const empty = open("");
    expect(empty.session.serialize(empty.state.tr.insertText("Texte", 1).doc)).toBe("Texte\n");
  });
});
