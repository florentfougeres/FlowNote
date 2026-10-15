import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { isTocParagraph } from "./toc";

/**
 * A note as HTML to paste in a mail or a document (Gmail, Pages, Google Docs):
 * headings, lists, tables, links, emphasis and quotes, with a few inline styles
 * since pasted HTML keeps no style sheet. Obsidian-only syntax becomes text:
 * wikilinks their name, callouts a quote with a bold title; comments and
 * vault images (unreachable outside the app) are left out.
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

  for (const comment of body.querySelectorAll('[data-kind="comment"]')) comment.remove();
  for (const raw of body.querySelectorAll(".inline-raw")) raw.replaceWith(Object.assign(document.createElement("code"), { textContent: raw.textContent }));
  for (const raw of body.querySelectorAll("pre.raw-block")) {
    raw.removeAttribute("class");
    raw.removeAttribute("data-kind");
  }
  for (const link of body.querySelectorAll(".wikilink, .embed")) link.replaceWith(link.textContent ?? "");
  for (const image of body.querySelectorAll("img")) {
    if (!/^https?:\/\//i.test(image.getAttribute("src") ?? "")) image.remove();
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

/** Copies the note: HTML for rich editors, its Markdown as plain text. */
export async function copyNoteAsHtml(doc: PMNode, title: string, markdown: string): Promise<void> {
  const html = `<meta charset="utf-8">${noteToHtml(doc, title)}`;
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([markdown], { type: "text/plain" }),
    }),
  ]);
}
