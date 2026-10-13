import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { EditorState } from "@tiptap/pm/state";
import { editorExtensions } from "./extensions";
import { SlashMenuStore } from "./slash";
import { SlashMenu } from "./SlashMenu";
import { BlockHandle } from "./BlockHandle";
import { loadMarkdown, NoteSession } from "../markdown/note";

interface Props {
  /** File content as loaded from disk; a new value reloads the editor. */
  source: string;
  onMarkdown: (markdown: string) => void;
  /** Called with the target of a clicked [[wikilink]]. */
  onOpenLink?: (target: string) => void;
}

export function NoteEditor({ source, onMarkdown, onOpenLink }: Props) {
  const session = useRef<NoteSession | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const openLink = useRef(onOpenLink);
  openLink.current = onOpenLink;
  const shell = useRef<HTMLDivElement>(null);
  const [slashStore] = useState(() => new SlashMenuStore());

  const editor = useEditor({
    extensions: editorExtensions(slashStore),
    editorProps: {
      attributes: { class: "note", spellcheck: "true" },
      handleClickOn: (_view, _pos, node) => {
        if (node.type.name !== "wikilink" || node.attrs.embed) return false;
        openLink.current?.(node.attrs.target);
        return true;
      },
    },
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

  return (
    <div className="note-editor" ref={shell}>
      <EditorContent editor={editor} />
      <BlockHandle editor={editor} shell={shell} />
      <SlashMenu store={slashStore} />
    </div>
  );
}
