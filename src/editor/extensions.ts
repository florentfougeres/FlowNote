import { Extension, type AnyExtension } from "@tiptap/core";
import { dropCursor } from "@tiptap/pm/dropcursor";
import { gapCursor } from "@tiptap/pm/gapcursor";
import { history, redo, undo } from "@tiptap/pm/history";
import { documentExtensions } from "./schema";
import { BlockKeymap } from "./keymap";
import { MarkdownShortcuts } from "./shortcuts";
import { nodeViews, placeholderPlugin } from "./views";

const Editing = Extension.create({
  name: "editing",
  addProseMirrorPlugins: () => [history(), gapCursor(), dropCursor({ color: "#2383e2", width: 2 }), placeholderPlugin()],
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

/** Everything the note editor needs: document schema, node views and editing behaviour. */
export function editorExtensions(): AnyExtension[] {
  const withViews = documentExtensions.map((extension) => {
    const view = nodeViews[extension.name];
    return view ? extension.extend({ addNodeView: () => view }) : extension;
  });
  return [...withViews, Editing, MarkdownShortcuts, BlockKeymap];
}
