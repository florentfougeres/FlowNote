import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { common, createLowlight } from "lowlight";

/**
 * Syntax highlighting of code blocks: decorations only, the document (and so
 * the Markdown) is never touched. Results are cached per node, so typing in
 * one block does not re-highlight the others.
 */

const lowlight = createLowlight(common);

const ALIASES: Record<string, string> = { sh: "bash", shell: "bash", zsh: "bash", js: "javascript", ts: "typescript", py: "python", yml: "yaml", md: "markdown", html: "xml", rs: "rust" };

interface Span {
  from: number;
  to: number;
  className: string;
}

type HastNode = { type: string; value?: string; properties?: { className?: string[] }; children?: HastNode[] };

function spans(children: HastNode[], classes: string[], offset: { at: number }, out: Span[]) {
  for (const child of children) {
    if (child.type === "text") {
      const length = child.value?.length ?? 0;
      if (classes.length && length) out.push({ from: offset.at, to: offset.at + length, className: classes.join(" ") });
      offset.at += length;
    } else if (child.children) {
      spans(child.children, [...classes, ...(child.properties?.className ?? [])], offset, out);
    }
  }
}

export function highlightSpans(code: string, language: string): Span[] {
  const name = ALIASES[language.toLowerCase()] ?? language.toLowerCase();
  if (!name || !lowlight.registered(name)) return [];
  const out: Span[] = [];
  spans(lowlight.highlight(name, code).children as HastNode[], [], { at: 0 }, out);
  return out;
}

const cache = new WeakMap<PMNode, Span[]>();

function decorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "codeBlock") return !node.isTextblock;
    let found = cache.get(node);
    if (!found) {
      found = highlightSpans(node.textContent, String(node.attrs.language ?? ""));
      cache.set(node, found);
    }
    for (const span of found) decos.push(Decoration.inline(pos + 1 + span.from, pos + 1 + span.to, { class: span.className }));
    return false;
  });
  return DecorationSet.create(doc, decos);
}

const key = new PluginKey<DecorationSet>("codeHighlight");

export function codeHighlightPlugin(): Plugin {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => decorations(state.doc),
      apply: (tr, set) => (tr.docChanged ? decorations(tr.doc) : set),
    },
    props: { decorations: (state) => key.getState(state) },
  });
}
