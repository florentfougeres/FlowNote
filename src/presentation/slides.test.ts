import { describe, expect, it } from "vitest";
import { forMarp, isPresentationMarkdown, newPresentationFile, renderSlides, standaloneHtml, withLocalImages } from "./slides";

describe("presentations", () => {
  it("are notes with marp: true", () => {
    expect(isPresentationMarkdown("---\nmarp: true\n---\n# A")).toBe(true);
    expect(isPresentationMarkdown("---\r\ntags: [a]\r\nmarp: \"true\"\r\n---\r\n")).toBe(true);
    expect(isPresentationMarkdown("---\nmarp: false\n---\n")).toBe(false);
    expect(isPresentationMarkdown("marp: true\n")).toBe(false);
  });

  it("render one slide per --- with speaker notes", () => {
    const rendered = renderSlides(newPresentationFile("Démo"));
    expect(rendered.slides).toHaveLength(2);
    expect(rendered.slides[0]).toContain("Démo");
    expect(rendered.slides[0]).not.toContain("<script");
    expect(rendered.notes[1]).toContain("Notes de l'orateur");
    expect(rendered.css).toContain("div.marpit");
  });

  it("read Obsidian embeds and links for display only", () => {
    expect(forMarp("![[images/Schéma 1.png|300]] et [[Projets/Plan|le plan]] puis [[Note]] %%caché%%")).toBe("![w:300px](images/Sch%C3%A9ma%201.png) et le plan puis Note ");
  });

  it("show the vault's images", async () => {
    const html = '<img src="images/Sch%C3%A9ma%201.png" /><img src="https://a.fr/x.png" /><figure style="background-image:url(&quot;fond.jpg&quot;)">';
    const out = await withLocalImages(html.replace(/&quot;/g, '"'), "Présentations/Démo.md", ["images/Schéma 1.png", "Présentations/fond.jpg"], async (p) => `blob:${p}`);
    expect(out).toBe('<img src="blob:images/Schéma 1.png" /><img src="https://a.fr/x.png" /><figure style="background-image:url("blob:Présentations/fond.jpg")">');
  });

  it("export a standalone HTML file", () => {
    const html = standaloneHtml("Démo <1>", renderSlides(newPresentationFile("Démo")));
    expect(html).toContain("<title>Démo &lt;1&gt;</title>");
    expect(html.match(/<section\b/g)).toHaveLength(2);
  });

  it("show Obsidian callouts as colored boxes", () => {
    const { slides, css } = renderSlides("---\nmarp: true\n---\n\n> [!warning] Attention\n> Ne pas **oublier**.\n\n> [!tip]\n> Astuce.\n\n> Une citation.\n");
    expect(slides[0]).toContain('<div class="callout callout-warning">');
    expect(slides[0]).toContain('<p class="callout-title">Attention</p>');
    expect(slides[0]).toContain("Ne pas <strong>oublier</strong>.");
    expect(slides[0]).toContain('<p class="callout-title">Tip</p>');
    expect(slides[0]).toContain("<blockquote>");
    expect(slides[0]).not.toContain("[!warning]");
    expect(css).toContain(".callout-warning");
  });


  it("keeps emoji as text, without images from a CDN", () => {
    const html = renderSlides("---\nmarp: true\n---\n\n# Bonjour 🎉 :rocket:\n").slides.join("");
    expect(html).toContain("🎉");
    expect(html).toContain("🚀");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("cdn.jsdelivr.net");
  });
});
