import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { element } from "./dom";

/** The text of the footnote labelled `label` in the note, from its definition `[^label]: text`. */
export function footnoteText(doc: PMNode, label: string): string | null {
  let text: string | null = null;
  doc.descendants((node) => {
    if (text !== null) return false;
    if (node.type.name !== "rawBlock" || node.attrs.kind !== "footnoteDefinition") return;
    const match = /^\[\^([^\]]+)\]:[ \t]*([\s\S]*)$/.exec(String(node.attrs.source));
    if (match && match[1] === label) text = match[2].replace(/\n[ \t]+/g, "\n").trim();
  });
  return text;
}

/**
 * Inline Markdown kept verbatim (inline HTML, footnote calls…). A footnote
 * call `[^1]` shows as a superscript number: its text on hover, a click
 * scrolls to it.
 */
export const inlineRawView: NodeViewRenderer = ({ node, editor }) => {
  const label = node.attrs.kind === "footnoteReference" ? (/^\[\^([^\]]+)\]$/.exec(node.attrs.source)?.[1] ?? null) : null;
  if (label === null) {
    const dom = element("span", "inline-raw");
    dom.dataset.kind = node.attrs.kind;
    dom.textContent = node.attrs.source;
    return { dom, update: (n) => n.type === node.type && n.attrs.kind === node.attrs.kind && ((dom.textContent = n.attrs.source), true) };
  }
  const dom = element("sup", "footnote-ref");
  dom.textContent = label;
  dom.dataset.label = label;
  dom.contentEditable = "false";
  dom.addEventListener("mouseenter", () => {
    dom.title = footnoteText(editor.state.doc, label) ?? "Note de bas de page sans texte";
  });
  dom.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const definition = editor.view.dom.querySelector<HTMLElement>(`.footnote-def[data-label="${CSS.escape(label)}"]`);
    if (!definition) return;
    definition.scrollIntoView({ block: "center", behavior: "smooth" });
    definition.classList.add("flash");
    window.setTimeout(() => definition.classList.remove("flash"), 1200);
  });
  return { dom, update: (n) => n.type === node.type && n.attrs.source === node.attrs.source };
};
