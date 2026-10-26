import { describe, expect, it } from "vitest";
import { DEMO_FILES, DEMO_REMOTE, withDates } from "./demo";
import { loadMarkdown, NoteSession } from "./markdown/note";
import { schema } from "./editor/schema";
import { resolveLink } from "./vault/links";
import { parseBase } from "./base/baseFile";

const paths = Object.keys(DEMO_FILES);
const notes = paths.filter((p) => p.endsWith(".md"));

describe("demo vault", () => {
  it("writes out relative dates, in names too, and leaves Obsidian's template variables", () => {
    const today = new Date(2026, 9, 26);
    expect(withDates("{{J}} {{J+7}} {{J-26}} {{D-2}} {{date}}", today)).toBe("2026-10-26 2026-11-02 2026-09-30 24/10/2026 {{date}}");
    expect(paths.some((p) => /\{\{[JD]/.test(p) || /\{\{[JD][+-]?\d*\}\}/.test(DEMO_FILES[p]))).toBe(false);
    expect(DEMO_FILES["Modèles/Réunion.md"]).toContain("{{date}}");
  });

  it("keeps the configuration of an Obsidian vault", () => {
    expect(JSON.parse(DEMO_FILES[".obsidian/templates.json"]).folder).toBe("Modèles");
    for (const item of JSON.parse(DEMO_FILES[".obsidian/bookmarks.json"]).items) expect(paths).toContain(item.path);
  });

  it.each(notes)("%s is written back byte for byte", (path) => {
    const src = DEMO_FILES[path];
    const { doc, layout } = loadMarkdown(src);
    const node = schema.nodeFromJSON(doc);
    expect(new NoteSession(layout, node).serialize(node)).toBe(src);
  });

  it("links only to files of the vault, but for one note still to write", () => {
    const broken = new Set<string>();
    for (const path of notes) {
      // Links and embeds, outside code blocks; "[[a|b]]" and "[[a#b]]" point to "a".
      const text = DEMO_FILES[path].replace(/```[\s\S]*?```/g, "");
      for (const [, target] of text.matchAll(/!?\[\[([^\]|#]*)(?:[#|][^\]]*)?\]\]/g)) {
        if (target && !resolveLink(target.replace(/\\$/, ""), paths, path)) broken.add(target);
      }
    }
    expect([...broken]).toEqual(["Atelier site en un jour"]);
  });

  it("has bases and canvases that parse", () => {
    for (const path of paths.filter((p) => p.endsWith(".base"))) expect(parseBase(DEMO_FILES[path]).model.views.length).toBeGreaterThan(1);
    for (const path of paths.filter((p) => p.endsWith(".canvas"))) expect(JSON.parse(DEMO_FILES[path]).nodes.length).toBeGreaterThan(0);
  });

  it("has a remote that changes one line of a note, for a conflict", () => {
    expect(DEMO_REMOTE["Projets.md"]).not.toBe(DEMO_FILES["Projets.md"]);
  });
});
