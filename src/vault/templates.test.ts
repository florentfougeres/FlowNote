import { describe, expect, it } from "vitest";
import { fillTemplate, formatDate, noteFromTemplate, readTemplatesConfig, templateBody, templateFiles, templateName } from "./templates";

const CONFIG = { folder: "Modèles", dateFormat: "YYYY-MM-DD", timeFormat: "HH:mm" };
// Monday 26 October 2026, 09:05:07.
const NOW = new Date(2026, 9, 26, 9, 5, 7);

describe("templates", () => {
  it("reads Obsidian's settings, hidden without a folder", () => {
    expect(readTemplatesConfig('{"folder":"/Modèles/","dateFormat":"DD/MM/YYYY"}')).toEqual({ folder: "Modèles", dateFormat: "DD/MM/YYYY", timeFormat: "HH:mm" });
    expect(readTemplatesConfig("{}")).toBeNull();
    expect(readTemplatesConfig('{"folder":""}')).toBeNull();
    expect(readTemplatesConfig("pas du JSON")).toBeNull();
  });

  it("lists the notes of the folder, sub-folders included", () => {
    const files = ["Modèles/Réunion.md", "Modèles/Pro/Compte rendu.md", "Modèles/logo.png", "Notes/Réunion.md", "Modèles.md"];
    expect(templateFiles(CONFIG, files)).toEqual(["Modèles/Pro/Compte rendu.md", "Modèles/Réunion.md"]);
    expect(templateFiles(null, files)).toEqual([]);
    expect(templateName(CONFIG, "Modèles/Pro/Compte rendu.md")).toBe("Pro/Compte rendu");
  });

  it("formats dates with Obsidian's tokens", () => {
    expect(formatDate(NOW, "YYYY-MM-DD HH:mm:ss")).toBe("2026-10-26 09:05:07");
    expect(formatDate(NOW, "dddd D MMMM YYYY")).toBe("lundi 26 octobre 2026");
    expect(formatDate(NOW, "[Semaine du] D/M/YY h A")).toBe("Semaine du 26/10/26 9 AM");
  });

  it("fills title, date and time, with the settings' formats or the one written", () => {
    const text = "# {{title}}\nLe {{date}} à {{time}}, {{ date:dddd }} ({{Title}})";
    expect(fillTemplate(text, "Point", NOW, CONFIG)).toBe("# Point\nLe 2026-10-26 à 09:05, lundi (Point)");
  });

  it("starts a new page with its title, after the template's properties", () => {
    expect(noteFromTemplate("---\ntags: [réunion]\n---\n## Ordre du jour\n- \n", "Point", NOW, CONFIG)).toBe("---\ntags: [réunion]\n---\n# Point\n\n## Ordre du jour\n- \n");
    expect(noteFromTemplate("# {{title}} du {{date}}\n\nTexte", "Point", NOW, CONFIG)).toBe("# Point du 2026-10-26\n\nTexte\n");
    expect(noteFromTemplate("", "Point", NOW, CONFIG)).toBe("# Point\n");
  });

  it("inserts a template's body, without its properties", () => {
    expect(templateBody("---\ntags: [x]\n---\n\n## Notes du {{date}}\n", "Point", NOW, CONFIG)).toBe("## Notes du 2026-10-26\n");
  });
});
