import { CALLOUT_TYPES, calloutPicker } from "./callouts";
import { isoDay } from "../tasks/agenda";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { insertRawBlock, turnInto, type BlockKind } from "./blocks";
import { mathPrompt } from "./MathPrompt";
import { editMathBlock } from "./views/rawBlock";
import { PLOT_TEMPLATE } from "./plotModel";
import { tableSizePicker } from "./TableSizePicker";
import type { BridgeRef, VaultBridge } from "./bridge";
import { menuRenderer, MenuStore, normalizeText, type MenuItem } from "./menu";
import { linkTextFor, noteTitle, sanitizeName, subpageFolder, uniquePath } from "../vault/links";
import { insertMarkdownBlocks } from "./pasteMarkdown";

/**
 * Slash menu. The query stays in the document text (`/tit` filters on "tit")
 * The menu only opens when `/` is typed (not when the cursor
 * lands after an existing slash), at the start of a block or after a space —
 * so `1/2` and URLs do not open it — and never in code or callout titles.
 */

export interface SlashItem extends MenuItem {
  keywords: string[];
  run: (editor: Editor, range: Range, bridge: VaultBridge) => void;
}

/** `/modèle`: the chosen template, filled in for this note, inserted as its blocks. */
async function insertTemplate(editor: Editor, range: Range, bridge: VaultBridge) {
  editor.chain().focus().deleteRange(range).run();
  // The cursor's place, kept while the template list has the focus.
  const bookmark = editor.state.selection.getBookmark();
  const text = await bridge.pickTemplate?.(noteTitle(bridge.notePath));
  if (editor.isDestroyed) return;
  const { tr } = editor.state;
  editor.view.dispatch(tr.setSelection(bookmark.resolve(tr.doc)));
  if (text?.trim()) insertMarkdownBlocks(editor.view, text);
  editor.commands.focus();
}

/** Sub-page: a new note in a folder named after this one, linked from here; it starts with its title, like a new page. */
async function createSubpage(editor: Editor, range: Range, bridge: VaultBridge) {
  editor.chain().focus().deleteRange(range).run();
  const name = await bridge.askName("Nom de la sous-page", "Sans titre");
  if (!name || !bridge.notePath) return editor.commands.focus();
  const title = sanitizeName(name) || "Sans titre";
  const path = uniquePath(subpageFolder(bridge.notePath), `${title}.md`, bridge.files);
  await bridge.createFile(path, `# ${title}\n`);
  const link = editor.schema.nodes.wikilink.create({ target: linkTextFor(path, bridge.files), alias: null, embed: false });
  editor.chain().focus().insertContent(link.toJSON()).run();
  bridge.openPath(path);
}

const kind = (k: BlockKind, type?: string) => (editor: Editor, range: Range) => {
  turnInto(editor, k, range, type);
};

