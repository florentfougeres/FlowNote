import { describe, expect, it } from "vitest";
import { embedSection } from "./sections";

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
