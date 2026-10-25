import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { isTocParagraph } from "./toc";
import { inlineVaultImages } from "./imageCopies";
import { sanitizeHtml } from "./html";
import { saveExport } from "../presentation/exportHtml";

/**
 * A note as HTML to paste in a mail or a document (Gmail, Pages, Google Docs):
 * headings, lists, tables, links, emphasis and quotes, with a few inline styles
 * since pasted HTML keeps no style sheet. Obsidian-only syntax becomes text:
 * wikilinks their name, callouts a quote with a bold title; comments are
 * left out. Vault images go in as data (imageCopies.ts), or are left out when
 * not shown.
 */

const STYLES: Record<string, string> = {
  table: "border-collapse: collapse;",
  th: "border: 1px solid #d0d0d0; padding: 4px 8px; background: #f5f5f5;",
  td: "border: 1px solid #d0d0d0; padding: 4px 8px;",
  pre: "background: #f5f5f5; padding: 8px 12px; border-radius: 6px; white-space: pre-wrap; font-family: Menlo, monospace; font-size: 13px;",
  code: "background: #f0f0f0; padding: 1px 4px; border-radius: 4px; font-family: Menlo, monospace; font-size: 0.9em;",
  blockquote: "margin: 0; padding-left: 12px; border-left: 3px solid #d0d0d0; color: #555;",
  mark: "background: #fff3a3;",
};

export function noteToHtml(doc: PMNode, title: string): string {
  const body = document.createElement("div");
  const heading = document.createElement("h1");
  heading.textContent = title;
  body.append(heading);
  const content: PMNode[] = [];
  doc.forEach((node) => {
    if (!isTocParagraph(node)) content.push(node);
  });
  const schema = doc.type.schema;
  body.append(DOMSerializer.fromSchema(schema).serializeFragment(schema.nodes.doc.create(null, content).content));

  inlineVaultImages(body);
  for (const comment of body.querySelectorAll('[data-kind="comment"]')) comment.remove();
  // HTML written in the note is the page's HTML (cleaned like on screen).
  for (const raw of body.querySelectorAll('pre.raw-block[data-kind="html"]')) raw.replaceWith(sanitizeHtml(raw.textContent ?? ""));
  for (const raw of body.querySelectorAll('.inline-raw[data-kind="html"]')) raw.replaceWith(sanitizeHtml(raw.textContent ?? ""));
  for (const raw of body.querySelectorAll(".inline-raw")) raw.replaceWith(Object.assign(document.createElement("code"), { textContent: raw.textContent }));
  for (const raw of body.querySelectorAll("pre.raw-block")) {
    raw.removeAttribute("class");
    raw.removeAttribute("data-kind");
  }
  for (const link of body.querySelectorAll(".wikilink, .embed")) link.replaceWith(link.textContent ?? "");
  for (const image of body.querySelectorAll("img")) {
    if (!/^(https?:\/\/|data:)/i.test(image.getAttribute("src") ?? "")) image.remove();
  }
  for (const softBreak of body.querySelectorAll("br.soft")) softBreak.replaceWith(" ");
  for (const item of body.querySelectorAll("li.task")) {
    const first = item.firstElementChild ?? item;
    first.prepend(item.getAttribute("data-checked") === "true" ? "☑ " : "☐ ");
    item.removeAttribute("class");
    item.removeAttribute("data-checked");
    item.parentElement?.setAttribute("style", "list-style: none; padding-left: 0;");
  }
  for (const callout of body.querySelectorAll("div.callout")) {
    const quote = document.createElement("blockquote");
    const title = callout.querySelector(":scope > .callout-title");
    if (title) {
      const strong = document.createElement("strong");
      strong.textContent = title.textContent?.trim() || callout.getAttribute("data-callout") || "";
      const p = document.createElement("p");
      p.append(strong);
      title.replaceWith(p);
    }
    quote.append(...callout.childNodes);
    callout.replaceWith(quote);
  }
  for (const pre of body.querySelectorAll("pre")) pre.removeAttribute("data-language");
  for (const [tag, style] of Object.entries(STYLES)) {
    for (const element of body.querySelectorAll(tag)) {
      if (tag === "code" && element.parentElement?.tagName === "PRE") continue;
      element.setAttribute("style", `${element.getAttribute("style") ?? ""}${style}`);
    }
  }
  return body.innerHTML;
}

const BLOCKS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "BLOCKQUOTE", "DIV", "HR", "DETAILS", "SUMMARY", "FIGURE", "SECTION"]);

/** HTML of `element`, one block per line and indented, so that the exported file reads well. */
function prettyHtml(element: Element, depth: number): string {
  const indent = "  ".repeat(depth);
  const hasBlocks = [...element.children].some((child) => BLOCKS.has(child.tagName));
  if (!BLOCKS.has(element.tagName) || !hasBlocks) return indent + element.outerHTML;
  const outer = element.outerHTML;
  const open = outer.slice(0, outer.indexOf(">") + 1);
  const lines = [...element.childNodes].flatMap((child) => {
    if (child instanceof Element) return [prettyHtml(child, depth + 1)];
    const text = child.textContent?.trim();
    return text ? [`${indent}  ${Object.assign(document.createElement("span"), { textContent: text }).innerHTML}`] : [];
  });
  return [indent + open, ...lines, `${indent}</${element.tagName.toLowerCase()}>`].join("\n");
}

/** The note as a standalone web page: its title, its content, images included. */
export function noteHtmlDocument(doc: PMNode, title: string): string {
  const body = document.createElement("div");
  body.innerHTML = noteToHtml(doc, title);
  const content = [...body.children].map((child) => prettyHtml(child, 2)).join("\n");
  const escaped = Object.assign(document.createElement("span"), { textContent: title }).innerHTML;
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escaped}</title>
  <style>
    body { max-width: 720px; margin: 40px auto; padding: 0 24px; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f1f1f; }
    img { max-width: 100%; }
    table { min-width: 50%; }
  </style>
</head>
<body>
${content}
</body>
</html>
`;
}

/** Exports the note as an HTML file (desktop: where to save it, then opened; browser: a download). */
export async function exportNoteHtml(doc: PMNode, title: string): Promise<string | null> {
  return saveExport(new Blob([noteHtmlDocument(doc, title)], { type: "text/html" }), `${title}.html`, "Page web", "html");
}