const SLASH_ITEMS: SlashItem[] = [
  { key: "paragraph", title: "Texte", description: "Paragraphe simple", icon: "¶", keywords: ["texte", "paragraphe", "text"], run: kind("paragraph") },
  { key: "heading1", title: "Titre 1", description: "Grand titre de section", icon: "H1", keywords: ["titre", "heading", "h1"], run: kind("heading1") },
  { key: "heading2", title: "Titre 2", description: "Titre de section moyen", icon: "H2", keywords: ["titre", "heading", "h2"], run: kind("heading2") },
  { key: "heading3", title: "Titre 3", description: "Petit titre de section", icon: "H3", keywords: ["titre", "heading", "h3"], run: kind("heading3") },
  { key: "bullet", title: "Liste à puces", description: "Liste non ordonnée", icon: "•", keywords: ["liste", "puces", "bullet", "ul"], run: kind("bullet") },
  { key: "ordered", title: "Liste numérotée", description: "Liste ordonnée", icon: "1.", keywords: ["liste", "numérotée", "ordered", "ol"], run: kind("ordered") },
  { key: "task", title: "Liste de tâches", description: "Cases à cocher", icon: "☐", keywords: ["tâche", "todo", "case", "checkbox"], run: kind("task") },
  { key: "toggle", title: "Toggle", description: "Bloc repliable (callout replié)", icon: "▸", keywords: ["toggle", "replier", "dérouler", "fold"], run: kind("toggle") },
  { key: "quote", title: "Citation", description: "Bloc de citation", icon: "❝", keywords: ["citation", "quote"], run: kind("quote") },
  { key: "callout", title: "Callout", description: "Encadré > [!note]", icon: "ⓘ", keywords: ["callout", "encadré", "note", "info"], run: kind("callout", "note") },
  { key: "callout-tip", title: "Callout astuce", description: "Encadré > [!tip]", icon: "✦", keywords: ["callout", "astuce", "tip"], run: kind("callout", "tip") },
  { key: "callout-warning", title: "Callout attention", description: "Encadré > [!warning]", icon: "⚠", keywords: ["callout", "attention", "warning", "avertissement"], run: kind("callout", "warning") },
  {
    key: "callout-other",
    title: "Autres callouts…",
    description: "Résumé, info, question, bug, exemple…",
    icon: "⋯",
    keywords: ["callout", "encadré", ...CALLOUT_TYPES.flatMap((c) => [c.type, c.label.toLowerCase(), ...c.aliases])],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      const coords = editor.view.coordsAtPos(editor.state.selection.from);
      calloutPicker.open({ x: coords.left, y: coords.bottom + 6, onPick: (type) => turnInto(editor, "callout", undefined, type) });
    },
  },
  {
    key: "admonition",
    title: "Admonition HedgeDoc",
    description: "Encadré :::info … :::",
    icon: "ⓘ",
    keywords: ["admonition", "hedgedoc", "encadré", "info", "success", "warning", "danger", "spoiler", ":::"],
    run: (editor, range) => {
      if (!turnInto(editor, "callout", range, "info")) return;
      // The callout just created is written as a HedgeDoc container.
      const { $from } = editor.state.selection;
      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);
        if (node.type.name !== "callout") continue;
        editor.view.dispatch(editor.state.tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, syntax: "hedgedoc", marker: ":::", extra: "" }));
        return;
      }
    },
  },
  { key: "columns", title: "Colonnes", description: "Blocs côte à côte (callout multi-column)", icon: "▥", keywords: ["colonnes", "columns", "côte à côte", "multi-column", "mise en page"], run: kind("columns") },
  { key: "subpage", title: "Sous-page", description: "Nouvelle note liée, rangée sous celle-ci", icon: "📄", keywords: ["page", "sous-page", "note", "subpage"], run: (e, r, b) => void createSubpage(e, r, b) },
  { key: "code", title: "Code", description: "Bloc de code", icon: "</>", keywords: ["code", "snippet"], run: kind("code") },
  {
    key: "mermaid",
    title: "Diagramme Mermaid",
    description: "Schéma rendu aussi par Obsidian",
    icon: "◇",
    keywords: ["mermaid", "diagramme", "schéma", "graphe", "flowchart"],
    run: (editor, range) => {
      turnInto(editor, "code", range);
      editor.commands.updateAttributes("codeBlock", { language: "mermaid" });
      editor.commands.insertContent("graph TD\n  A[Début] --> B[Fin]");
    },
  },
  {
    key: "flowchart",
    title: "Organigramme",
    description: "Diagramme flowchart.js (```flow, comme HedgeDoc)",
    icon: "⬚",
    keywords: ["organigramme", "flowchart", "flow", "diagramme", "logigramme"],
    run: (editor, range) => {
      turnInto(editor, "code", range);
      editor.commands.updateAttributes("codeBlock", { language: "flow" });
      editor.commands.insertContent("st=>start: Début\nop=>operation: Étape\ncond=>condition: Ça marche ?\ne=>end: Fin\n\nst->op->cond\ncond(yes)->e\ncond(no)->op");
    },
  },
  {
    key: "plotly",
    title: "Graphique",
    description: "Courbes, barres, camembert (plugin Obsidian Plotly)",
    icon: "📈",
    keywords: ["graphique", "plotly", "courbe", "barres", "camembert", "chart", "plot"],
    run: (editor, range) => {
      turnInto(editor, "code", range);
      editor.commands.updateAttributes("codeBlock", { language: "plotly" });
      editor.commands.insertContent(PLOT_TEMPLATE.trimEnd());
    },
  },
  {
    key: "due",
    title: "Échéance",
    description: "📅 date d'une tâche (plugin Obsidian Tasks)",
    icon: "📅",
    keywords: ["échéance", "date", "due", "deadline", "tâche"],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent(`📅 ${isoDay()}`).run();
    },
  },
  {
    key: "today",
    title: "Date du jour",
    description: "Insère la date d'aujourd'hui (AAAA-MM-JJ)",
    icon: "🗓",
    keywords: ["date", "aujourd'hui", "aujourdhui", "jour", "today"],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent(isoDay()).run();
    },
  },
  {
    key: "now",
    title: "Date et heure",
    description: "Insère la date et l'heure (AAAA-MM-JJ HH:MM)",
    icon: "🕒",
    keywords: ["date", "heure", "maintenant", "now", "time"],
    run: (editor, range) => {
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      editor.chain().focus().deleteRange(range).insertContent(`${isoDay(now)} ${time}`).run();
    },
  },
  {
    key: "toc",
    title: "Sommaire",
    description: "Liste des titres de la note ([TOC], comme HedgeDoc)",
    icon: "☰",
    keywords: ["sommaire", "toc", "table des matières", "plan", "titres"],
    run: (editor, range) => {
      // The cursor goes to a new line below, so the table of contents shows at once.
      editor.chain().focus().deleteRange(range).insertContent("[TOC]").splitBlock().run();
    },
  },
  { key: "divider", title: "Séparateur", description: "Ligne horizontale", icon: "—", keywords: ["séparateur", "divider", "ligne", "hr"], run: kind("divider") },
  {
    key: "table",
    title: "Tableau",
    description: "Tableau Markdown",
    icon: "▦",
    keywords: ["tableau", "table"],
    // Its size is chosen first (TableSizePicker.tsx).
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      const coords = editor.view.coordsAtPos(editor.state.selection.from);
      tableSizePicker.open({
        x: coords.left,
        y: coords.bottom + 6,
        onPick: (rows, cols) => editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run(),
        onCancel: () => editor.commands.focus(),
      });
    },
  },
  {
    key: "math",
    title: "Bloc de maths",
    description: "Équation LaTeX $$",
    icon: "∑",
    keywords: ["maths", "équation", "latex", "math"],
    run: (editor, range) => {
      insertRawBlock(editor, "$$\n\n$$", "math", range);
      // The new formula's source opens at once.
      let at = -1;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "rawBlock" && node.attrs.kind === "math" && node.attrs.source === "$$\n\n$$" && pos < editor.state.selection.from) at = pos;
      });
      if (at >= 0) editMathBlock(editor.view, at);
    },
  },
  {
    key: "template",
    title: "Modèle",
    description: "Une note du dossier de modèles, insérée ici",
    icon: "⎘",
    keywords: ["modèle", "template", "gabarit"],
    run: (editor, range, bridge) => void insertTemplate(editor, range, bridge),
  },
  {
    key: "inlineMath",
    title: "Formule en ligne",
    description: "Équation LaTeX dans le texte, $…$",
    icon: "𝑥",
    keywords: ["formule", "maths", "équation", "latex", "inline", "ligne"],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      const pos = editor.state.selection.from;
      const at = editor.view.coordsAtPos(pos);
      mathPrompt.open({
        editor,
        x: at.left,
        y: at.bottom,
        tex: "",
        onDone: (tex) => {
          if (tex?.trim()) editor.chain().focus().insertContentAt(pos, { type: "inlineRaw", attrs: { source: `$${tex.trim()}$`, kind: "inlineMath" } }).run();
          else editor.commands.focus();
        },
      });
    },
  },
  {
    key: "footnote",
    title: "Note de bas de page",
    description: "Appel [^1] ici, la note en bas",
    icon: "¹",
    keywords: ["note", "bas de page", "footnote", "référence", "renvoi"],
    run: (editor, range) => insertFootnote(editor, range),
  },
  {
    key: "embed",
    title: "Intégrer une note",
    description: "![[Note]] : son contenu dans celle-ci",
    icon: "⧉",
    keywords: ["intégrer", "embed", "transclusion", "inclure", "note"],
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertContent("![[").run(),
  },
  {
    key: "dataview",
    title: "Requête Dataview",
    description: "Liste ou tableau de notes (plugin Dataview)",
    icon: "⊞",
    keywords: ["dataview", "requête", "query", "tableau", "liste"],
    run: (editor, range) => {
      turnInto(editor, "code", range);
      editor.commands.updateAttributes("codeBlock", { language: "dataview" });
      editor.commands.insertContent('TABLE file.mtime AS "Modifiée"\nFROM #projet\nSORT file.mtime DESC');
    },
  },
  {
    key: "tasks",
    title: "Requête Tasks",
    description: "Tâches de tout le vault (plugin Tasks)",
    icon: "☑",
    keywords: ["tasks", "tâches", "requête", "todo", "échéance"],
    run: (editor, range) => {
      turnInto(editor, "code", range);
      editor.commands.updateAttributes("codeBlock", { language: "tasks" });
      editor.commands.insertContent("not done\ndue before in 7 days\nsort by due");
    },
  },
];

