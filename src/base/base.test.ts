import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { defaultView, filterExpression, NAME, newBaseFile, writeFormula, parseBase, parseFilter, renameInBase, reparse, serializeBase, writeColumn, writeDisplayName, writeView } from "./baseFile";
import { columnInfo, usedValues } from "./columns";
import { cellValue, columnMeta, optionsOf, rowsOf, setNoteProperty, summarize, viewRows } from "./rows";

const BASE = `# Mes projets
filters:
  and:
    - file.inFolder("Projets")
formulas:
  restant: (date(echeance) - today()).days
properties:
  note.statut:
    displayName: Statut
views:
  - type: table
    name: Tous
    order:
      - file.name
      - note.statut
      - echeance
    sort:
      - property: note.echeance
        direction: DESC
    columnSize:
      note.statut: 180
    filters:
      and:
        - note.statut != "Abandonné"
        - formula.restant > 0
  - type: cards
    name: Galerie
flownote:
  properties:
    statut:
      type: select
      options:
        - value: En cours
          color: blue
`;

const NOTES: [string, string][] = [
  ["Projets/Site web.md", "---\nstatut: En cours\nechéance: x\nechéance2: y\nechéance3: z\nechéance4: w\nechéance5: v\n---\nTexte"],
  ["Projets/Appli.md", "---\nstatut: Terminé\nprioritaire: true\nbudget: 1200\nechéance: 2026-11-01\n---\n"],
  ["Projets/Sous/Plan.md", "---\nstatut: Abandonné\ntags: [a, b]\n---\n"],
  ["Ailleurs.md", "---\nstatut: En cours\n---\n"],
];

describe("base file", () => {
  it("reads Obsidian's format", () => {
    const { model } = parseBase(BASE);
    expect(model.folder).toBe("Projets");
    expect(model.displayNames).toEqual({ statut: "Statut" });
    expect(model.views[0]).toMatchObject({ type: "table", name: "Tous", order: ["file.name", "statut", "echeance"], sort: [{ property: "echeance", direction: "DESC" }], columnSize: { statut: 180 } });
    expect(model.views[0].filters).toEqual([{ property: "statut", op: "isNot", value: "Abandonné" }]);
    expect(model.views[0].otherFilters).toBe(1);
    expect(model.views[1]).toMatchObject({ type: "cards", name: "Galerie", order: [] });
    expect(model.columns.statut).toEqual({ type: "select", options: [{ value: "En cours", color: "blue" }] });
  });

  it("rewrites a view and keeps what it does not edit", () => {
    const file = parseBase(BASE);
    writeView(file, 0, { ...file.model.views[0], order: ["file.name", "echeance"], sort: [], filters: [{ property: "statut", op: "is", value: "En cours" }] });
    const out = serializeBase(file);
    expect(out).toContain("# Mes projets");
    expect(out).toContain("restant: (date(echeance) - today()).days");
    expect(out).toContain("- note.statut == \"En cours\"\n        - formula.restant > 0");
    expect(out).not.toContain("sort:");
    expect(out).toContain("type: cards");
    expect(reparse(file).model.views[0].order).toEqual(["file.name", "echeance"]);
  });

  it("adds a kanban view and column colors", () => {
    const file = parseBase(newBaseFile("Projets"));
    writeView(file, 1, { ...defaultView("board", "Kanban", ["file.name"]), groupBy: "statut", summaries: { budget: "sum" }, rowOrder: ["Projets/B.md", "Projets/A.md"] });
    writeColumn(file, "statut", { type: "select", options: [{ value: "À faire", color: "gray" }] });
    const { model } = reparse(file);
    expect(model.views[1]).toMatchObject({ type: "board", groupBy: "statut", summaries: { budget: "sum" }, rowOrder: ["Projets/B.md", "Projets/A.md"] });
    expect(model.columns.statut.options).toEqual([{ value: "À faire", color: "gray" }]);
  });

  it("writes Obsidian's view types: kanban, and cards for the calendar", () => {
    const file = reparse((() => {
      const f = parseBase(newBaseFile("Projets"));
      writeColumn(f, "statut", { type: "select", options: [{ value: "À faire", color: "gray" }, { value: "Fait", color: "green" }] });
      return f;
    })());
    writeView(file, 1, { ...defaultView("board", "Kanban", ["file.name"]), groupBy: "statut" });
    writeView(file, 2, { ...defaultView("calendar", "Calendrier", ["file.name"]), dateProperty: "date" });
    const text = serializeBase(file);
    expect(text).toContain("type: kanban\n    name: Kanban");
    expect(text).toContain("type: cards\n    name: Calendrier");
    expect(text).toContain("flownoteView: calendar");
    expect(text).toContain("groupOrder:\n      - À faire\n      - Fait");
    expect(parseBase(text).model.views.map((v) => v.type)).toEqual(["table", "board", "calendar"]);
    // Files written before: "board" is still a kanban.
    expect(parseBase(text.replace("type: kanban", "type: board")).model.views[1].type).toBe("board");
  });

  it("writes groupBy with the direction Obsidian requires, keeping a DESC one", () => {
    const file = parseBase(newBaseFile("Projets"));
    writeView(file, 1, { ...defaultView("board", "Kanban", ["file.name"]), groupBy: "statut" });
    expect(serializeBase(file)).toContain("groupBy:\n      property: note.statut\n      direction: ASC");
    const desc = parseBase(serializeBase(file).replace("direction: ASC", "direction: DESC"));
    writeView(desc, 1, { ...desc.model.views[1], groupBy: "phase" });
    expect(serializeBase(desc)).toContain("property: note.phase\n      direction: DESC");
  });

  it("renames a property everywhere in the file", () => {
    const file = parseBase(BASE);
    renameInBase(file, "statut", "état");
    const { model } = reparse(file);
    expect(model.views[0].order).toEqual(["file.name", "état", "echeance"]);
    expect(model.views[0].columnSize).toEqual({ état: 180 });
    expect(model.columns.état?.type).toBe("select");
    expect(model.displayNames).toEqual({ état: "Statut" });
  });

  it("names the note column through Obsidian's displayName, and forgets it", () => {
    const file = parseBase(BASE);
    writeDisplayName(file, NAME, "Projet");
    const named = reparse(file);
    expect(columnInfo(named.model, NAME, []).label).toBe("Projet");
    expect(serializeBase(named)).toContain("  file.name:\n    displayName: Projet");
    writeDisplayName(named, NAME, null);
    expect(serializeBase(named)).not.toContain("file.name:\n    displayName");
    expect(columnInfo(reparse(named).model, NAME, []).label).toBe("Nom");
  });

  it("reads and writes formulas", () => {
    const file = parseBase(BASE);
    expect(file.model.formulas).toEqual({ restant: "(date(echeance) - today()).days" });
    writeFormula(file, "ttc", "prix * 1.2");
    writeFormula(file, "restant", null);
    expect(reparse(file).model.formulas).toEqual({ ttc: "prix * 1.2" });
  });

  it("parses and writes simple filters", () => {
    for (const expression of ['note.a == "x"', 'note.a != "y \\"z\\""', 'note.tags.contains("dev")', "note.fait == true", "note.fait != true", "note.a.isEmpty()", "!note.a.isEmpty()", 'formula.reste == "x"', "file.tags.contains(\"a\")"]) {
      expect(filterExpression(parseFilter(expression)!)).toBe(expression);
    }
    expect(parseFilter("formula.x > 2")).toBeNull();
  });
});

