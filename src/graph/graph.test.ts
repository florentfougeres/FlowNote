import { describe, expect, it } from "vitest";
import { buildGraph, filterGraph } from "./graph";

const NOTES: [string, string][] = [
  ["Accueil.md", "---\nicon: 🏠\n---\nVoir [[Projets]], [[Projets|encore]] et [idées](Idées.md).\n"],
  ["Projets.md", "Retour à [[Accueil]]. Plus tard : [[Pas encore écrite]] et [[Version 1.2 du plan]].\n\n```\n[[Dans du code]]\n```\n"],
  ["Idées.md", "Une image ![[photo.png]], une absente ![[perdue.jpg]] et un lien vers soi : [[Idées]].\n"],
  ["Seule.md", "Aucun lien.\n"],
  ["TaskNotes/Tasks/Bug.md", "---\nstatus: open\ntags: [task]\n---\nVoir [[Projets]].\n"],
  ["Schéma.excalidraw.md", "```json\n{\"text\": \"[[Accueil]]\"}\n```\n"],
];
const FILES = [...NOTES.map(([p]) => p), "photo.png"];

describe("vault graph", () => {
  const graph = buildGraph(NOTES, FILES);
  const node = (id: string) => graph.nodes.find((n) => n.id === id)!;

  it("has a node per note, with its kind and icon", () => {
    expect(node("Accueil.md")).toMatchObject({ title: "Accueil", kind: "note", icon: "🏠" });
    expect(node("TaskNotes/Tasks/Bug.md").kind).toBe("task");
    expect(node("Schéma.excalidraw.md").kind).toBe("drawing");
  });

  it("links notes once whatever the direction, ignoring code, attachments and self-links", () => {
    const pairs = graph.edges.map((e) => [e.source, e.target].sort().join(" ↔ ")).sort();
    expect(pairs).toEqual(["Accueil.md ↔ Idées.md", "Accueil.md ↔ Projets.md", "Projets.md ↔ TaskNotes/Tasks/Bug.md", "Projets.md ↔ missing:pas encore écrite", "Projets.md ↔ missing:version 1.2 du plan"]);
    expect(node("Projets.md").degree).toBe(4);
    expect(node("Seule.md").degree).toBe(0);
  });

  it("shows links to notes that do not exist yet as missing nodes", () => {
    expect(node("missing:pas encore écrite")).toMatchObject({ title: "Pas encore écrite", kind: "missing" });
  });

  it("can hide nodes and their edges", () => {
    const linked = filterGraph(graph, (n) => n.degree > 0 && n.kind !== "missing");
    expect(linked.nodes.map((n) => n.id)).not.toContain("Seule.md");
    expect(linked.edges).toHaveLength(3);
  });
});