/**
 * Inserts a footnote: its call `[^n]` in place of `range` (after the selected
 * text when the range is empty), its text at the end of the note
 * (double-click to change it).
 */
export function insertFootnote(editor: Editor, range: Range, text = "Texte de la note.") {
  const used = new Set<string>();
  editor.state.doc.descendants((node) => {
    const label = /^\[\^([^\]]+)\]/.exec(String(node.attrs.source ?? ""))?.[1];
    if (label && (node.attrs.kind === "footnoteReference" || node.attrs.kind === "footnoteDefinition")) used.add(label);
  });
  let n = 1;
  while (used.has(String(n))) n++;
  const { schema } = editor.state;
  // Inserted at the range, not over the selection: selected text stays.
  editor.chain().focus().deleteRange(range).insertContentAt(range.from, { type: "inlineRaw", attrs: { source: `[^${n}]`, kind: "footnoteReference" } }).run();
  const { tr } = editor.state;
  tr.insert(tr.doc.content.size, schema.nodes.rawBlock.create({ source: `[^${n}]: ${text.replace(/\s*\n\s*/g, " ").trim()}`, kind: "footnoteDefinition" }));
  editor.view.dispatch(tr);
}

// ---------------------------------------------------------------------------
// Ranking: matches first, then frecency (frequency weighted by recency).

