import type { NodeViewRenderer } from "@tiptap/core";
import { element, onThemeChange, updateAttrs } from "./dom";
import type { BridgeRef } from "../bridge";
import type { QueryLanguage } from "../../query/render";
import { filterLanguages, type LanguageItem } from "../codeLanguages";

/**
 * Code blocks with an editable language label. Mermaid blocks also show their
 * diagram, plotly blocks their chart (format of the Obsidian plugin
 * "obsidian-plotly"), and dataview and tasks blocks the results of their
 * query (plugins Dataview and Tasks). A diagram's or a query's source shows
 * only while the cursor is in the block; a chart stays interactive (zoom,
 * hover) and is edited with its header buttons: the visual editor or the text.
 */
export const codeBlockView = (bridge: BridgeRef): NodeViewRenderer => ({ node, editor, getPos }) => {
  const dom = element("div", "code-block");
  const header = element("div", "code-header");
  header.contentEditable = "false";
  const language = element("input", "code-language");
  language.placeholder = "langage";
  language.spellcheck = false;
  language.value = node.attrs.language;
  language.addEventListener("change", () => updateAttrs(editor, getPos, { language: language.value.trim() }));
  // The matching languages under the field, picked with the arrows and Enter or with a click.
  const choices = element("div", "code-language-menu");
  let matches: LanguageItem[] = [];
  let active = -1;
  const paintChoices = () => {
    choices.replaceChildren(
      ...matches.map((item, i) => {
        const choice = element("button", i === active ? "active" : undefined);
        choice.type = "button";
        choice.textContent = item.language;
        choice.title = item.description;
        choice.addEventListener("mousedown", (event) => {
          event.preventDefault();
          pick(item.language);
        });
        return choice;
      }),
    );
    choices.hidden = matches.length === 0;
  };
  const closeChoices = () => {
    matches = [];
    active = -1;
    paintChoices();
  };
  const pick = (value: string) => {
    language.value = value;
    closeChoices();
    updateAttrs(editor, getPos, { language: value });
    language.blur();
    editor.commands.focus();
  };
  language.addEventListener("input", () => {
    const query = language.value.trim();
    matches = query ? filterLanguages(query) : [];
    active = matches.length > 0 ? 0 : -1;
    paintChoices();
  });
  language.addEventListener("blur", closeChoices);
  language.addEventListener("keydown", (event) => {
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && matches.length > 0) {
      event.preventDefault();
      active = (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
      paintChoices();
      return;
    }
    if (event.key === "Enter" && active >= 0 && matches[active]) {
      event.preventDefault();
      pick(matches[active].language);
      return;
    }
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      closeChoices();
      language.blur();
      editor.commands.focus();
    }
  });
  closeChoices();
  const visualButton = element("button", "code-action");
  visualButton.type = "button";
  visualButton.textContent = "Éditeur visuel";
  const textButton = element("button", "code-action");
  textButton.type = "button";
  textButton.textContent = "Texte";
  header.append(language, choices, visualButton, textButton);
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
  const kindOf = (): "mermaid" | "plotly" | QueryLanguage | null => {
    const lang = String(current.attrs.language).trim().toLowerCase();
    return lang === "mermaid" || lang === "plotly" || lang === "dataview" || lang === "dataviewjs" || lang === "tasks" ? lang : null;
  };
  const isQuery = (kind: string | null): kind is QueryLanguage => kind === "dataview" || kind === "dataviewjs" || kind === "tasks";
  /** Runs the block's query again (a task checked, the window back in front). */
  const rerun = () => {
    if (!isQuery(kindOf())) return;
    rendered = null;
    render();
  };

  /** The visual editor of a chart, mounted while open. */
  let plotEditor: { update: (props: Parameters<typeof import("../PlotEditor").mountPlotEditor>[1]) => void; unmount: () => void } | null = null;
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
    void import("../PlotEditor").then(({ mountPlotEditor }) => {
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
      if (renderedKind === "plotly") void import("../plotly").then(({ purgePlot }) => purgePlot(diagram));
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
      if (isQuery(kind)) {
        void import("../../query/render").then(({ renderQueryBlock }) => {
          if (rendered === source) void renderQueryBlock(diagram, kind, source, bridge.current, rerun);
        });
        return;
      }
      if (!source.trim()) {
        if (kind === "plotly") void import("../plotly").then(({ purgePlot }) => purgePlot(diagram));
        showMessage("mermaid-empty", kind === "mermaid" ? "Diagramme Mermaid vide : cliquez pour l'écrire." : "Graphique vide : cliquez sur « Texte » pour l'écrire.");
        return;
      }
      if (kind === "mermaid") {
        import("../mermaid")
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
      import("../plotly")
        .then(({ renderPlot }) => renderPlot(target, source))
        .catch((error: unknown) => {
          if (rendered !== source) return;
          void import("../plotly").then(({ purgePlot }) => purgePlot(target));
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
  // Other notes may have changed while the window was behind: queries are run again.
  window.addEventListener("focus", rerun);
  language.addEventListener("focus", syncEditing);
  language.addEventListener("blur", syncEditing);

  // A diagram or a query is edited by clicking it (not its links and boxes); a chart keeps the click for zoom and hover.
  diagram.addEventListener("mousedown", (event) => {
    const kind = kindOf();
    if (kind !== "mermaid" && !(isQuery(kind) && !(event.target as Element).closest("a, input, button"))) return;
    const pos = getPos();
    if (pos === undefined || !editor.isEditable) return;
    event.preventDefault();
    editor.chain().focus().setTextSelection(pos + current.nodeSize - 1).run();
  });

  const syncKind = () => {
    const kind = kindOf();
    dom.classList.toggle("is-mermaid", kind !== null);
    dom.classList.toggle("is-plotly", kind === "plotly");
    dom.classList.toggle("is-query", isQuery(kind));
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
      if (renderedKind === "plotly") void import("../plotly").then(({ purgePlot }) => purgePlot(diagram.querySelector<HTMLElement>(".plotly-chart") ?? diagram));
      editor.off("selectionUpdate", syncEditing);
      editor.off("focus", syncEditing);
      editor.off("blur", syncEditing);
      stopThemeWatch();
      window.removeEventListener("focus", rerun);
    },
  };
};
