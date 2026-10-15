import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/**
 * Table of contents, HedgeDoc's way: a paragraph holding only `[TOC]` shows the
 * note's headings as links. The file keeps `[TOC]`; with the cursor in the
 * paragraph, its text is shown again to be edited.
 */

const TOC = /^\[toc\]$/i;

export function isTocParagraph(node: PMNode): boolean {
  return node.type.name === "paragraph" && TOC.test(node.textContent.trim());
}

interface Heading {
  level: number;
  text: string;
  pos: number;
}

function headingsOf(doc: PMNode): Heading[] {
  const headings: Heading[] = [];
  doc.forEach((node, pos) => {
    if (node.type.name === "heading" && node.textContent.trim()) headings.push({ level: node.attrs.level as number, text: node.textContent.trim(), pos });
  });
  return headings;
}

function goTo(view: EditorView, pos: number) {
  const { state } = view;
  if (pos >= state.doc.content.size) return;
  view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(pos + 1))));
  view.focus();
  (view.nodeDOM(pos) as HTMLElement | null)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderToc(view: EditorView, headings: Heading[], sourcePos: number): HTMLElement {
  const nav = document.createElement("nav");
  nav.className = "toc";
  nav.contentEditable = "false";
  const title = document.createElement("button");
  title.className = "toc-title";
  title.textContent = "Sommaire";
  title.title = "Modifier [TOC]";
  title.addEventListener("click", () => goTo(view, sourcePos));
  nav.append(title);
  if (headings.length === 0) {
    const empty = document.createElement("div");
    empty.className = "toc-empty";
    empty.textContent = "Aucun titre dans la note";
    nav.append(empty);
    return nav;
  }
  const top = Math.min(...headings.map((h) => h.level));
  for (const heading of headings) {
    const link = document.createElement("button");
    link.className = "toc-item";
    link.style.paddingLeft = `${(heading.level - top) * 16 + 8}px`;
    link.textContent = heading.text;
    link.addEventListener("click", () => goTo(view, heading.pos));
    nav.append(link);
  }
  return nav;
}

function decorations(state: EditorState): DecorationSet {
  const sources: { pos: number; node: PMNode }[] = [];
  state.doc.forEach((node, pos) => {
    if (isTocParagraph(node)) sources.push({ pos, node });
  });
  if (sources.length === 0) return DecorationSet.empty;
  const headings = headingsOf(state.doc);
  const signature = headings.map((h) => `${h.level}:${h.pos}:${h.text}`).join("|");
  const { from, to } = state.selection;
  const decos: Decoration[] = [];
  for (const { pos, node } of sources) {
    const end = pos + node.nodeSize;
    const editing = from <= end - 1 && to >= pos + 1;
    if (!editing) decos.push(Decoration.node(pos, end, { class: "toc-source" }));
    decos.push(
      Decoration.widget(pos, (view) => renderToc(view, headings, pos), {
        key: `toc:${pos}:${signature}`,
        side: -1,
        ignoreSelection: true,
        stopEvent: () => true,
      }),
    );
  }
  return DecorationSet.create(state.doc, decos);
}

const tocKey = new PluginKey("toc");

export function tocPlugin(): Plugin {
  return new Plugin({
    key: tocKey,
    props: { decorations },
  });
}