const FRECENCY_KEY = "flownote:slash-frecency";
type Frecency = Record<string, { count: number; last: number }>;

function loadFrecency(): Frecency {
  try {
    return JSON.parse(localStorage.getItem(FRECENCY_KEY) ?? "{}") as Frecency;
  } catch {
    return {};
  }
}

function recordUse(key: string) {
  try {
    const frecency = loadFrecency();
    const entry = frecency[key] ?? { count: 0, last: 0 };
    frecency[key] = { count: entry.count + 1, last: Date.now() };
    localStorage.setItem(FRECENCY_KEY, JSON.stringify(frecency));
  } catch {
    // Storage unavailable: ranking simply stays static.
  }
}

const HALF_LIFE_MS = 7 * 24 * 3600 * 1000;

function frecencyScore(frecency: Frecency, key: string, now: number): number {
  const entry = frecency[key];
  return entry ? entry.count * Math.pow(0.5, (now - entry.last) / HALF_LIFE_MS) : 0;
}


export function filterSlashItems(query: string, items: SlashItem[] = SLASH_ITEMS, frecency: Frecency = {}, now = Date.now()): SlashItem[] {
  const q = normalizeText(query.trim());
  const scored = items
    .map((item, order) => {
      const title = normalizeText(item.title);
      const words = [title, ...title.split(/\s+/), ...item.keywords.map(normalizeText)];
      let match = q === "" ? 1 : 0;
      if (q && title.startsWith(q)) match = 4;
      else if (q && words.some((w) => w.startsWith(q))) match = 3;
      else if (q && words.some((w) => w.includes(q))) match = 2;
      return { item, order, match, recent: frecencyScore(frecency, item.key, now) };
    })
    .filter((s) => s.match > 0);
  // Without a query the menu keeps its usual order so it stays predictable.
  if (q === "") return scored.map((s) => s.item);
  return scored.sort((a, b) => b.match - a.match || b.recent - a.recent || a.order - b.order).map((s) => s.item);
}

