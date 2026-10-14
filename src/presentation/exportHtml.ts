import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { imageMime } from "../editor/bridge";
import { isTauri } from "../vault/tauriVault";
import { renderSlides, standaloneHtml, withLocalImages } from "./slides";

function dataUrl(bytes: Uint8Array, path: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${imageMime(path)};base64,${btoa(binary)}`;
}

/**
 * Exports a presentation as one standalone HTML file (images embedded).
 * Desktop: asks where to save it, then opens it in the browser. Browser: a
 * download. Returns where it went, or null when cancelled.
 */
export async function exportPresentation(markdown: string, title: string, notePath: string, files: string[], readBinary: (path: string) => Promise<Uint8Array>): Promise<string | null> {
  const rendered = renderSlides(markdown);
  const slides = await Promise.all(rendered.slides.map((html) => withLocalImages(html, notePath, files, async (path) => dataUrl(await readBinary(path), path))));
  const html = standaloneHtml(title, { ...rendered, slides });
  if (isTauri()) {
    const path = await save({ defaultPath: `${title}.html`, filters: [{ name: "Page web", extensions: ["html"] }] });
    if (!path) return null;
    await invoke("save_export", { path, content: html });
    void invoke("open_export", { path }).catch(() => {});
    return path;
  }
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title}.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return `${title}.html`;
}
