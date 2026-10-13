import type { Editor, NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

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

export const nodeViews: Record<string, NodeViewRenderer> = {
  listItem: listItemView,
  callout: calloutView,
  codeBlock: codeBlockView,
  rawBlock: rawBlockView,
};

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