/** Icons per row of the block menu shown as a grid (setting "Menu des blocs", editor-extras.css). */
export const BLOCK_GRID_COLUMNS = 6;

/** The slash menu store is a generic menu store holding slash items. */
export class SlashMenuStore extends MenuStore<SlashItem> {}

/** Position of a `/` that was just typed, while it can still open the menu. */
const freshSlashKey = new PluginKey<number | null>("freshSlash");

function freshSlashPlugin(): Plugin<number | null> {
  return new Plugin<number | null>({
    key: freshSlashKey,
    state: {
      init: () => null,
      apply(tr, value) {
        const meta = tr.getMeta(freshSlashKey) as number | null | undefined;
        if (meta !== undefined) return meta;
        if (value === null) return null;
        const mapped = tr.mapping.mapResult(value);
        if (mapped.deleted || tr.doc.textBetween(mapped.pos, Math.min(mapped.pos + 1, tr.doc.content.size)) !== "/") return null;
        return mapped.pos;
      },
    },
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== "/") return false;
        const $from = view.state.doc.resolve(from);
        const inCell = $from.depth > 0 && ["cell", "header_cell"].includes($from.node(-1).type.spec.tableRole);
        if ($from.parent.type.spec.code || $from.parent.type.name === "calloutTitle" || inCell) return false;
        view.dispatch(view.state.tr.insertText("/", from, to).setMeta(freshSlashKey, from));
        return true;
      },
    },
  });
}

/**
 * Position of the `/` inserted by the block handle's + button, followed
 * through the changes, while it is still there: closing the menu with
 * nothing typed after it removes it again.
 */
const handleSlashKey = new PluginKey<HandleSlash | null>("handleSlash");

/** The + button's `/`, and whether the button made a new line for it (it goes too when nothing is chosen). */
interface HandleSlash {
  pos: number;
  newLine: boolean;
}

function handleSlashPlugin(): Plugin<HandleSlash | null> {
  return new Plugin<HandleSlash | null>({
    key: handleSlashKey,
    state: {
      init: () => null,
      apply(tr, value) {
        const meta = tr.getMeta(handleSlashKey) as HandleSlash | null | undefined;
        if (meta !== undefined) return meta;
        if (value === null) return null;
        const mapped = tr.mapping.mapResult(value.pos);
        return mapped.deleted || tr.doc.textBetween(mapped.pos, Math.min(mapped.pos + 1, tr.doc.content.size)) !== "/" ? null : { ...value, pos: mapped.pos };
      },
    },
  });
}

/** Whether the + button's `/` at `pos` is alone, nothing typed after it. */
function lonelySlash(state: EditorState, pos: number): boolean {
  const $pos = state.doc.resolve(pos);
  return state.doc.textBetween(pos, pos + 1) === "/" && !/\S/.test(state.doc.textBetween(pos + 1, $pos.end()).slice(0, 1));
}

/** Removes the + button's `/`, with the line the button made for it when that line holds nothing else. */
function removeHandleSlash(tr: Transaction, slash: HandleSlash) {
  const $pos = tr.doc.resolve(slash.pos);
  const line = $pos.parent;
  if (slash.newLine && line.textContent === "/" && line.childCount === 1 && tr.doc.childCount > 1) {
    // The line, or the list item holding it.
    const depth = $pos.depth > 1 && $pos.node(-1).type.name === "listItem" && $pos.node(-1).childCount === 1 ? $pos.depth - 1 : $pos.depth;
    tr.delete($pos.before(depth), $pos.after(depth));
  } else {
    tr.delete(slash.pos, slash.pos + 1);
  }
}

