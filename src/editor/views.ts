import type { Editor, NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { BridgeRef } from "./bridge";
import { isImage } from "./bridge";
import { basename, dirname, noteTitle, resolveLink } from "../vault/links";

/**
 * Node views for blocks that need controls outside the editable text. None of
 * the controls write anything to the file unless they change the content
 * (folding a callout is a view-only state).
 */

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function updateAttrs(editor: Editor, getPos: () => number | undefined, attrs: Record<string, unknown>) {
  const pos = getPos();
  if (typeof pos !== "number") return;
  const current = editor.state.doc.nodeAt(pos);
  if (!current) return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attrs }));
}

/** List items, with a clickable checkbox for tasks. */
export const listItemView: NodeViewRenderer = ({ node, editor, getPos }) => {
  const dom = element("li");
  const content = element("div", "li-content");
  let checkbox: HTMLElement | null = null;

  const render = (n: PMNode) => {
    const task = n.attrs.checked !== null;
    dom.className = task ? "task" : "";
    if (task) dom.dataset.checked = String(n.attrs.checked);
    else delete dom.dataset.checked;
    if (task && !checkbox) {
      checkbox = element("span", "checkbox");
      checkbox.contentEditable = "false";
      checkbox.addEventListener("mousedown", (event) => {
        event.preventDefault();
        const current = editor.state.doc.nodeAt(getPos() ?? -1);
        if (!current) return;
        const checked = !current.attrs.checked;
        updateAttrs(editor, getPos, { checked, checkChar: checked ? "x" : " " });
      });
      dom.prepend(checkbox);
    } else if (!task && checkbox) {
      checkbox.remove();
      checkbox = null;
    }
  };

  dom.append(content);
  render(node);
  return {
    dom,
    contentDOM: content,
    update: (n) => {
      if (n.type !== node.type) return false;
      render(n);
      return true;
    },
    ignoreMutation: (mutation) => checkbox !== null && checkbox.contains(mutation.target as Node),
  };
};

/** Callouts; foldable ones (`[!type]-` / `[!type]+`) get a toggle arrow. */
export const calloutView: NodeViewRenderer = ({ node }) => {
  const dom = element("div", "callout");
  const toggle = element("button", "callout-fold");
  toggle.contentEditable = "false";
  toggle.tabIndex = -1;
  const body = element("div", "callout-body");
  let collapsed = node.attrs.fold === "-";

  const render = (n: PMNode) => {
    dom.dataset.callout = String(n.attrs.calloutType).toLowerCase();
    toggle.hidden = !n.attrs.fold;
    dom.classList.toggle("collapsed", Boolean(n.attrs.fold) && collapsed);
  };
  toggle.addEventListener("mousedown", (event) => {
    event.preventDefault();
    collapsed = !collapsed;
    dom.classList.toggle("collapsed", collapsed);
  });

  dom.append(toggle, body);
  render(node);
  return {
    dom,
    contentDOM: body,
    update: (n) => {
      if (n.type !== node.type) return false;
      render(n);
      return true;
    },
    ignoreMutation: (mutation) => toggle.contains(mutation.target as Node) || mutation.type === "attributes",
  };
};

/** Code blocks with an editable language label. */
export const codeBlockView: NodeViewRenderer = ({ node, editor, getPos }) => {
  const dom = element("div", "code-block");
  const header = element("div", "code-header");
  header.contentEditable = "false";
  const language = element("input", "code-language");
  language.placeholder = "langage";
  language.spellcheck = false;
  language.value = node.attrs.language;
  language.addEventListener("change", () => updateAttrs(editor, getPos, { language: language.value.trim() }));
  language.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      language.blur();
      editor.commands.focus();
    }
  });
  header.append(language);
  const pre = element("pre");
  const code = element("code");
  pre.append(code);
  dom.append(header, pre);
  return {
    dom,
    contentDOM: code,
    update: (n) => {
      if (n.type !== node.type) return false;
      if (document.activeElement !== language) language.value = n.attrs.language;
      return true;
    },
    stopEvent: (event) => event.target === language,
    ignoreMutation: (mutation) => header.contains(mutation.target as Node),
  };
};

/** Markdown kept verbatim (tables, HTML, math...): double-click to edit its source. */
export const rawBlockView: NodeViewRenderer = ({ node, editor, getPos }) => {
  const dom = element("div", "raw-block");
  dom.dataset.kind = node.attrs.kind;
  const pre = element("pre");
  pre.textContent = node.attrs.source;
  let source = node.attrs.source as string;
  let textarea: HTMLTextAreaElement | null = null;

  const stopEditing = (commit: boolean) => {
    if (!textarea) return;
    const value = textarea.value;
    textarea.replaceWith(pre);
    textarea = null;
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
    textarea.focus();
  });
  dom.append(pre);
  dom.title = "Double-cliquez pour modifier le Markdown";
  return {
    dom,
    update: (n) => {
      if (n.type !== node.type) return false;
      source = n.attrs.source;
      dom.dataset.kind = n.attrs.kind;
      if (!textarea) pre.textContent = source;
      return true;
    },
    stopEvent: (event) => textarea !== null && event.target === textarea,
    ignoreMutation: () => true,
  };
};

