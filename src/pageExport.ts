import type { DrawingControls } from "./drawing/DrawingEditor";
import type { MindmapControls } from "./mindmap/MindmapCanvas";
import type { Vault } from "./vault/vault";

/**
 * Exports of a page, shared by the page and the right side of the split
 * view. Each returns where the file was saved (null when cancelled) or throws.
 */

export interface ExportedPage {
  title: string;
  path: string;
  markdown: string;
  kind: "note" | "presentation" | "drawing" | "mindmap";
  drawing?: DrawingControls | null;
  mindmap?: MindmapControls | null;
}

/** The whole mind map as a PNG image. */
export async function exportMindmapPng(controls: MindmapControls, title: string): Promise<string | null> {
  const blob = await controls.exportPng();
  if (!blob) throw new Error("image vide");
  const { saveExport } = await import("./presentation/exportHtml");
  return saveExport(blob, `${title}.png`, "Image PNG", "png");
}

/** A presentation as one HTML file, its images embedded. */
export async function exportSlidesHtml(vault: Vault, page: ExportedPage, files: string[]): Promise<string | null> {
  const { exportPresentation } = await import("./presentation/exportHtml");
  return exportPresentation(page.markdown, page.title, page.path, files, (path) => vault.readBinary(path));
}

/**
 * PDF through the print panel: a note as shown (the one on the right of the
 * split view with `side`), slides one per page, a drawing or mind map as an image.
 */
export async function exportPdf(vault: Vault, page: ExportedPage, files: string[], side: "left" | "right" = "left"): Promise<void> {
  const print = await import("./print");
  if (page.kind === "drawing") {
    if (!page.drawing) return;
    const svg = await page.drawing.exportSvg();
    await print.printImage(page.title, svg, svg.viewBox.baseVal.width, svg.viewBox.baseVal.height);
  } else if (page.kind === "mindmap") {
    if (!page.mindmap) return;
    const { element, width, height } = page.mindmap.printable();
    await print.printElement(page.title, element, width, height);
  } else if (page.kind === "presentation") {
    const { renderSlidesForExport } = await import("./presentation/exportHtml");
    const rendered = await renderSlidesForExport(page.markdown, page.path, files, (path) => vault.readBinary(path));
    await print.printSlides(page.title, rendered.slides, rendered.css);
  } else {
    await print.printNote(page.title, side);
  }
}