/** The slash menu's suggestion plugin: whether its menu is open, and for which `/`. */
const slashSuggestionKey = new PluginKey<{ active: boolean; range: Range }>("slashSuggestion");

/**
 * Inserts `/` at the cursor and opens the menu (used by the block handle's +
 * button). `newLine`: the button has just made the line, which goes with the
 * `/` when the menu closes unused.
 */
export function openSlashMenu(editor: Editor, newLine = false) {
  const { state } = editor;
  const tr = state.tr;
  // A + clicked while the menu of another one was open: the first `/` goes.
  const previous = handleSlashKey.getState(state);
  if (previous && lonelySlash(state, previous.pos)) removeHandleSlash(tr, previous);
  const from = tr.mapping.map(state.selection.from);
  const to = tr.mapping.map(state.selection.to);
  tr.insertText("/", from, to).setMeta(freshSlashKey, from).setMeta(handleSlashKey, { pos: from, newLine });
  editor.view.dispatch(tr);
  editor.view.focus();
}

/** The menu closed: the + button's `/` goes when nothing was typed after it. */
function dropHandleSlash(editor: Editor) {
  // Deferred: the menu closes while the editor view is updating.
  setTimeout(() => {
    if (editor.isDestroyed) return;
    const slash = handleSlashKey.getState(editor.state);
    if (!slash) return;
    // Its menu still open (the one that closed was another `/`'s): kept.
    const menu = slashSuggestionKey.getState(editor.state);
    if (menu?.active && menu.range.from === slash.pos) return;
    const tr = editor.state.tr.setMeta(handleSlashKey, null);
    if (lonelySlash(editor.state, slash.pos)) removeHandleSlash(tr, slash);
    editor.view.dispatch(tr);
  });
}

export const SlashCommand = Extension.create<{ store: SlashMenuStore; bridge: BridgeRef }>({
  name: "slashCommand",
  // Above the block keymap, so Enter picks a menu item instead of splitting the block.
  priority: 300,

  addOptions() {
    return { store: new SlashMenuStore(), bridge: { current: undefined as unknown as VaultBridge } };
  },

  // Leaving the note closes the menu: the + button's `/` goes away with it.
  onBlur() {
    if (freshSlashKey.getState(this.editor.state) !== null) this.editor.view.dispatch(this.editor.state.tr.setMeta(freshSlashKey, null));
  },

  addProseMirrorPlugins() {
    const { editor } = this;
    const { store, bridge } = this.options;
    const close = () => editor.view.dispatch(editor.state.tr.setMeta(freshSlashKey, null));
    const columns = () => (document.documentElement.dataset.blockMenu === "grid" ? BLOCK_GRID_COLUMNS : 1);
    const render = menuRenderer<SlashItem>({ store, heading: "Blocs", close, closeAfterMisses: 3, columns });

    return [
      freshSlashPlugin(),
      handleSlashPlugin(),
      Suggestion<SlashItem, SlashItem>({
        pluginKey: slashSuggestionKey,
        editor,
        char: "/",
        allowedPrefixes: [" ", " "],
        allow: ({ state, range }) => freshSlashKey.getState(state) === range.from,
        // `/modèle` only when the vault has templates (the app gives the bridge a way to pick one).
        items: ({ query }) => filterSlashItems(query, bridge.current.pickTemplate ? SLASH_ITEMS : SLASH_ITEMS.filter((i) => i.key !== "template"), loadFrecency()),
        command: ({ editor, range, props }) => {
          editor.view.dispatch(editor.state.tr.setMeta(handleSlashKey, null));
          recordUse(props.key);
          props.run(editor, range, bridge.current);
        },
        render: () => {
          const renderer = render!();
          return {
            ...renderer,
            onExit: (props) => {
              renderer.onExit?.(props);
              dropHandleSlash(editor);
            },
          };
        },
      }),
    ];
  },
});
