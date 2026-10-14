import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { MutableRefObject } from "react";
import type { Editor } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { defaultWiring, editorExtensions } from "./extensions";
import { SuggestionMenu } from "./SuggestionMenu";
import { BlockHandle } from "./BlockHandle";
import { TableHandles } from "./TableHandles";
import { CalloutPicker } from "./CalloutPicker";
import { GrammarPopover } from "./GrammarPopover";
import { PropertiesPanel } from "./PropertiesPanel";
import { insertAttachments, type VaultBridge } from "./bridge";
import { loadMarkdown, NoteSession } from "../markdown/note";
import { pastedImageName, resolveLink } from "../vault/links";

interface Props {
  /** File content as loaded from disk; a new value reloads the editor. */
  source: string;
  /** Called with the new file content after every change. */
  onMarkdown: (markdown: string) => void;
  bridge: VaultBridge;
  /** False for notes that must not be edited (e.g. containing conflict markers). */
  editable?: boolean;
  /** Receives the editor instance (outline, find bar), or null when it goes away. */
  onEditor?: (editor: Editor | null) => void;
  /** Front matter keys managed by the app, not shown in the properties panel. */
  hiddenProperties?: string[];
  /** Lets the app read and change the front matter through the editor's session. */
  frontmatterControl?: MutableRefObject<FrontmatterControl | null>;
}

export interface FrontmatterControl {
  get(): string | null;
  set(raw: string | null): void;
}

async function readFiles(list: FileList | null | undefined): Promise<{ name: string; bytes: Uint8Array }[]> {
  const files = [...(list ?? [])];
  return Promise.all(
    files.map(async (file) => {
      // Pasted screenshots have no meaningful name: use Obsidian's naming.
      const name = file.name && file.name !== "image.png" ? file.name : pastedImageName(new Date(), file.type.split("/")[1] || "png");
      return { name, bytes: new Uint8Array(await file.arrayBuffer()) };
    }),
  );
}

export function NoteEditor({ source, onMarkdown, bridge, editable = true, onEditor, hiddenProperties, frontmatterControl }: Props) {
  const session = useRef<NoteSession | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const [wiring] = useState(defaultWiring);
  wiring.bridge.current = bridge;
  const markdownCallback = useRef(onMarkdown);
  markdownCallback.current = onMarkdown;
  const [frontmatter, setFrontmatter] = useState<string | null>(null);

  const editor = useEditor({
    extensions: editorExtensions(wiring),
    editorProps: {
      attributes: { class: "note", spellcheck: "true" },
      handleClickOn: (_view, _pos, node) => {
        if (node.type.name !== "wikilink") return false;
        const current = wiring.bridge.current;
        const path = resolveLink(node.attrs.target, current.files, current.notePath);
        if (!path || (node.attrs.embed && !path.endsWith(".md"))) return false;
        current.openPath(path);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !event.dataTransfer?.files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
        void readFiles(event.dataTransfer.files).then((files) => editorRef.current && insertAttachments(editorRef.current, wiring.bridge.current, files, pos));
        return true;
      },
      handlePaste: (view, event) => {
        if (!event.clipboardData?.files.length) return false;
        const pos = view.state.selection.from;
        void readFiles(event.clipboardData.files).then((files) => editorRef.current && insertAttachments(editorRef.current, wiring.bridge.current, files, pos));
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      if (session.current) markdownCallback.current(session.current.serialize(editor.state.doc));
    },
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  useEffect(() => {
    // In development React mounts effects twice; the first editor may already be destroyed.
    if (!editor || editor.isDestroyed) return;
    const { doc, layout } = loadMarkdown(source);
    // A fresh state: loading must not be an undo step nor trigger onUpdate.
    const node = editor.schema.nodeFromJSON(doc);
    editor.view.updateState(EditorState.create({ doc: node, plugins: editor.state.plugins }));
    session.current = new NoteSession(layout, node);
    setFrontmatter(layout.frontmatter);
  }, [editor, source]);

  const changeFrontmatter = (raw: string | null) => {
    if (!session.current || !editor) return;
    session.current.setFrontmatter(raw);
    setFrontmatter(raw);
    markdownCallback.current(session.current.serialize(editor.state.doc));
  };
  const frontmatterRef = useRef(frontmatter);
  frontmatterRef.current = frontmatter;
  if (frontmatterControl) frontmatterControl.current = { get: () => frontmatterRef.current, set: changeFrontmatter };

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(editable, false);
  }, [editor, editable]);

  const editorCallback = useRef(onEditor);
  editorCallback.current = onEditor;
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editorCallback.current?.(editor);
    return () => editorCallback.current?.(null);
  }, [editor, source]);

  return (
    <div className="note-editor" ref={shell}>
      <PropertiesPanel raw={frontmatter} readOnly={!editable} onChange={changeFrontmatter} hidden={hiddenProperties} />
      <EditorContent editor={editor} />
      <BlockHandle editor={editor} shell={shell} />
      <TableHandles editor={editor} />
      <CalloutPicker />
      <GrammarPopover />
      <SuggestionMenu store={wiring.slashStore} />
      <SuggestionMenu store={wiring.linkStore} />
      <SuggestionMenu store={wiring.emojiStore} />
    </div>
  );
}
