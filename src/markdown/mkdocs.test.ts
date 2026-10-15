import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EditorState } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { schema } from "../editor/schema";
import { setMkdocsSyntax } from "./flavor";
import { loadMarkdown, NoteSession } from "./note";

const ARTICLE = `---
title: Suivre le Vendée Globe
icon: material/sail-boat
---
# Suivre le Vendée Globe

:calendar: Date : {{ page.meta.date | date_localized }}

!!! question "C'est quoi la CI/CD ?"
    La [CI/CD](https://fr.wikipedia.org/wiki/CI/CD) est une **méthodologie**.

    Second paragraphe.

??? tip
    Contenu replié.

!!! info inline end ""

    Corps après une ligne vide.

=== "Python"

    \`\`\`python
    print(1)
    \`\`\`

=== "Bash"

    echo 1

![Release](https://cdn.x/release.png) {: .img-thumbnail-left }

----

{% include "licenses/beerware.md" %}
`;

function open(src: string) {
  const { doc, layout } = loadMarkdown(src);
  const node = schema.nodeFromJSON(doc);
  return { doc: node, session: new NoteSession(layout, node) };
}

/** The document with the text `find` replaced, as an editor would do it. */
function edit(doc: PMNode, find: string, replace: string): PMNode {
  let at = -1;
  doc.descendants((node, pos) => {
    if (at >= 0 || !node.isText) return at < 0;
    const i = node.text!.indexOf(find);
    if (i >= 0) at = pos + i;
    return false;
  });
  if (at < 0) throw new Error(`not found: ${find}`);
  const state = EditorState.create({ schema, doc });
  return state.apply(state.tr.insertText(replace, at, at + find.length)).doc;
}

describe("MkDocs Material syntax", () => {
  beforeAll(() => setMkdocsSyntax(true));
  afterAll(() => setMkdocsSyntax(false));

  it("an article is written back byte for byte", () => {
    const { doc, session } = open(ARTICLE);
    expect(session.serialize(doc)).toBe(ARTICLE);
  });

  it("reads admonitions as callouts and content tabs as tabs", () => {
    const { doc } = open(ARTICLE);
    const blocks: string[] = [];
    doc.forEach((n) => blocks.push(n.type.name));
    expect(blocks).toEqual(["heading", "paragraph", "callout", "callout", "callout", "tabs", "paragraph", "horizontalRule", "paragraph"]);
    const question = doc.child(2);
    expect(question.attrs).toMatchObject({ calloutType: "question", fold: "", syntax: "mkdocs", explicitTitle: true });
    expect(question.child(0).textContent).toBe("C'est quoi la CI/CD ?");
    expect(question.childCount).toBe(3);
    expect(doc.child(3).attrs).toMatchObject({ calloutType: "tip", fold: "-", explicitTitle: false });
    expect(doc.child(4).attrs).toMatchObject({ modifiers: "inline end", explicitTitle: true, spaced: true });
    const tabs = doc.child(5);
    expect(tabs.childCount).toBe(2);
    expect(tabs.child(0).attrs.title).toBe("Python");
    expect(tabs.child(0).child(0).type.name).toBe("codeBlock");
    expect(tabs.child(1).child(0).textContent).toBe("echo 1");
  });

  it("an edited admonition or tab is rewritten in MkDocs syntax, the rest untouched", () => {
    const { doc, session } = open(ARTICLE);
    let next = edit(doc, "Second paragraphe.", "Deuxième paragraphe.");
    next = edit(next, "Contenu replié.", "Contenu replié modifié.");
    next = edit(next, "echo 1", "echo 2");
    const expected = ARTICLE.replace("    Second paragraphe.", "    Deuxième paragraphe.")
      .replace("    Contenu replié.", "    Contenu replié modifié.")
      .replace("    echo 1", "    echo 2");
    expect(session.serialize(next)).toBe(expected);
  });

  it("without the setting, the text is read as plain Markdown", () => {
    setMkdocsSyntax(false);
    try {
      const { doc, session } = open(ARTICLE);
      expect(doc.child(2).type.name).toBe("paragraph");
      expect(session.serialize(doc)).toBe(ARTICLE);
    } finally {
      setMkdocsSyntax(true);
    }
  });
});
