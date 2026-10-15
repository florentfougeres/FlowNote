import { CALLOUT_TYPES, calloutPicker } from "./callouts";
import { isoDay } from "../ticket/agenda";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { insertRawBlock, turnInto, type BlockKind } from "./blocks";
import { PLOT_TEMPLATE } from "./plotModel";
import type { BridgeRef, VaultBridge } from "./bridge";
import { menuRenderer, MenuStore, normalizeText, type MenuItem } from "./menu";
import { linkTextFor, sanitizeName, subpageFolder, uniquePath } from "../vault/links";

/**
 * Slash menu. The query stays in the document text (`/tit` filters on "tit")
 * like in Notion. The menu only opens when `/` is typed (not when the cursor
 * lands after an existing slash), at the start of a block or after a space —
 * so `1/2` and URLs do not open it — and never in code or callout titles.
 */

export interface SlashItem extends MenuItem {
  keywords: string[];
  run: (editor: Editor, range: Range, bridge: VaultBridge) => void;
}

/** Notion-style sub-page: a new note in a folder named after this one, linked from here. */
async function createSubpage(editor: Editor, range: Range, bridge: VaultBridge) {
  editor.chain().focus().deleteRange(range).run();
  const name = await bridge.askName("Nom de la sous-page", "Sans titre");
  if (!name || !bridge.notePath) return editor.commands.focus();
  const path = uniquePath(subpageFolder(bridge.notePath), `${sanitizeName(name) || "Sans titre"}.md`, bridge.files);
  await bridge.createFile(path, "");
  const link = editor.schema.nodes.wikilink.create({ target: linkTextFor(path, bridge.files), alias: null, embed: false });
  editor.chain().focus().insertContent(link.toJSON()).run();
  bridge.openPath(path);
}

const kind = (k: BlockKind, type?: string) => (editor: Editor, range: Range) => {
  turnInto(editor, k, range, type);
};

export const SLASH_ITEMS: SlashItem[] = [
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
  { key: "divider", title: "Séparateur", description: "Ligne horizontale", icon: "—", keywords: ["séparateur", "divider", "ligne", "hr"], run: kind("divider") },
  {
    key: "table",
    title: "Tableau",
    description: "Tableau Markdown",
    icon: "▦",
    keywords: ["tableau", "table"],
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    key: "math",
    title: "Bloc de maths",
    description: "Équation LaTeX $$",
    icon: "∑",
    keywords: ["maths", "équation", "latex", "math"],
    run: (editor, range) => insertRawBlock(editor, "$$\n\n$$", "math", range),
  },
];

// ---------------------------------------------------------------------------
// Ranking: matches first, then frecency (frequency weighted by recency).

const FRECENCY_KEY = "flownote:slash-frecency";
type Frecency = Record<string, { count: number; last: number }>;

export function loadFrecency(): Frecency {
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

/** The slash menu store is a generic menu store holding slash items. */
export class SlashMenuStore extends MenuStore<SlashItem> {}

/** Position of a `/` that was just typed, while it can still open the menu. */
export const freshSlashKey = new PluginKey<number | null>("freshSlash");

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

/** Inserts `/` at the cursor and opens the menu (used by the block handle's + button). */
export function openSlashMenu(editor: Editor) {
  const { from, to } = editor.state.selection;
  editor.view.dispatch(editor.state.tr.insertText("/", from, to).setMeta(freshSlashKey, from));
  editor.view.focus();
}

export const SlashCommand = Extension.create<{ store: SlashMenuStore; bridge: BridgeRef }>({
  name: "slashCommand",
  // Above the block keymap, so Enter picks a menu item instead of splitting the block.
  priority: 300,

  addOptions() {
    return { store: new SlashMenuStore(), bridge: { current: undefined as unknown as VaultBridge } };
  },

  addProseMirrorPlugins() {
    const { editor } = this;
    const { store, bridge } = this.options;
    const close = () => editor.view.dispatch(editor.state.tr.setMeta(freshSlashKey, null));

    return [
      freshSlashPlugin(),
      Suggestion<SlashItem, SlashItem>({
        editor,
        char: "/",
        allowedPrefixes: [" ", " "],
        allow: ({ state, range }) => freshSlashKey.getState(state) === range.from,
        items: ({ query }) => filterSlashItems(query, SLASH_ITEMS, loadFrecency()),
        command: ({ editor, range, props }) => {
          recordUse(props.key);
          props.run(editor, range, bridge.current);
        },
        render: menuRenderer({ store, heading: "Blocs", close, closeAfterMisses: 3 }),
      }),
    ];
  },
});
