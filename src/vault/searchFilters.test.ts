import { describe, expect, it } from "vitest";
import { extractFilters, filterChoices, matchesFilters, modifiedPresets, noteFacts, type SearchFilter } from "./searchFilters";
import { searchNotes } from "./search";

const projet = noteFacts("Projets/Site.md", "---\ntags: [projet/site]\nstatut: fait\nauteurs:\n  - Léa\n  - Max\n---\nUne réunion #Urgent\n```\n#pascode\n```\n", new Date(2026, 9, 20, 15).getTime());
const idee = noteFacts("Idées.md", "---\nstatut:\n---\nRien #idee", null);

describe("search filters", () => {
  it("reads tags, properties and keeps the date", () => {
    expect(projet.tags).toEqual(["projet/site", "urgent"]);
    expect(projet.properties.get("auteurs")).toEqual(["Léa", "Max"]);
    expect(idee.properties.get("statut")).toEqual([]);
  });

  it("filters by tag (nested ones included), folder and property", () => {
    const pass = (f: SearchFilter) => [projet, idee].filter((n) => matchesFilters(n, [f])).map((n) => n.path);
    expect(pass({ kind: "tag", tag: "projet" })).toEqual(["Projets/Site.md"]);
    expect(pass({ kind: "tag", tag: "pro" })).toEqual([]);
    expect(pass({ kind: "tag", tag: "pascode" })).toEqual([]);
    expect(pass({ kind: "folder", folder: "Projets" })).toEqual(["Projets/Site.md"]);
    expect(pass({ kind: "property", key: "Statut", value: "FAIT" })).toEqual(["Projets/Site.md"]);
    expect(pass({ kind: "property", key: "auteurs", value: "max" })).toEqual(["Projets/Site.md"]);
    expect(pass({ kind: "property", key: "statut", value: null })).toEqual(["Projets/Site.md"]);
  });

  it("filters by modification day, unknown dates excluded", () => {
    const [today, week] = modifiedPresets(new Date(2026, 9, 22, 9));
    expect(week.from).toBe("2026-10-16");
    expect(matchesFilters(projet, [week])).toBe(true);
    expect(matchesFilters(projet, [today])).toBe(false);
    expect(matchesFilters(projet, [{ kind: "modified", from: "2026-10-01", to: "2026-10-20", label: "" }])).toBe(true);
    expect(matchesFilters(idee, [week])).toBe(false);
  });

  it("takes typed filters out of the field once they are finished", () => {
    expect(extractFilters("réunion tag:#pro")).toEqual({ text: "réunion tag:#pro", filters: [] });
    expect(extractFilters("réunion tag:#projet ")).toEqual({ text: "réunion ", filters: [{ kind: "tag", tag: "projet" }] });
    expect(extractFilters('path:"Mes notes/" [statut:fait] [auteurs] x', false)).toEqual({
      text: "x",
      filters: [
        { kind: "folder", folder: "Mes notes" },
        { kind: "property", key: "statut", value: "fait" },
        { kind: "property", key: "auteurs", value: null },
      ],
    });
    expect(extractFilters("a [b:c]", true)).toEqual({ text: "a ", filters: [{ kind: "property", key: "b", value: "c" }] });
    expect(extractFilters("C# et [lien]( ", false).filters).toEqual([]);
  });

  it("lists the menu choices", () => {
    const choices = filterChoices([projet, idee]);
    expect(choices.folders).toEqual(["Projets"]);
    expect(choices.tags.map(([t]) => t)).toEqual(["idee", "projet/site", "urgent"]);
    expect(choices.properties.get("statut")).toEqual(["fait"]);
  });

  it("searches only the given notes", () => {
    expect(searchNotes([["A.md", "un\ndeux un"]], "un").map((h) => [h.line, h.from])).toEqual([
      [0, 0],
      [1, 5],
    ]);
  });
});
