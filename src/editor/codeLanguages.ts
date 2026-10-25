import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { dismissPlugin, isDismissed, menuRenderer, MenuStore, normalizeText, type MenuItem } from "./menu";

/**
 * Languages offered after ``` and in a code block's language field: what the
 * highlighter knows (codeHighlight.ts), its short names, and the blocks the
 * app draws (mermaid, plotly, dataview, tasks).
 */
const LANGUAGES: [string, string][] = [
  ["python", "Python"],
  ["py", "Python"],
  ["bash", "Bash"],
  ["sh", "Shell"],
  ["shell", "Shell"],
  ["zsh", "Zsh"],
  ["javascript", "JavaScript"],
  ["js", "JavaScript"],
  ["typescript", "TypeScript"],
  ["ts", "TypeScript"],
  ["tsx", "TypeScript (JSX)"],
  ["jsx", "JavaScript (JSX)"],
  ["json", "JSON"],
  ["yaml", "YAML"],
  ["yml", "YAML"],
  ["toml", "TOML"],
  ["ini", "INI"],
  ["html", "HTML"],
  ["xml", "XML"],
  ["css", "CSS"],
  ["scss", "SCSS"],
  ["less", "Less"],
  ["sql", "SQL"],
  ["rust", "Rust"],
  ["rs", "Rust"],
  ["go", "Go"],
  ["java", "Java"],
  ["kotlin", "Kotlin"],
  ["swift", "Swift"],
  ["objectivec", "Objective-C"],
  ["c", "C"],
  ["cpp", "C++"],
  ["csharp", "C#"],
  ["php", "PHP"],
  ["ruby", "Ruby"],
  ["r", "R"],
  ["lua", "Lua"],
  ["perl", "Perl"],
  ["markdown", "Markdown"],
  ["md", "Markdown"],
  ["diff", "Diff"],
  ["makefile", "Makefile"],
  ["dockerfile", "Dockerfile"],
  ["graphql", "GraphQL"],
  ["latex", "LaTeX"],
  ["powershell", "PowerShell"],
  ["vbnet", "Visual Basic .NET"],
  ["wasm", "WebAssembly"],
  ["mermaid", "Diagramme Mermaid"],
  ["plotly", "Graphique Plotly"],
  ["dataview", "Requête Dataview"],
  ["dataviewjs", "Dataview JavaScript"],
  ["tasks", "Requête Tasks"],
  ["text", "Texte brut"],
];

export interface LanguageItem extends MenuItem {
  language: string;
}

/** Languages matching `query`: names starting with it first, then the ones containing it. */
export function filterLanguages(query: string, limit = 8): LanguageItem[] {
  const q = normalizeText(query.trim());
  const scored = LANGUAGES.map(([language, label], order) => {
    const name = normalizeText(language);
    const match = q === "" ? 1 : name === q ? 4 : name.startsWith(q) ? 3 : name.includes(q) ? 2 : normalizeText(label).includes(q) ? 1 : 0;
    return { language, label, order, match };
  }).filter((s) => s.match > 0);
  return scored
    .sort((a, b) => b.match - a.match || a.order - b.order)
    .slice(0, limit)
    .map(({ language, label }) => ({ key: language, language, title: language, description: label, icon: "</>" }));
}

const dismissedKey = new PluginKey<number | null>("codeFenceDismissed");

/**
 * ```py at the start of a paragraph: the matching languages in a menu; a
 * choice turns the paragraph into a code block in that language (typing a
 * space still does it with the text typed, shortcuts.ts).
 */
export const CodeFenceSuggest = Extension.create<{ store: MenuStore<LanguageItem> }>({
  name: "codeFenceSuggest",
  priority: 300,

  addOptions() {
    return { store: new MenuStore<LanguageItem>() };
  },

  addProseMirrorPlugins() {
    const { editor } = this;
    const { store } = this.options;
    return [
      dismissPlugin(dismissedKey),
      Suggestion<LanguageItem, LanguageItem>({
        editor,
        pluginKey: new PluginKey("codeFenceSuggestion"),
        char: "```",
        startOfLine: true,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return $from.parent.type.name === "paragraph" && $from.parentOffset === 0 && !isDismissed(dismissedKey, state, range.from);
        },
        // From the first letter: ``` then Enter still makes a block without a language.
        items: ({ query }) => (query ? filterLanguages(query) : []),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).setNode("codeBlock", { language: props.language, fence: "```" }).run();
        },
        render: menuRenderer({ store, heading: "Langage", close: (range) => editor.view.dispatch(editor.state.tr.setMeta(dismissedKey, range.from)) }),
      }),
    ];
  },
});
