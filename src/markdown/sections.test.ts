import { describe, expect, it } from "vitest";
import { embedSection, headingLinkText, headingRename, newBlockId, noteBlocks, noteHeadings } from "./sections";

const NOTE = `---
tags: [a]
---
# Titre

Intro.

## Plan

- Étape 1 ^etape
  - Détail
- Étape 2

### Détails

Texte détaillé
sur deux lignes ^bloc

## Annexes

\`\`\`
## Pas un titre
\`\`\`
`;

describe("embedded sections", () => {
  it("gives the whole note without its properties", () => {
    expect(embedSection(NOTE, "")?.startsWith("# Titre")).toBe(true);
  });

  it("gives a section with its sub-sections", () => {
    expect(embedSection(NOTE, "Plan")).toBe("## Plan\n\n- Étape 1 ^etape\n  - Détail\n- Étape 2\n\n### Détails\n\nTexte détaillé\nsur deux lignes ^bloc");
    expect(embedSection(NOTE, "Plan#Détails")).toBe("### Détails\n\nTexte détaillé\nsur deux lignes ^bloc");
    expect(embedSection(NOTE, "plan")).not.toBeNull();
    expect(embedSection(NOTE, "Pas un titre")).toBeNull();
    expect(embedSection(NOTE, "Annexes")).toBe("## Annexes\n\n```\n## Pas un titre\n```");
  });

  it("gives a block by its id", () => {
    expect(embedSection(NOTE, "^etape")).toBe("- Étape 1\n  - Détail");
    expect(embedSection(NOTE, "^bloc")).toBe("Texte détaillé\nsur deux lignes");
    expect(embedSection(NOTE, "^absent")).toBeNull();
  });
});

describe("headings and blocks a link can point to", () => {
  it("lists the headings, not those in code", () => {
    expect(noteHeadings(NOTE).map((h) => `${h.level} ${h.text}`)).toEqual(["1 Titre", "2 Plan", "3 Détails", "2 Annexes"]);
  });

  it("lists list items and paragraphs with their line and identifier", () => {
    expect(noteBlocks(NOTE)).toEqual([
      { line: 5, text: "Intro.", id: null },
      { line: 9, text: "Étape 1", id: "etape" },
      { line: 10, text: "Détail", id: null },
      { line: 11, text: "Étape 2", id: null },
      { line: 16, text: "Texte détaillé sur deux lignes", id: "bloc" },
    ]);
  });

  it("shows blocks as read, and skips math blocks", () => {
    const note = "Un **gras** et un [[Lien|alias]][^1], `code`.\n\n$$\nx = 1\n$$\n\n- [ ] Une tâche";
    expect(noteBlocks(note).map((b) => b.text)).toEqual(["Un gras et un alias, code.", "Une tâche"]);
  });

  it("makes new identifiers of six characters, not already taken", () => {
    const id = newBlockId(["abc123"]);
    expect(id).toMatch(/^[a-z0-9]{6}$/);
    expect(id).not.toBe("abc123");
  });

  it("writes a heading as a link names it", () => {
    expect(headingLinkText("Budget : 2027 [draft]")).toBe("Budget 2027 draft");
  });

  it("finds the one heading renamed between two versions", () => {
    expect(headingRename("# A\n\n## Plan\n\ntexte", "# A\n\n## Plan détaillé\n\ntexte")).toEqual({ from: "Plan", to: "Plan détaillé" });
    expect(headingRename("## Plan\n", "## Plan\n\nplus de texte")).toBeNull();
    expect(headingRename("## Plan\n## Budget", "## Plan 2\n## Budget 2")).toBeNull();
    expect(headingRename("## Plan\n## Budget", "## Plan")).toBeNull();
    expect(headingRename("## Plan", "## ")).toBeNull();
  });
});
