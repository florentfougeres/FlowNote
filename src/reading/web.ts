import { backend } from "../platform";
import { reportError } from "../errors";
import { isTauri } from "../vault/tauriVault";

/** Opens a web link in the default browser. */
export function openUrl(url: string) {
  if (isTauri()) void backend("open_url", { url }).catch(reportError);
  else window.open(url, "_blank", "noopener,noreferrer");
}

/** Title of a web page, or null (offline, or in the browser where pages refuse to be read). */
export async function fetchTitle(url: string): Promise<string | null> {
  if (!isTauri()) return null;
  return backend<string | null>("fetch_page_title", { url }).catch(() => null);
}

export interface PagePreview {
  title: string | null;
  image: string | null;
}

const previews = new Map<string, Promise<PagePreview | null>>();

/** Title and preview image of a web page (canvas link cards), read once per address; null in the browser. */
export function fetchPreview(url: string): Promise<PagePreview | null> {
  if (!isTauri()) return Promise.resolve(null);
  let preview = previews.get(url);
  if (!preview) {
    preview = backend<PagePreview | null>("fetch_page_preview", { url }).catch(() => null);
    previews.set(url, preview);
  }
  return preview;
}

/** The URL in pasted text ("https://…", or a bare "example.com/page"), or null. */
export function urlIn(text: string): string | null {
  const trimmed = text.trim();
  const full = /https?:\/\/[^\s<>"]+/i.exec(trimmed)?.[0];
  if (full) return full.replace(/[.,;)]+$/, "");
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(trimmed)) return `https://${trimmed}`;
  return null;
}
