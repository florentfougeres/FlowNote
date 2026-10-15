import { Marp } from "@marp-team/marp-core";
import { resolveLink } from "../vault/links";

/**
 * Presentations: Markdown notes with `marp: true` in their properties, cut in
 * slides by `---` (Marp's syntax, also read by Obsidian's slides plugins).
 * The file stays a plain note; slides are rendered by Marp for the thumbnails,
 * the presenting mode and the HTML export. Speaker notes are HTML comments.
 */

export { isPresentationMarkdown, newPresentationFile } from "./format";

/**
 * The note as Marp reads it: Obsidian embeds and links (`![[image.png|300]]`,
 * `[[Note|texte]]`) become Markdown images and plain text. Display only: the
 * file is never changed.
 */
export function forMarp(markdown: string): string {
  return markdown
    .replace(/!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, target: string, size?: string) => {
      const width = size && /^\d+(x\d+)?$/.test(size.trim()) ? ` w:${size.trim().split("x")[0]}px` : "";
      return `![${width.trim()}](${encodeURI(target.trim())})`;
    })
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, target: string, alias?: string) => alias?.trim() || target.trim().split("/").pop()!)
    .replace(/%%[\s\S]*?%%/g, "");
}

export interface RenderedSlides {
  /** HTML of each slide (a `<section>` of the slide's size). */
  slides: string[];
  /** CSS of the theme, scoped to `div.marpit`. */
  css: string;
  /** Speaker notes of each slide. */
  notes: string[];
}

/** Obsidian callout types, grouped by color like in Obsidian. */
const CALLOUT_FAMILIES: Record<string, string> = {
  abstract: "abstract", summary: "abstract", tldr: "abstract",
  info: "info", todo: "info",
  tip: "tip", hint: "tip", important: "tip",
  success: "success", check: "success", done: "success",
  question: "question", help: "question", faq: "question",
  warning: "warning", caution: "warning", attention: "warning",
  failure: "danger", fail: "danger", missing: "danger", danger: "danger", error: "danger", bug: "danger",
  example: "example",
  quote: "quote", cite: "quote", comment: "quote",
};

interface MdToken {
  type: string;
  tag: string;
  content: string;
  map: [number, number] | null;
  block: boolean;
  children: MdToken[] | null;
  attrSet(name: string, value: string): void;
}
interface MdState {
  tokens: MdToken[];
  Token: new (type: string, tag: string, nesting: number) => MdToken;
}
interface MarkdownIt {
  core: { ruler: { after(name: string, rule: string, fn: (state: MdState) => void): void } };
}

/**
 * Obsidian callouts in slides: `> [!warning] Titre` becomes a colored box with
 * its title (Marp alone shows a quote with "[!warning]" in it).
 */
function calloutsPlugin(md: MarkdownIt) {
  md.core.ruler.after("block", "obsidian_callouts", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "blockquote_open") continue;
      const inline = tokens[i + 2];
      if (tokens[i + 1]?.type !== "paragraph_open" || inline?.type !== "inline") continue;
      const [first, ...rest] = inline.content.split("\n");
      const marker = /^\[!([\w-]+)\][+-]?[ \t]*(.*)$/.exec(first);
      if (!marker) continue;
      let depth = 0;
      let close = i;
      for (; close < tokens.length; close++) {
        if (tokens[close].type === "blockquote_open") depth++;
        else if (tokens[close].type === "blockquote_close" && --depth === 0) break;
      }
      const type = marker[1].toLowerCase();
      tokens[i].tag = "div";
      tokens[i].attrSet("class", `callout callout-${CALLOUT_FAMILIES[type] ?? "note"}`);
      if (tokens[close]) tokens[close].tag = "div";
      const open = new state.Token("paragraph_open", "p", 1);
      open.attrSet("class", "callout-title");
      open.block = true;
      const title = new state.Token("inline", "", 0);
      title.content = marker[2] || type.charAt(0).toUpperCase() + type.slice(1);
      title.children = [];
      title.map = inline.map;
      const end = new state.Token("paragraph_close", "p", -1);
      end.block = true;
      if (rest.length > 0) {
        inline.content = rest.join("\n");
        tokens.splice(i + 1, 0, open, title, end);
      } else tokens.splice(i + 1, 3, open, title, end); // a title alone
    }
  });
}

