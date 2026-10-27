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

/** The YouTube video of a web address (watch, youtu.be, shorts, embed), or null. */
export function youtubeId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www|m|music)\./, "");
  const id = host === "youtu.be" ? parsed.pathname.slice(1) : host === "youtube.com" || host === "youtube-nocookie.com" ? (parsed.searchParams.get("v") ?? /^\/(?:shorts|embed|live)\/([^/?#]+)/.exec(parsed.pathname)?.[1] ?? "") : "";
  return /^[\w-]{11}$/.test(id) ? id : null;
}

/** The Vimeo video of a web address (vimeo.com/123, player.vimeo.com/video/123), or null. */
export function vimeoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  const id = host === "vimeo.com" ? /^\/(\d+)/.exec(parsed.pathname)?.[1] : host === "player.vimeo.com" ? /^\/video\/(\d+)/.exec(parsed.pathname)?.[1] : undefined;
  return id ?? null;
}

export interface Video {
  /** The player's address, without cookies when the site allows it. */
  player: string;
  /** A thumbnail read without asking the page (which may answer with a cookie consent), or null. */
  thumbnail: string | null;
}

/** The YouTube or Vimeo video of a web address, as Obsidian embeds `![](address)`, or null. */
export function videoOf(url: string): Video | null {
  const youtube = youtubeId(url);
  if (youtube) return { player: `https://www.youtube-nocookie.com/embed/${youtube}`, thumbnail: `https://i.ytimg.com/vi/${youtube}/hqdefault.jpg` };
  const vimeo = vimeoId(url);
  if (vimeo) return { player: `https://player.vimeo.com/video/${vimeo}?dnt=1`, thumbnail: null };
  return null;
}
