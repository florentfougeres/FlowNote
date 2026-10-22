import { describe, expect, it } from "vitest";
import { Link, readPage, readPages, setTaskDone, type Page } from "./pages";
import { display, parseQuery, QueryError, runQuery } from "./dataview";
import { parseTasksQuery, runTasksQuery } from "./tasks";

const TODAY = new Date(2026, 9, 22, 10);

const NOTES: [string, string][] = [
  ["Projets/Site.md", "---\nstatut: en cours\nbudget: 1200\ntags: [projet]\nresponsable: \"[[Léa]]\"\n---\n# Site\n\nÉchéance:: 2026-11-01\n\n## À faire\n- [ ] Maquette #design 📅 2026-10-21 ⏫\n- [x] Choisir l'hébergeur ✅ 2026-10-15\n- [ ] Rédiger [due:: 2026-10-30]\n\nVoir [[Exemple]].\n"],
  ["Projets/Appli.md", "---\nstatut: fait\nbudget: 300\ntags: [projet, mobile]\n---\n- [ ] Publier sur le store 📅 2026-10-22 🔁 every month\n"],
  ["Exemple.md", "# Exemple\n\n```\n- [ ] pas une tâche\n```\n- [ ] Relire ⏳ 2026-10-25 🔽\n"],
  ["Croquis.excalidraw.md", "- [ ] donnée de dessin\n"],
];
const STATS = NOTES.map(([path], i) => ({ path, ctime: new Date(2026, 9, 1 + i, 12).getTime(), mtime: new Date(2026, 9, 10 + i, 12).getTime() }));
const pages = readPages({ notes: NOTES, stats: STATS });
const query = (source: string, self: Page | null = null) => runQuery(parseQuery(source), pages, self, TODAY);

describe("query pages", () => {
  it("reads properties, inline fields, tags and tasks (not in code, not in drawings)", () => {
    expect(pages.map((p) => p.name)).toEqual(["Site", "Appli", "Exemple"]);
    const site = pages[0];
    expect(site.fields.get("statut")).toBe("en cours");
    expect(site.fields.get("Échéance")).toBe("2026-11-01");
    expect(site.fields.get("responsable")).toEqual(new Link("Léa"));
    expect(site.tags).toEqual(["#projet", "#design"]);
    expect(site.tasks.map((t) => [t.text, t.due, t.done, t.priority, t.line, t.heading])).toEqual([
      ["Maquette #design", "2026-10-21", null, "high", 11, "À faire"],
      ["Choisir l'hébergeur", null, "2026-10-15", "none", 12, "À faire"],
      ["Rédiger", "2026-10-30", null, "none", 13, "À faire"],
    ]);
    expect(pages[1].tasks[0].recurrence).toBe("every month");
    expect(pages[2].tasks.map((t) => [t.text, t.scheduled, t.priority])).toEqual([["Relire", "2026-10-25", "low"]]);
  });

  it("checks a task line only, with its done date", () => {
    expect(setTaskDone("  - [ ] Maquette 📅 2026-10-21", true, "2026-10-22")).toBe("  - [x] Maquette 📅 2026-10-21 ✅ 2026-10-22");
    expect(setTaskDone("* [x] Fini ✅ 2026-10-15", false, "2026-10-22")).toBe("* [ ] Fini");
    expect(setTaskDone("Pas une tâche", true, "2026-10-22")).toBeNull();
  });
});