describe("base rows", () => {
  const { model } = parseBase(BASE);
  const rows = rowsOf(NOTES, model);

  it("are the notes of the folder, sub-folders included", () => {
    expect(rows.map((r) => r.name)).toEqual(["Site web", "Appli", "Plan"]);
    expect(rows[1].values).toMatchObject({ statut: "Terminé", prioritaire: true, budget: 1200 });
  });

  it("guess column types and gather select options", () => {
    expect(columnMeta(model, "prioritaire", rows).type).toBe("checkbox");
    expect(columnMeta(model, "budget", rows).type).toBe("number");
    expect(columnMeta(model, "tags", rows).type).toBe("multi");
    expect(optionsOf(model.columns.statut, "statut", rows).map((o) => [o.value, o.color])).toEqual([
      ["En cours", "blue"],
      ["Terminé", "default"],
      ["Abandonné", "default"],
    ]);
  });

  it("filter, search and sort", () => {
    expect(viewRows(rows, model.views[0].filters, [{ property: "statut", direction: "ASC" }]).map((r) => r.name)).toEqual(["Site web", "Appli"]);
    expect(viewRows(rows, [], [], "terminé").map((r) => r.name)).toEqual(["Appli"]);
    expect(viewRows(rows, [{ property: "tags", op: "contains", value: "A" }], []).map((r) => r.name)).toEqual(["Plan"]);
  });

  it("let every row through a filter whose value is not typed yet", () => {
    expect(viewRows(rows, [{ property: "statut", op: "is", value: " " }], []).length).toBe(3);
  });

  it("offer the values used in a column, most used first", () => {
    expect(usedValues("statut", [...rows, ...rowsOf([["Projets/Autre.md", "---\nstatut: Terminé\n---\n"]], model)])).toEqual(["Terminé", "Abandonné", "En cours"]);
    expect(usedValues("tags", rows)).toEqual(["a", "b"]);
    expect(usedValues("prioritaire", rows)).toEqual([]);
  });

  it("set one property of a note, keeping the rest", () => {
    expect(setNoteProperty("---\nstatut: En cours\ntags: [a]\n---\nTexte\n", "statut", "Fait")).toBe("---\nstatut: Fait\ntags: [a]\n---\nTexte\n");
    expect(setNoteProperty("Texte\n", "fait", true)).toBe("---\nfait: true\n---\nTexte\n");
    expect(setNoteProperty("---\r\na: 1\r\n---\r\nT\r\n", "a", undefined)).toBe("T\r\n");
    expect(setNoteProperty("---\r\na: 1\r\n---\r\nT\r\n", "b", 2)).toBe("---\r\na: 1\r\nb: 2\r\n---\r\nT\r\n");
  });
});

