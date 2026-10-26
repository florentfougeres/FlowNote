import type { NodeViewRenderer } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import type { BridgeRef } from "../bridge";
import { sanitizeHtml } from "../html";
import { renderMath, texOf } from "../math";
import { element, updateAttrs } from "./dom";
import { showImage } from "./image";

/** HTML with something to see once rendered (not a comment, not empty tags). */
function rendersSomething(fragment: DocumentFragment): boolean {
  return (fragment.textContent ?? "").trim() !== "" || fragment.querySelector("img, hr, table, svg, video, audio, details") !== null;
}

/**
 * Markdown kept verbatim (tables, HTML, math...): double-click to edit its
 * source. Math (`$$…$$`) is drawn by KaTeX, with a live preview under its
 * source while edited. A footnote's text (`[^1]: text`) shows as a footnote: its number,
 * then its text. HTML shows rendered (sanitized, html.ts), its images read
 * from the vault.
 */
/** Opens the source of the formula block at `pos` (just inserted from the menu or by `$$`), as a double-click would. */
export function editMathBlock(view: EditorView, pos: number) {
  window.setTimeout(() => {
    if (view.isDestroyed) return;
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement && dom.dataset.kind === "math") dom.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
}

export const rawBlockView = (bridge: BridgeRef): NodeViewRenderer => ({ node, editor, getPos }) => {
  const dom = element("div", "raw-block");
  dom.dataset.kind = node.attrs.kind;
  const footnote = node.attrs.kind === "footnoteDefinition";
  const html = node.attrs.kind === "html";
  const math = node.attrs.kind === "math";
  const pre = element(footnote || html || math ? "div" : "pre", footnote ? "footnote-def" : html ? "html-block" : math ? "math-block" : undefined);
  let source = node.attrs.source as string;
  const paint = () => {
    if (math) return renderMath(pre, texOf(source), true);
    if (html) {
      const fragment = sanitizeHtml(source);
      const shown = rendersSomething(fragment);
      pre.classList.toggle("source", !shown);
      if (!shown) return void (pre.textContent = source);
      for (const img of fragment.querySelectorAll("img")) showImage(img, img.getAttribute("src") ?? "", bridge);
      pre.replaceChildren(fragment);
      return;
    }
    const match = footnote ? /^\[\^([^\]]+)\]:[ \t]*([\s\S]*)$/.exec(source) : null;
    if (!match) {
      pre.textContent = source;
      return;
    }
    pre.dataset.label = match[1];
    const text = match[2].replace(/\n[ \t]+/g, "\n").trim();
    const body = element("span", text ? "footnote-text" : "footnote-text empty");
    // `code` in the note's text is shown as code; the rest as written.
    if (!text) body.textContent = "Double-cliquez pour écrire la note.";
    else text.split(/(`[^`\n]+`)/).forEach((part, i) => body.append(i % 2 ? Object.assign(element("code"), { textContent: part.slice(1, -1) }) : part));
    pre.replaceChildren(Object.assign(element("span", "footnote-label"), { textContent: match[1] }), body);
  };
  paint();
  let textarea: HTMLTextAreaElement | null = null;

  /** A formula's preview under its source while it is edited. */
  let preview: HTMLElement | null = null;
  const stopEditing = (commit: boolean) => {
    if (!textarea) return;
    // Forgotten before it leaves the page: leaving fires its blur, which calls this again.
    const field = textarea;
    textarea = null;
    const value = field.value;
    field.replaceWith(pre);
    preview?.remove();
    preview = null;
    if (commit && value !== source) updateAttrs(editor, getPos, { source: value });
    editor.commands.focus();
  };
  dom.addEventListener("dblclick", () => {
    if (textarea || !editor.isEditable) return;
    textarea = element("textarea");
    textarea.value = source;
    textarea.rows = Math.max(2, source.split("\n").length);
    textarea.spellcheck = false;
    textarea.addEventListener("blur", () => stopEditing(true));
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") stopEditing(false);
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) stopEditing(true);
    });
    pre.replaceWith(textarea);
    if (math) {
      const field = textarea;
      const shown = (preview = element("div", "math-block math-preview"));
      const draw = () => renderMath(shown, texOf(field.value), true);
      field.addEventListener("input", draw);
      draw();
      field.after(shown);
    }
    textarea.focus();
  });
  dom.append(pre);
  dom.title = html ? "Double-cliquez pour modifier le HTML" : math ? "Double-cliquez pour modifier la formule" : "Double-cliquez pour modifier le Markdown";
  return {
    dom,
    update: (n) => {
      if (n.type !== node.type || n.attrs.kind !== node.attrs.kind) return false;
      source = n.attrs.source;
      if (!textarea) paint();
      return true;
    },
    stopEvent: (event) => textarea !== null && event.target === textarea,
    ignoreMutation: () => true,
  };
};
