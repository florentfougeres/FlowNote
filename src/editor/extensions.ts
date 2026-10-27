import { Extension, type AnyExtension } from "@tiptap/core";
import { dropCursor } from "@tiptap/pm/dropcursor";
import { gapCursor } from "@tiptap/pm/gapcursor";
import { history, redo, undo } from "@tiptap/pm/history";
import { documentExtensions } from "./schema";
import { BlockKeymap } from "./keymap";
import { MarkdownShortcuts } from "./shortcuts";
import { createNodeViews } from "./views";
import { placeholderPlugin } from "./placeholder";
import { tagPlugin } from "./tags";
import { SlashCommand, SlashMenuStore } from "./slash";
import { WikilinkSuggest, type LinkItem } from "./wikilinks";
import { MenuStore } from "./menu";
import { EmojiSuggest, type EmojiItem } from "./emoji";
import { CodeFenceSuggest, type LanguageItem } from "./codeLanguages";
import { codeHighlightPlugin } from "./codeHighlight";
import { findPlugin } from "./find";
import { tocPlugin } from "./toc";
import { backtickPlugin } from "./backticks";
import { removeCodeAround, syntaxMarksPlugin } from "./syntaxMarks";
import { autolinkPlugin } from "./autolink";
import { grammarPlugin } from "./grammar";
import { titleHeadingPlugin } from "./titleHeading";
import { gitGutterPlugin } from "./gitGutter";
import { dueDatePlugin } from "../tasks/dueDates";
import { NULL_BRIDGE, type BridgeRef } from "./bridge";
import { highlightPencilPlugin, toggleUnderline } from "./format";
import { typedHtmlPlugin } from "./typedHtml";
import { headingFoldPlugin } from "./headingFold";
import { blockIdPlugin } from "./blockLinks";

const Editing = Extension.create({
  priority: 150,
  name: "editing",
  addProseMirrorPlugins: () => [history(), gapCursor(), dropCursor({ color: "#2383e2", width: 2 }), placeholderPlugin(), tagPlugin(), codeHighlightPlugin(), findPlugin(), grammarPlugin(), dueDatePlugin(), tocPlugin(), backtickPlugin(), syntaxMarksPlugin(), autolinkPlugin(), gitGutterPlugin(), highlightPencilPlugin(), typedHtmlPlugin(), headingFoldPlugin(), blockIdPlugin()],
  addKeyboardShortcuts() {
    return {
      "Mod-z": () => undo(this.editor.state, this.editor.view.dispatch),
      "Mod-Shift-z": () => redo(this.editor.state, this.editor.view.dispatch),
      "Mod-y": () => redo(this.editor.state, this.editor.view.dispatch),
      "Mod-b": () => this.editor.commands.toggleMark("bold"),
      "Mod-i": () => this.editor.commands.toggleMark("italic"),
      "Mod-e": () => {
        const tr = removeCodeAround(this.editor.state);
        if (!tr) return this.editor.commands.toggleMark("code");
        this.editor.view.dispatch(tr);
        return true;
      },
      "Mod-Shift-s": () => this.editor.commands.toggleMark("strike"),
      "Mod-u": () => {
        toggleUnderline(this.editor);
        return true;
      },
      "Mod-Shift-h": () => this.editor.commands.toggleMark("highlight"),
      "Shift-Enter": () => this.editor.commands.insertContent({ type: "softBreak" }),
    };
  },
});

export interface EditorWiring {
  slashStore: SlashMenuStore;
  linkStore: MenuStore<LinkItem>;
  emojiStore: MenuStore<EmojiItem>;
  languageStore: MenuStore<LanguageItem>;
  bridge: BridgeRef;
  /** The page shows the note's first `# heading` as its title: hidden in the editor (titleHeading.ts). */
  titleHeading: { current: boolean };
}

export function defaultWiring(): EditorWiring {
  return { slashStore: new SlashMenuStore(), linkStore: new MenuStore<LinkItem>(), emojiStore: new MenuStore<EmojiItem>(), languageStore: new MenuStore<LanguageItem>(), bridge: { current: NULL_BRIDGE }, titleHeading: { current: false } };
}

/** Everything the note editor needs: document schema, node views and editing behaviour. */
export function editorExtensions(wiring: EditorWiring = defaultWiring()): AnyExtension[] {
  const views = createNodeViews(wiring.bridge);
  const withViews = documentExtensions.map((extension) => {
    const view = views[extension.name];
    return view ? extension.extend({ addNodeView: () => view }) : extension;
  });
  return [
    ...withViews,
    Editing,
    MarkdownShortcuts,
    BlockKeymap,
    SlashCommand.configure({ store: wiring.slashStore, bridge: wiring.bridge }),
    WikilinkSuggest.configure({ store: wiring.linkStore, bridge: wiring.bridge }),
    EmojiSuggest.configure({ store: wiring.emojiStore }),
    CodeFenceSuggest.configure({ store: wiring.languageStore }),
    Extension.create({ name: "titleHeading", addProseMirrorPlugins: () => [titleHeadingPlugin(wiring.titleHeading)] }),
  ];
}
