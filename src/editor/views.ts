import type { Editor, NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { BridgeRef } from "./bridge";
import { isImage } from "./bridge";
import { basename, dirname, noteTitle, resolveLink } from "../vault/links";
import { calloutIconSvg, calloutInfo, calloutPicker } from "./callouts";
import { HEADING_PLACEHOLDERS } from "./syntaxMarks";

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

/**
 * Calls `listener` when the app's palette changes: the theme chosen in the
 * settings (`data-theme` on the root) or the system's while it is followed.
 * Returns the unsubscribe function.
 */
function onThemeChange(listener: () => void): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener("change", listener);
  return () => {
    observer.disconnect();
    media?.removeEventListener("change", listener);
  };
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

/**
 * Callouts, with the icon and color of their type (clicking the icon changes
 * the type); foldable ones (`[!type]-` / `[!type]+`) get a toggle arrow.
 */
export const calloutView: NodeViewRenderer = ({ node, editor, getPos }) => {
  const dom = element("div", "callout");
  const toggle = element("button", "callout-fold");
  toggle.contentEditable = "false";
  toggle.tabIndex = -1;
  const icon = element("button", "callout-icon");
  icon.contentEditable = "false";
  icon.tabIndex = -1;
  icon.title = "Changer le type de callout";
  const body = element("div", "callout-body");
  let collapsed = node.attrs.fold === "-";
  let current = node;
  let shownType = "";

  const render = (n: PMNode) => {
    current = n;
    const type = String(n.attrs.calloutType).toLowerCase();
    dom.dataset.callout = type;
    if (type !== shownType) {
      const info = calloutInfo(type);
      dom.style.setProperty("--callout", `rgb(${info.color})`);
      icon.innerHTML = calloutIconSvg(info);
      shownType = type;
    }
    toggle.hidden = !n.attrs.fold;
    dom.classList.toggle("collapsed", Boolean(n.attrs.fold) && collapsed);
  };
  icon.addEventListener("mousedown", (event) => {
    event.preventDefault();
    if (!editor.isEditable) return;
    const rect = icon.getBoundingClientRect();
    calloutPicker.open({
      x: rect.left,
      y: rect.bottom + 6,
      current: String(current.attrs.calloutType),
      onPick: (type) => updateAttrs(editor, getPos, { calloutType: type }),
    });
  });
  toggle.addEventListener("mousedown", (event) => {
    event.preventDefault();
    collapsed = !collapsed;
    dom.classList.toggle("collapsed", collapsed);
  });

  dom.append(toggle, icon, body);
  render(node);
  return {
    dom,
    contentDOM: body,
    update: (n) => {
      if (n.type !== node.type) return false;
      render(n);
      return true;
    },
    stopEvent: (event) => toggle.contains(event.target as Node) || icon.contains(event.target as Node),
    ignoreMutation: (mutation) => toggle.contains(mutation.target as Node) || icon.contains(mutation.target as Node) || mutation.type === "attributes",
  };
};

/**
 * Code blocks with an editable language label. Mermaid blocks also show their
 * diagram, and plotly blocks their chart (format of the Obsidian plugin
 * "obsidian-plotly"). A diagram's source shows only while the cursor is in
 * the block; a chart stays interactive (zoom, hover) and is edited with its
 * header buttons: the visual editor or the text.
 */
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
  const visualButton = element("button", "code-action");
  visualButton.type = "button";
  visualButton.textContent = "Éditeur visuel";
  const textButton = element("button", "code-action");
  textButton.type = "button";
  textButton.textContent = "Texte";
  header.append(language, visualButton, textButton);
  const pre = element("pre");
  const code = element("code");
  pre.append(code);
  const diagram = element("div", "mermaid-preview");
  diagram.contentEditable = "false";
  const panel = element("div", "plot-editor-host");
  panel.contentEditable = "false";
  // The source or the visual editor, above the chart (one at a time).
  dom.append(header, pre, panel, diagram);

  let current = node;
  let rendered: string | null = null;
  let renderedKind: string | null = null;
  let timer = 0;
  const kindOf = (): "mermaid" | "plotly" | null => {
    const lang = String(current.attrs.language).trim().toLowerCase();
    return lang === "mermaid" || lang === "plotly" ? lang : null;
  };

  /** The visual editor of a chart, mounted while open. */
  let plotEditor: { update: (props: Parameters<typeof import("./PlotEditor").mountPlotEditor>[1]) => void; unmount: () => void } | null = null;
  let editorOpen = false;

  /** Replaces the block's text (from the visual editor). */
  const setSource = (text: string) => {
    const pos = getPos();
    if (pos === undefined || !editor.isEditable) return;
    const from = pos + 1;
    const to = pos + current.nodeSize - 1;
    const tr = editor.state.tr;
    if (text) tr.replaceWith(from, to, editor.schema.text(text));
    else tr.delete(from, to);
    editor.view.dispatch(tr);
  };

  /** Puts the cursor at the end of the block's text: the source shows. */
  const editText = () => {
    const pos = getPos();
    if (pos === undefined || !editor.isEditable) return;
    closeEditor();
    editor.chain().focus().setTextSelection(pos + current.nodeSize - 1).run();
  };

  const editorProps = () => ({ source: current.textContent, onChange: setSource, onEditText: editText, onClose: closeEditor });
  const openEditor = () => {
    if (editorOpen || !editor.isEditable) return;
    editorOpen = true;
    dom.classList.add("visual-editing");
    void import("./PlotEditor").then(({ mountPlotEditor }) => {
      if (editorOpen && !plotEditor) plotEditor = mountPlotEditor(panel, editorProps());
    });
  };
  function closeEditor() {
    editorOpen = false;
    dom.classList.remove("visual-editing");
    plotEditor?.unmount();
    plotEditor = null;
  }
  visualButton.addEventListener("click", () => (editorOpen ? closeEditor() : openEditor()));
  textButton.addEventListener("click", editText);

  const showMessage = (className: string, text: string) => {
    diagram.replaceChildren(Object.assign(element("div", className), { textContent: text }));
  };

  const render = () => {
    window.clearTimeout(timer);
    const kind = kindOf();
    if (kind !== renderedKind) {
      // Another kind of block: what was drawn goes.
      if (renderedKind === "plotly") void import("./plotly").then(({ purgePlot }) => purgePlot(diagram));
      diagram.replaceChildren();
      rendered = null;
      renderedKind = kind;
      if (kind !== "plotly") closeEditor();
    }
    if (!kind) return;
    const source = current.textContent;
    if (source === rendered) return;
    timer = window.setTimeout(() => {
      rendered = source;
      if (!source.trim()) {
        if (kind === "plotly") void import("./plotly").then(({ purgePlot }) => purgePlot(diagram));
        showMessage("mermaid-empty", kind === "mermaid" ? "Diagramme Mermaid vide : cliquez pour l'écrire." : "Graphique vide : cliquez sur « Texte » pour l'écrire.");
        return;
      }
      if (kind === "mermaid") {
        import("./mermaid")
          .then(({ renderMermaid }) => renderMermaid(source))
          .then((svg) => {
            if (rendered === source) diagram.innerHTML = svg;
          })
          .catch((error: unknown) => {
            if (rendered === source) showMessage("mermaid-error", `Diagramme invalide : ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
          });
        return;
      }
      // Plotly draws in its own element, kept between renders (it updates in place).
      let chart = diagram.querySelector<HTMLElement>(":scope > .plotly-chart");
      if (!chart) {
        chart = element("div", "plotly-chart");
        diagram.replaceChildren(chart);
      }
      const target = chart;
      import("./plotly")
        .then(({ renderPlot }) => renderPlot(target, source))
        .catch((error: unknown) => {
          if (rendered !== source) return;
          void import("./plotly").then(({ purgePlot }) => purgePlot(target));
          showMessage("mermaid-error", `Graphique invalide : ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
        });
    }, rendered === null ? 0 : 300);
  };

  // Source visible while editing inside the block, diagram only otherwise.
  const syncEditing = () => {
    const pos = getPos();
    if (editor.isDestroyed || pos === undefined) return;
    const { from, to } = editor.state.selection;
    const inside = from > pos && to < pos + current.nodeSize && editor.isFocused;
    dom.classList.toggle("editing", inside || document.activeElement === language);
    // The cursor went elsewhere in the note: the visual editor closes.
    if (editorOpen && editor.isFocused && !inside) closeEditor();
  };
  editor.on("selectionUpdate", syncEditing);
  editor.on("focus", syncEditing);
  editor.on("blur", syncEditing);
  // Charts and diagrams take the palette's colours when drawn: drawn again when it changes.
  const stopThemeWatch = onThemeChange(() => {
    if (!renderedKind) return;
    rendered = null;
    render();
  });
  language.addEventListener("focus", syncEditing);
  language.addEventListener("blur", syncEditing);

  // A diagram is edited by clicking it; a chart keeps the click for zoom and hover.
  diagram.addEventListener("mousedown", (event) => {
    if (kindOf() !== "mermaid") return;
    const pos = getPos();
    if (pos === undefined || !editor.isEditable) return;
    event.preventDefault();
    editor.chain().focus().setTextSelection(pos + current.nodeSize - 1).run();
  });

  const syncKind = () => {
    const kind = kindOf();
    dom.classList.toggle("is-mermaid", kind !== null);
    dom.classList.toggle("is-plotly", kind === "plotly");
  };
  syncKind();
  render();

  return {
    dom,
    contentDOM: code,
    update: (n) => {
      if (n.type !== node.type) return false;
      current = n;
      if (document.activeElement !== language) language.value = n.attrs.language;
      syncKind();
      render();
      plotEditor?.update(editorProps());
      return true;
    },
    stopEvent: (event) => header.contains(event.target as Node) || diagram.contains(event.target as Node) || panel.contains(event.target as Node),
    // The block's own classes (editing, kind, visual editor) are not content.
    ignoreMutation: (mutation) =>
      (mutation.type === "attributes" && mutation.target === dom) ||
      header.contains(mutation.target as Node) ||
      diagram.contains(mutation.target as Node) ||
      panel.contains(mutation.target as Node),
    destroy: () => {
      window.clearTimeout(timer);
      closeEditor();
      if (renderedKind === "plotly") void import("./plotly").then(({ purgePlot }) => purgePlot(diagram.querySelector<HTMLElement>(".plotly-chart") ?? diagram));
      editor.off("selectionUpdate", syncEditing);
      editor.off("focus", syncEditing);
      editor.off("blur", syncEditing);
      stopThemeWatch();
    },
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
    let unmount: (() => void) | null = null;

    const render = (n: PMNode) => {
      const { target, alias, embed } = n.attrs as { target: string; alias: string | null; embed: boolean };
      const resolved = resolveLink(target, bridge.current.files, bridge.current.notePath);
      const key = `${target}|${alias}|${embed}|${resolved}`;
      if (key === rendered) return;
      rendered = key;
      unmount?.();
      unmount = null;
      dom.replaceChildren();
      dom.dataset.target = target;
      if (embed && resolved && /\.base$/i.test(resolved) && bridge.current.mountBase) {
        // A base in the note: its views, live (rendered by the app).
        dom.className = "embed-base";
        const box = element("div");
        dom.append(box);
        unmount = bridge.current.mountBase(box, resolved);
      } else if (embed && resolved && isImage(resolved)) {
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
      // Clicks and keys inside an embedded base belong to it, not to the editor.
      stopEvent: () => dom.classList.contains("embed-base"),
      ignoreMutation: () => true,
      destroy: () => unmount?.(),
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

function tagDecorations(doc: PMNode, from: number, to: number): Decoration[] {
  const decorations: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    node.forEach((child, offset) => {
      if (!child.isText || child.marks.some((m) => m.type.name === "code" || m.type.name === "link")) return;
      for (const match of child.text!.matchAll(TAG)) {
        const start = pos + 1 + offset + match.index! + match[1].length;
        decorations.push(Decoration.inline(start, start + match[2].length, { class: "tag" }));
      }
    });
    return false;
  });
  return decorations;
}

/** Ranges of the new document touched by a transaction. */
export function changedRanges(tr: Transaction): [number, number][] {
  const ranges: [number, number][] = [];
  tr.mapping.maps.forEach((map, i) => {
    const rest = tr.mapping.slice(i + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => ranges.push([rest.map(newStart, -1), rest.map(newEnd, 1)]));
  });
  return ranges;
}

const tagKey = new PluginKey<DecorationSet>("tags");

/**
 * Obsidian tags highlighted in text. Decorations are kept in the plugin state
 * and only recomputed for the text blocks a transaction touches, so typing
 * stays fast in long notes.
 */
export function tagPlugin(): Plugin {
  return new Plugin<DecorationSet>({
    key: tagKey,
    state: {
      init: (_config, state) => DecorationSet.create(state.doc, tagDecorations(state.doc, 0, state.doc.content.size)),
      apply(tr, set) {
        if (!tr.docChanged) return set;
        let next = set.map(tr.mapping, tr.doc);
        for (const [from, to] of changedRanges(tr)) {
          // Recompute whole text blocks around the change.
          const start = Math.max(0, Math.min(from, tr.doc.content.size));
          const end = Math.max(start, Math.min(to, tr.doc.content.size));
          let blockFrom = start;
          let blockTo = end;
          tr.doc.nodesBetween(start, end, (node, pos) => {
            if (node.isTextblock) {
              blockFrom = Math.min(blockFrom, pos);
              blockTo = Math.max(blockTo, pos + node.nodeSize);
              return false;
            }
            return true;
          });
          const $start = tr.doc.resolve(start);
          if ($start.parent.isTextblock) {
            blockFrom = Math.min(blockFrom, $start.before());
            blockTo = Math.max(blockTo, $start.after());
          }
          next = next.remove(next.find(blockFrom, blockTo)).add(tr.doc, tagDecorations(tr.doc, blockFrom, blockTo));
        }
        return next;
      },
    },
    props: {
      decorations: (state) => tagKey.getState(state),
    },
  });
}

/** Placeholders for the empty block holding the cursor, and for empty callout titles. */
export function placeholderPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];
        const { $from, empty } = state.selection;
        const parent = $from.parent;
        const inCell = $from.depth > 0 && ["cell", "header_cell"].includes($from.node(-1).type.spec.tableRole);
        if (empty && parent.isTextblock && parent.content.size === 0 && !inCell) {
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