describe("base rows, more", () => {
  const model = parseBase('filters:\n  and:\n    - file.inFolder("P")\nformulas:\n  total: prix * qte\n  cher: if(formula.total > 100, "oui", "non")\nviews:\n  - type: table\n    name: T\n').model;
  const rows = rowsOf(
    [
      ["P/A.md", "---\nprix: 30\nqte: 4\ntags: [x]\n---\nVoir [[B]] et #urgent.\n\n![[img/cover.png|200]]\n"],
      ["P/B.md", "---\nprix: 5\nqte: 2\n---\n![photo](https://ex.com/p.jpg)\n```\n#pasuntag [[pasunlien]]\n```\n"],
    ],
    model,
    [{ path: "P/A.md", ctime: Date.UTC(2026, 9, 1, 8), mtime: Date.UTC(2026, 9, 14, 9) }],
  );

  it("have file properties and a cover image", () => {
    expect(rows[0].file).toMatchObject({ folder: "P", tags: ["x", "urgent"], links: 1 });
    expect(cellValue(rows[0], "file.mtime")).toBe("2026-10-14T09:00");
    expect(cellValue(rows[1], "file.ctime")).toBeNull();
    expect(rows[1].file).toMatchObject({ tags: [], links: 0 });
    expect(rows.map((r) => r.image)).toEqual(["img/cover.png", "https://ex.com/p.jpg"]);
  });

  it("compute formulas per row", () => {
    expect(cellValue(rows[0], "formula.total", model.formulas)).toBe(120);
    expect(cellValue(rows[0], "formula.cher", model.formulas)).toBe("oui");
    expect(cellValue(rows[1], "formula.cher", model.formulas)).toBe("non");
    expect(viewRows(rows, [{ property: "formula.cher", op: "is", value: "oui" }], [], "", model.formulas).map((r) => r.name)).toEqual(["A"]);
    expect(viewRows(rows, [], [{ property: "formula.total", direction: "ASC" }], "", model.formulas).map((r) => r.name)).toEqual(["B", "A"]);
  });

  it("follow the manual order when the view has no sort", () => {
    expect(viewRows(rows, [], [], "", {}, ["P/B.md", "P/A.md"]).map((r) => r.name)).toEqual(["B", "A"]);
    expect(viewRows(rows, [], [{ property: "prix", direction: "DESC" }], "", {}, ["P/B.md", "P/A.md"]).map((r) => r.name)).toEqual(["A", "B"]);
  });
});

describe("column summaries", () => {
  const { model } = parseBase(BASE);
  const rows = rowsOf(NOTES, model);
  it("count, add up and find extremes", () => {
    expect(summarize(rows, "budget", "Filled")).toBe("1");
    expect(summarize(rows, "budget", "Sum")).toBe("1 200");
    expect(summarize(rows, "prioritaire", "Checked")).toBe("1");
    expect(summarize(rows, "statut", "Unique")).toBe("3");
    expect(summarize(rows, "echéance", "Latest")).toBe("1 nov. 2026");
  });
});

describe("TaskNotes views", () => {
  const read = (name: string) => readFileSync(`src/tasks/views/${name}.base`, "utf8");
  const notes: [string, string][] = [
    ["TaskNotes/Tasks/A.md", "---\nstatus: open\ndue: 2000-01-01\ntags: [task]\n---\n"],
    ["TaskNotes/Tasks/B.md", "---\nstatus: done\ntags: [task]\n---\n"],
    ["Notes/C.md", "---\nstatus: open\n---\n"],
  ];

  it("keep their filters, sorts and comments when a view is renamed", () => {
    const source = read("tasks-default");
    const file = parseBase(source);
    expect(file.model.views[1].sort).toEqual([{ property: "due", direction: "ASC" }]);
    writeView(file, 3, { ...file.model.views[3], name: "Aujourd'hui" });
    const out = serializeBase(file);
    expect(out).toBe(source.replace('name: "Today"', "name: \"Aujourd'hui\""));
  });

  it("select their rows with the base and view filters", () => {
    const { model } = parseBase(read("tasks-default"));
    const rows = rowsOf(notes, model);
    expect(rows.map((r) => r.path)).toEqual(["TaskNotes/Tasks/A.md", "TaskNotes/Tasks/B.md"]);
    const overdue = model.views.find((v) => v.name === "Overdue")!;
    expect(viewRows(rows, overdue.filters, overdue.sort, "", model.formulas, [], overdue.where).map((r) => r.path)).toEqual(["TaskNotes/Tasks/A.md"]);
  });
});
