import { Extension, type AnyExtension } from "@tiptap/core";
import { dropCursor } from "@tiptap/pm/dropcursor";
import { gapCursor } from "@tiptap/pm/gapcursor";
import { history, redo, undo } from "@tiptap/pm/history";
import { documentExtensions } from "./schema";
import { BlockKeymap } from "./keymap";
import { MarkdownShortcuts } from "./shortcuts";
import { createNodeViews, placeholderPlugin, tagPlugin } from "./views";
import { SlashCommand, SlashMenuStore } from "./slash";
import { WikilinkSuggest, type LinkItem } from "./wikilinks";
import { MenuStore } from "./menu";
import { EmojiSuggest, type EmojiItem } from "./emoji";
import { codeHighlightPlugin } from "./codeHighlight";
import { findPlugin } from "./find";
import { NULL_BRIDGE, type BridgeRef } from "./bridge";

const Editing = Extension.create({
  priority: 150,
  name: "editing",
  addProseMirrorPlugins: () => [history(), gapCursor(), dropCursor({ color: "#2383e2", width: 2 }), placeholderPlugin(), tagPlugin(), codeHighlightPlugin(), findPlugin()],
  addKeyboardShortcuts() {
    return {
      "Mod-z": () => undo(this.editor.state, this.editor.view.dispatch),
      "Mod-Shift-z": () => redo(this.editor.state, this.editor.view.dispatch),
      "Mod-y": () => redo(this.editor.state, this.editor.view.dispatch),
      "Mod-b": () => this.editor.commands.toggleMark("bold"),
      "Mod-i": () => this.editor.commands.toggleMark("italic"),
      "Mod-e": () => this.editor.commands.toggleMark("code"),
      "Mod-Shift-s": () => this.editor.commands.toggleMark("strike"),
      "Mod-Shift-h": () => this.editor.commands.toggleMark("highlight"),
      "Shift-Enter": () => this.editor.commands.insertContent({ type: "softBreak" }),
    };
  },
});

export interface EditorWiring {
  slashStore: SlashMenuStore;
  linkStore: MenuStore<LinkItem>;
  emojiStore: MenuStore<EmojiItem>;
  bridge: BridgeRef;
}

export function defaultWiring(): EditorWiring {
  return { slashStore: new SlashMenuStore(), linkStore: new MenuStore<LinkItem>(), emojiStore: new MenuStore<EmojiItem>(), bridge: { current: NULL_BRIDGE } };
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
  ];
}
