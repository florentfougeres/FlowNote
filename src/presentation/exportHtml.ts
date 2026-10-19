import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { imageMime } from "../editor/bridge";
import { isTauri } from "../vault/tauriVault";
import { callNative, isNative, toBase64 } from "../vault/nativeVault";
import { renderSlides, standaloneHtml, withLocalImages, type RenderedSlides } from "./slides";

function dataUrl(bytes: Uint8Array, path: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${imageMime(path)};base64,${btoa(binary)}`;
}

/** The slides of a presentation with the vault's images embedded, for an export. */
export async function renderSlidesForExport(markdown: string, notePath: string, files: string[], readBinary: (path: string) => Promise<Uint8Array>): Promise<RenderedSlides> {
  const rendered = renderSlides(markdown);
  const slides = await Promise.all(rendered.slides.map((html) => withLocalImages(html, notePath, files, async (path) => dataUrl(await readBinary(path), path))));
  return { ...rendered, slides };
}

/**
 * Exports a presentation as one standalone HTML file (images embedded).
 */
export async function exportPresentation(markdown: string, title: string, notePath: string, files: string[], readBinary: (path: string) => Promise<Uint8Array>): Promise<string | null> {
  const html = standaloneHtml(title, await renderSlidesForExport(markdown, notePath, files, readBinary));
  return saveExport(new Blob([html], { type: "text/html" }), `${title}.html`, "Page web", "html");
}

/**
 * Saves an exported file (HTML presentation, PNG mind map). Desktop: asks
 * where, writes it, opens it. Browser: a download. Returns where it went, or
 * null when cancelled.
 */
export async function saveExport(blob: Blob, fileName: string, kind: string, extension: "html" | "png"): Promise<string | null> {
  // The native shell asks where in its own save panel, then opens the file.
  if (isNative()) return callNative<string | null>("save_export", { fileName, kind, extension, base64: toBase64(new Uint8Array(await blob.arrayBuffer())) });
  if (isTauri()) {
    const path = await save({ defaultPath: fileName, filters: [{ name: kind, extensions: [extension] }] });
    if (!path) return null;
    await invoke("save_export", { path, content: Array.from(new Uint8Array(await blob.arrayBuffer())) });
    void invoke("open_export", { path }).catch(() => {});
    return path;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return fileName;
}