/** Colors of the callouts (scoped to the slides). */
const CALLOUT_CSS = `
div.marpit section .callout{--callout:#086ddd;margin:.5em 0;padding:.45em .9em;border-left:.22em solid var(--callout);border-radius:.3em;background:color-mix(in srgb,var(--callout) 11%,transparent);text-align:left}
div.marpit section .callout>:last-child{margin-bottom:0}
div.marpit section .callout-title{margin:0 0 .25em;color:var(--callout);font-weight:700}
div.marpit section .callout-abstract{--callout:#00bfbc}
div.marpit section .callout-info{--callout:#086ddd}
div.marpit section .callout-tip{--callout:#00b8a3}
div.marpit section .callout-success{--callout:#08b94e}
div.marpit section .callout-question{--callout:#e0ac00}
div.marpit section .callout-warning{--callout:#ec7500}
div.marpit section .callout-danger{--callout:#e93147}
div.marpit section .callout-example{--callout:#7852ee}
div.marpit section .callout-quote{--callout:#9e9e9e}
`;

let marp: Marp | null = null;

/**
 * Slides of a presentation: one `<section>` each, of the slide's real size
 * (scaled by SlideFrame in the app, by a script in the HTML export).
 */
export function renderSlides(markdown: string): RenderedSlides {
  // Emoji stay the system's: Marp's default turns them into Twemoji images
  // fetched from a CDN (network at each display, missing offline).
  marp ??= new Marp({ inlineSVG: false, script: false, math: "katex", emoji: { shortcode: true, unicode: false } }).use(calloutsPlugin as never);
  const { html, css, comments } = marp.render(forMarp(markdown), { htmlAsArray: true });
  return { slides: html, css: css + CALLOUT_CSS, notes: comments.map((list) => list.join("\n\n").trim()) };
}

/** Local images of slides (relative paths, resolved like Obsidian links). */
const LOCAL_SRC = /(<img\b[^>]*?\bsrc=")([^"]+)(")|(url\()(["']?)([^"')]+)\5(\))/g;

function isLocal(src: string): boolean {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src);
}

/**
 * Slides with their local images replaced by `load(path)` URLs (blob URLs
 * for display, data URLs for the export).
 */
export async function withLocalImages(html: string, notePath: string, files: string[], load: (path: string) => Promise<string>): Promise<string> {
  const sources = new Set<string>();
  for (const m of html.matchAll(LOCAL_SRC)) {
    const src = m[2] ?? m[6];
    if (src && isLocal(src)) sources.add(src);
  }
  const urls = new Map<string, string>();
  await Promise.all(
    [...sources].map(async (src) => {
      let decoded = src;
      try {
        decoded = decodeURI(src.replace(/&amp;/g, "&"));
      } catch {
        // keep as written
      }
      const path = resolveLink(decoded, files, notePath);
      if (path) urls.set(src, await load(path).catch(() => src));
    }),
  );
  return html.replace(LOCAL_SRC, (whole, a?: string, src?: string, c?: string, u?: string, q?: string, usrc?: string, close?: string) => {
    if (a !== undefined) return urls.has(src!) ? `${a}${urls.get(src!)}${c}` : whole;
    return urls.has(usrc!) ? `${u}${q}${urls.get(usrc!)}${q}${close}` : whole;
  });
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A standalone HTML file of the presentation: one slide at a time, scaled
 * to the window; arrows, space and clicks to move, F for full screen.
 */
export function standaloneHtml(title: string, rendered: RenderedSlides): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
div.marpit > section { display: none; position: absolute; left: 0; top: 0; transform-origin: 0 0; }
div.marpit > section.current { display: block; }
.counter { position: fixed; right: 12px; bottom: 8px; color: #888; font: 12px system-ui, sans-serif; }
</style>
<style>${rendered.css}</style>
</head>
<body>
<div class="marpit">${rendered.slides.join("\n")}</div>
<div class="counter"></div>
<script>
const slides = [...document.querySelectorAll("div.marpit > section")];
const counter = document.querySelector(".counter");
let index = Math.max(0, Math.min(slides.length - 1, (parseInt(location.hash.slice(1), 10) || 1) - 1));
function fit() {
  const s = slides[index];
  const k = Math.min(innerWidth / s.offsetWidth, innerHeight / s.offsetHeight);
  s.style.transform = "translate(" + (innerWidth - s.offsetWidth * k) / 2 + "px, " + (innerHeight - s.offsetHeight * k) / 2 + "px) scale(" + k + ")";
}
function show(i) {
  index = Math.max(0, Math.min(slides.length - 1, i));
  slides.forEach((s, j) => s.classList.toggle("current", j === index));
  counter.textContent = (index + 1) + " / " + slides.length;
  history.replaceState(null, "", "#" + (index + 1));
  fit();
}
addEventListener("resize", fit);
addEventListener("keydown", (e) => {
  if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) show(index + 1);
  else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) show(index - 1);
  else if (e.key === "Home") show(0);
  else if (e.key === "End") show(slides.length - 1);
  else if (e.key === "f" || e.key === "F") document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  else return;
  e.preventDefault();
});
addEventListener("click", (e) => show(index + (e.clientX < innerWidth / 3 ? -1 : 1)));
show(index);
</script>
</body>
</html>
`;
}