/** `[[links]]` and `![[embeds]]`: images are displayed, notes become cards, unresolved links are dimmed. */
function wikilinkView(bridge: BridgeRef): NodeViewRenderer {
  return ({ node }) => {
    const dom = element("span");
    dom.contentEditable = "false";
    let rendered = "";

    const render = (n: PMNode) => {
      const { target, alias, embed } = n.attrs as { target: string; alias: string | null; embed: boolean };
      const resolved = resolveLink(target, bridge.current.files, bridge.current.notePath);
      const key = `${target}|${alias}|${embed}|${resolved}`;
      if (key === rendered) return;
      rendered = key;
      dom.replaceChildren();
      dom.dataset.target = target;
      if (embed && resolved && isImage(resolved)) {
        dom.className = "embed-image";
        const img = element("img");
        img.alt = basename(resolved);
        // `![[image.png|300]]` or `|300x200` sets the displayed size.
        const size = /^(\d+)(?:x(\d+))?$/.exec(alias ?? "");
        if (size) {
          img.width = Number(size[1]);
          if (size[2]) img.height = Number(size[2]);
        }
        void bridge.current.loadImage(resolved).then((url) => (img.src = url));
        dom.append(img);
      } else if (embed) {
        dom.className = resolved ? "embed-card" : "embed-card unresolved";
        dom.textContent = `${resolved?.endsWith(".md") ? "📄" : "📎"} ${alias ?? (resolved ? noteTitle(resolved) : target)}`;
      } else {
        dom.className = resolved ? "wikilink" : "wikilink unresolved";
        dom.textContent = alias ?? target;
      }
    };
    render(node);
    return {
      dom,
      update: (n) => {
        if (n.type !== node.type) return false;
        render(n);
        return true;
      },
      ignoreMutation: () => true,
    };
  };
}

/** Markdown images `![alt](path)`: vault paths are relative to the note. */
function imageView(bridge: BridgeRef): NodeViewRenderer {
  return ({ node }) => {
    const img = element("img");
    const render = (n: PMNode) => {
      const src = String(n.attrs.src);
      img.alt = n.attrs.alt;
      if (/^(https?:|data:|blob:)/.test(src)) {
        img.src = src;
        return;
      }
      let path = src;
      try {
        path = decodeURI(src);
      } catch {
        // keep the raw source
      }
      const folder = dirname(bridge.current.notePath);
      const candidate = path.startsWith("/") ? path.slice(1) : [folder, path].filter(Boolean).join("/");
      const normalized: string[] = [];
      for (const part of candidate.split("/")) {
        if (part === "..") normalized.pop();
        else if (part !== ".") normalized.push(part);
      }
      const resolved = resolveLink(normalized.join("/"), bridge.current.files) ?? resolveLink(basename(path), bridge.current.files);
      if (resolved && isImage(resolved)) void bridge.current.loadImage(resolved).then((url) => (img.src = url));
    };
    render(node);
    return {
      dom: img,
      update: (n) => {
        if (n.type !== node.type) return false;
        render(n);
        return true;
      },
    };
  };
}

export function createNodeViews(bridge: BridgeRef): Record<string, NodeViewRenderer> {
  return {
    listItem: listItemView,
    callout: calloutView,
    codeBlock: codeBlockView,
    rawBlock: rawBlockView,
    wikilink: wikilinkView(bridge),
    image: imageView(bridge),
  };
}

/** Obsidian tags (`#tag`, `#nested/tag`, not only digits), highlighted in text. */
const TAG = /(^|\s)(#[\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

export function tagPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];
        state.doc.descendants((node, pos, parent) => {
          if (!node.isText || parent?.type.spec.code || node.marks.some((m) => m.type.name === "code" || m.type.name === "link")) return;
          for (const match of node.text!.matchAll(TAG)) {
            const from = pos + match.index! + match[1].length;
            decorations.push(Decoration.inline(from, from + match[2].length, { class: "tag" }));
          }
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

const HEADING_PLACEHOLDERS = ["Titre 1", "Titre 2", "Titre 3", "Titre 4", "Titre 5", "Titre 6"];

/** Placeholders for the empty block holding the cursor, and for empty callout titles. */
export function placeholderPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];
        const { $from, empty } = state.selection;
        const parent = $from.parent;
        if (empty && parent.isTextblock && parent.content.size === 0) {
          let text: string | null = null;
          if (parent.type.name === "paragraph") text = "Écrivez, ou tapez # - [] > ``` pour formater…";
          else if (parent.type.name === "heading") text = HEADING_PLACEHOLDERS[parent.attrs.level - 1];
          if (text) decorations.push(Decoration.node($from.before(), $from.after(), { class: "is-empty", "data-placeholder": text }));
        }
        state.doc.descendants((node, pos) => {
          if (node.type.name === "calloutTitle" && node.content.size === 0) {
            const callout = state.doc.resolve(pos).parent;
            const type = String(callout.attrs.calloutType);
            decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "is-empty", "data-placeholder": type[0].toUpperCase() + type.slice(1) }));
          }
          return node.isBlock && !node.isTextblock;
        });
        return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : null;
      },
    },
  });
}
