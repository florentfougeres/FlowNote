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

  it("escaped wikilinks stay literal", () => {
    const [paragraph] = parseFragment("\\[\\[pas un lien]]");
    expect(paragraph.content!.every((n) => n.type === "text")).toBe(true);
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
