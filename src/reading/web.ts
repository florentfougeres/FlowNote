import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../vault/tauriVault";

/** Opens a web link in the default browser. */
export function openUrl(url: string) {
  if (isTauri()) void invoke("open_url", { url }).catch(() => {});
  else window.open(url, "_blank", "noopener,noreferrer");
}

/** Title of a web page, or null (offline, or in the browser where pages refuse to be read). */
export async function fetchTitle(url: string): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("fetch_page_title", { url }).catch(() => null);
}

/** The URL in pasted text ("https://…", or a bare "example.com/page"), or null. */
export function urlIn(text: string): string | null {
  const trimmed = text.trim();
  const full = /https?:\/\/[^\s<>"]+/i.exec(trimmed)?.[0];
  if (full) return full.replace(/[.,;)]+$/, "");
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(trimmed)) return `https://${trimmed}`;
  return null;
}
