import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { history, redo, undo } from "@tiptap/pm/history";
import { EditorState } from "@tiptap/pm/state";
import { documentExtensions } from "./schema";
import { loadMarkdown, NoteSession } from "../markdown/note";

const Editing = Extension.create({
  name: "editing",
  addProseMirrorPlugins: () => [history()],
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

interface Props {
  /** File content as loaded from disk; a new value reloads the editor. */
  source: string;
  onMarkdown: (markdown: string) => void;
}

export function NoteEditor({ source, onMarkdown }: Props) {
  const session = useRef<NoteSession | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const editor = useEditor({
    extensions: [...documentExtensions, Editing],
    editorProps: { attributes: { class: "note", spellcheck: "true" } },
    onUpdate: ({ editor }) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (session.current) onMarkdown(session.current.serialize(editor.state.doc));
      }, 250);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const { doc, layout } = loadMarkdown(source);
    // A fresh state: loading must not be an undo step nor trigger onUpdate.
    const node = editor.schema.nodeFromJSON(doc);
    editor.view.updateState(EditorState.create({ doc: node, plugins: editor.state.plugins }));
    session.current = new NoteSession(layout, node);
    return () => window.clearTimeout(timer.current);
  }, [editor, source]);

  return <EditorContent editor={editor} className="note-editor" />;
}
