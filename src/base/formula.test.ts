import { describe, expect, it } from "vitest";
import { display, evaluateFormulas } from "./formula";

const run = (formula: string, note: Record<string, unknown> = {}, file: Record<string, unknown> = {}) => {
  const r = evaluateFormulas({ x: formula }, note, file).x;
  if (r instanceof Error) throw r;
  return r;
};

describe("base formulas", () => {
  it("compute with numbers, text and properties", () => {
    expect(run("prix * quantite", { prix: 12.5, quantite: 4 })).toBe(50);
    expect(run("(a + b) / 2 % 3", { a: 4, b: 6 })).toBe(2);
    expect(run('note.nom + " (" + file.name + ")"', { nom: "Site" }, { name: "Projet" })).toBe("Site (Projet)");
    expect(run('concat("a", 1, true)')).toBe("a1Oui");
    expect(run("round(10 / 3, 2)")).toBe(3.33);
  });

  it("compare and choose", () => {
    expect(run('if(budget > 1000, "gros", "petit")', { budget: 1200 })).toBe("gros");
    expect(run('statut == "Fait" && !archive', { statut: "Fait", archive: false })).toBe(true);
    expect(run("vide || 'défaut'", {})).toBe("défaut");
  });

  it("work with dates and durations", () => {
    expect(run('(date("2026-11-15") - date("2026-11-01")).days')).toBe(14);
    expect(run('(date(echeance) - date("2026-10-14")).days', { echeance: "2026-10-20" })).toBe(6);
    expect(run('date("2026-10-14").format("DD/MM/YYYY")')).toBe("14/10/2026");
    expect(run('(date("2026-10-14") + duration("3d")).day')).toBe(17);
    expect(run('date(echeance) < date("2026-12-01")', { echeance: "2026-11-01" })).toBe(true);
  });

  it("use methods on text and lists", () => {
    expect(run('tags.contains("dev")', { tags: ["dev", "ia"] })).toBe(true);
    expect(run("tags.length", { tags: ["dev", "ia"] })).toBe(2);
    expect(run('titre.lower().contains("site")', { titre: "Mon SITE" })).toBe(true);
    expect(run('tags.join(" / ")', { tags: ["a", "b"] })).toBe("a / b");
  });

  it("chain formulas and report errors without throwing", () => {
    const results = evaluateFormulas({ total: "prix * 2", ttc: "formula.total * 1.2", boucle: "formula.boucle + 1", faux: "inconnue(1)", syntaxe: "1 +" }, { prix: 10 }, {});
    expect(results.ttc).toBe(24);
    expect((results.boucle as Error).message).toContain("Boucle");
    expect((results.faux as Error).message).toContain("Fonction inconnue");
    expect(results.syntaxe).toBeInstanceOf(Error);
  });

  it("display values in French", () => {
    expect(display(1234.5)).toBe("1\u202f234,5"); // French thousands use a narrow no-break space
    expect(display({ kind: "duration", ms: 3 * 86400000 })).toBe("3 j");
    expect(display(true)).toBe("Oui");
  });
});

describe("empty values", () => {
  it("leaves arithmetic on an empty property empty", () => {
    expect(evaluateFormulas({ d: "pages * 2", s: "pages + 1", t: 'titre + "!"' }, { titre: "A" }, {})).toEqual({ d: null, s: null, t: "A!" });
  });
});