describe("dataview", () => {
  it("lists and tables with FROM, WHERE, SORT and LIMIT", () => {
    const list = query('LIST FROM "Projets" SORT budget DESC');
    expect(list.type === "list" && list.groups[0].items.map((i) => i.link.toString())).toEqual(["Site", "Appli"]);
    const table = query('TABLE statut AS "Statut", budget * 2 AS Double, responsable FROM #projet WHERE budget > 500');
    expect(table.type === "table" && table.headers).toEqual(["Fichier", "Statut", "Double", "responsable"]);
    expect(table.type === "table" && table.groups[0].items.map((row) => row.map(display))).toEqual([["Site", "en cours", "2400", "Léa"]]);
    const limited = query("LIST file.folder FROM -#mobile LIMIT 1");
    expect(limited.type === "list" && limited.groups[0].items.map((i) => [i.link.toString(), i.value])).toEqual([["Exemple", ""]]);
  });

  it("evaluates dates, functions and links", () => {
    const recent = query('TABLE WITHOUT ID file.name WHERE file.mtime >= date(2026-10-11) AND contains(file.tags, "#projet")');
    expect(recent.type === "table" && recent.groups[0].items.map((r) => r[0])).toEqual(["Appli"]);
    const soon = query("LIST WHERE Échéance <= date(today) + dur(2 weeks)");
    expect(soon.type === "list" && soon.groups[0].items.map((i) => i.link.toString())).toEqual(["Site"]);
    const linking = query("LIST FROM [[Exemple]]");
    expect(linking.type === "list" && linking.groups[0].items.map((i) => i.link.toString())).toEqual(["Site"]);
    const self = query("LIST WHERE file.name != this.file.name AND statut", pages[0]);
    expect(self.type === "list" && self.groups[0].items.map((i) => i.link.toString())).toEqual(["Appli"]);
    const grouped = query("LIST GROUP BY statut");
    expect(grouped.type === "list" && grouped.groups.map((g) => display(g.key))).toEqual(["", "en cours", "fait"]);
  });

  it("queries tasks", () => {
    const open = query('TASK FROM "Projets" WHERE !completed AND due < date(today)');
    expect(open.type === "task" && open.groups.map((g) => [display(g.key), g.items.map((t) => t.text)])).toEqual([["Site", ["Maquette #design"]]]);
  });

  it("reports mistakes in French", () => {
    expect(() => parseQuery("SELECT *")).toThrow(QueryError);
    expect(() => parseQuery('LIST FROM "Projets" WHERE (a')).toThrow("« ) » attendu à la fin.");
    expect(() => runQuery(parseQuery("LIST WHERE nope(1)"), pages, null)).toThrow("Fonction inconnue : nope().");
  });
});

describe("tasks queries", () => {
  const run = (source: string) => runTasksQuery(parseTasksQuery(source, TODAY), pages).map((g) => [g.key, g.tasks.map((t) => t.text)]);

  it("filters, sorts and groups like the Tasks plugin", () => {
    expect(run("not done")).toEqual([[null, ["Maquette #design", "Publier sur le store", "Rédiger", "Relire"]]]);
    expect(run("not done\ndue before tomorrow")).toEqual([[null, ["Maquette #design", "Publier sur le store"]]]);
    // The week of Thursday 22 October: Monday 19 to Sunday 25.
    expect(run("due this week\nsort by due reverse")).toEqual([[null, ["Publier sur le store", "Maquette #design"]]]);
    expect(run("path includes Projets\ngroup by filename\nnot done")).toEqual([
      ["Appli", ["Publier sur le store"]],
      ["Site", ["Maquette #design", "Rédiger"]],
    ]);
    expect(run("tag includes #design")).toEqual([[null, ["Maquette #design"]]]);
    expect(run("priority is above none")).toEqual([[null, ["Maquette #design"]]]);
    expect(run("(is recurring) OR (has scheduled date)")).toEqual([[null, ["Publier sur le store", "Relire"]]]);
    expect(run("done\nhide edit button\nlimit 1")).toEqual([[null, ["Choisir l'hébergeur"]]]);
    expect(() => run("due someday")).toThrow("Instruction inconnue");
  });
});

describe("a page alone", () => {
  it("reads a note without properties", () => {
    const page = readPage("Note.md", "Texte:: 12\n");
    expect(page.fields.get("Texte")).toBe(12);
    expect(page.ctime).toBeNull();
  });
});
