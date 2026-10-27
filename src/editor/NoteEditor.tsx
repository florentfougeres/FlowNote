import { insertMarkdownBlocks, pasteInline, pasteMarkdown } from "./pasteMarkdown";
import { pastedTable } from "../markdown/csv";
import { vaultPropertyKeys } from "../markdown/frontmatter";
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { MutableRefObject, ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { defaultWiring, editorExtensions } from "./extensions";
import { SuggestionMenu } from "./SuggestionMenu";
import { BlockHandle } from "./BlockHandle";
import { HeadingLevel } from "./HeadingLevel";
import { TableHandles } from "./TableHandles";
import { CalloutPicker } from "./CalloutPicker";
import { TableSizePicker } from "./TableSizePicker";
import { applyLink, LinkHover, LinkPrompt, linkTarget, type LinkRequest } from "./LinkPrompt";
import { GrammarPopover } from "./GrammarPopover";
import { FormatBar } from "./FormatBar";
import { MathPrompt } from "./MathPrompt";
import { insertFootnote } from "./slash";
import { PropertiesPanel } from "./PropertiesPanel";
import { insertAttachments, type VaultBridge } from "./bridge";
import { loadMarkdown, NoteSession, serializeTopLevelBlock } from "../markdown/note";
import { pastedImageName, resolveLink } from "../vault/links";
import { fetchTitle, openUrl } from "../reading/web";
import { pastedUrl, pasteUrlWithTitle } from "./linkTitle";
import { extractToNote, selectionRange } from "./extract";
import { reportError } from "../errors";
import { markdownForClipboard } from "./clipboard";
import { openNoteContextMenu, pastePlainText } from "./contextMenu";
import { inlineVaultImages } from "./imageCopies";
import { schema } from "./schema";
import { DOMSerializer } from "@tiptap/pm/model";
import { afterTitleHeading } from "./titleHeading";
import { gitChange, setGitBase, undoGitChange, type GitBase, type GitChange } from "./gitGutter";
import { GitChangePopover } from "./GitChangePopover";

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
  /** Shown above the properties, with the front matter and a way to change it (a base's row properties). */
  header?: (frontmatter: string | null, setFrontmatter: (raw: string | null) => void) => ReactNode;
  /** Lets the app read and change the front matter through the editor's session. */
  frontmatterControl?: MutableRefObject<FrontmatterControl | null>;
  /** False for text without front matter (task comments): no properties panel. */
  properties?: boolean;
  /** The page shows the note's first `# heading` as its title: the editor hides it. */
  titleHeading?: boolean;
  /** The note as in the last commit: blocks changed since are marked in the margin (null: no marks). */
  gitBase?: GitBase | null;
}

export interface FrontmatterControl {
  get(): string | null;
  set(raw: string | null): void;
}

/** Copied HTML: what the editor shows, with the vault's images themselves rather than their names. */
const CLIPBOARD_SERIALIZER = (() => {
  const base = DOMSerializer.fromSchema(schema);
  const serializer = new DOMSerializer(base.nodes, base.marks);
  const serializeFragment = serializer.serializeFragment.bind(serializer);
  serializer.serializeFragment = (fragment, options, target) => {
    const dom = serializeFragment(fragment, options, target);
    inlineVaultImages(dom);
    return dom;
  };
  return serializer;
})();

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

export function NoteEditor({ source, onMarkdown, bridge, editable = true, onEditor, hiddenProperties, header, frontmatterControl, properties = true, titleHeading = false, gitBase = null }: Props) {
  const session = useRef<NoteSession | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const [wiring] = useState(defaultWiring);
  wiring.bridge.current = bridge;
  wiring.titleHeading.current = titleHeading;
  const markdownCallback = useRef(onMarkdown);
  markdownCallback.current = onMarkdown;
  const [frontmatter, setFrontmatter] = useState<string | null>(null);
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null);
  /** Where a footnote asked from the format bar goes, while its text is typed. */
  const [footnoteRequest, setFootnoteRequest] = useState<LinkRequest | null>(null);
  const [gitPopover, setGitPopover] = useState<{ change: GitChange; x: number; y: number } | null>(null);

  const editor = useEditor({
    extensions: editorExtensions(wiring),
    editorProps: {
      attributes: { class: "note", spellcheck: "true" },
      handleClickOn: (_view, _pos, node, _nodePos, event) => {
        if (node.type.name !== "wikilink") return false;
        const current = wiring.bridge.current;
        const path = resolveLink(node.attrs.target, current.files, current.notePath);
        if (!path || (node.attrs.embed && !path.endsWith(".md"))) return false;
        current.openPath(path, event.metaKey || event.ctrlKey);
        return true;
      },
      // A click on a link opens it: a web address in the browser, a vault path in the app.
      handleClick: (view, _pos, event) => {
        const link = (event.target as Element).closest?.("a[href]");
        if (!link || !view.dom.contains(link) || event.shiftKey || event.button !== 0) return false;
        const href = link.getAttribute("href") ?? "";
        if (/^(https?|mailto):/i.test(href)) {
          openUrl(href);
          return true;
        }
        const current = wiring.bridge.current;
        let target = href;
        try {
          target = decodeURI(href);
        } catch {
          // A malformed address: kept as written.
        }
        const path = resolveLink(target, current.files, current.notePath);
        if (!path) return false;
        current.openPath(path, event.metaKey || event.ctrlKey);
        return true;
      },
      clipboardTextSerializer: (slice) => markdownForClipboard(slice),
      clipboardSerializer: CLIPBOARD_SERIALIZER,
      handleKeyDown: (view, event) => {
        // ⌘⇧V: the clipboard's text without formatting.
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "v" && view.editable) {
          pastePlainText(view);
          return true;
        }
        // ⌘K on selected text (or in a link): its address.
        if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "k" || !view.editable) return false;
        const target = linkTarget(view.state);
        if (!target) return false;
        const start = view.coordsAtPos(target.from);
        setLinkRequest({ ...target, x: start.left, y: view.coordsAtPos(target.to).bottom });
        return true;
      },
      handleDOMEvents: {
        contextmenu: (view, event) => openNoteContextMenu(view, event),
        // A middle click on a link (or a [[link]]) opens its page in a new tab; a web address in the browser.
        auxclick: (view, event) => {
          if (event.button !== 1) return false;
          const target = event.target as Element;
          const current = wiring.bridge.current;
          const link = target.closest?.("a[href]");
          let path: string | null = null;
          if (link && view.dom.contains(link)) {
            const href = link.getAttribute("href") ?? "";
            if (/^(https?|mailto):/i.test(href)) {
              openUrl(href);
              event.preventDefault();
              return true;
            }
            let decoded = href;
            try {
              decoded = decodeURI(href);
            } catch {
              // A malformed address: kept as written.
            }
            path = resolveLink(decoded, current.files, current.notePath);
          } else {
            const wikilink = target.closest?.(".wikilink");
            if (!wikilink || !view.dom.contains(wikilink)) return false;
            const pos = view.posAtDOM(wikilink, 0);
            const node = [pos, pos - 1].map((p) => view.state.doc.nodeAt(Math.max(0, p))).find((n) => n?.type.name === "wikilink");
            if (node) path = resolveLink(node.attrs.target, current.files, current.notePath);
          }
          if (!path) return false;
          event.preventDefault();
          current.openPath(path, true);
          return true;
        },
        // A click in the empty space under the last block: the cursor goes to an
        // empty line at the end (added when needed).
        mousedown: (view, event) => {
          // A click on a mark of the changes since the last commit (the bar left of a block, or a removal mark).
          const mark = event.button === 0 ? (event.target as Element).closest?.("[data-git-group]") : null;
          if (mark && mark.parentElement === view.dom && (mark.classList.contains("git-removed") || event.clientX < mark.getBoundingClientRect().left)) {
            const change = gitChange(view.state, Number((mark as HTMLElement).dataset.gitGroup));
            if (change) {
              event.preventDefault();
              const rect = mark.getBoundingClientRect();
              setGitPopover({ change, x: rect.left - 14, y: rect.bottom + 6 });
              return true;
            }
          }
          // A middle click on a link opens it (auxclick), without moving the cursor or scrolling.
          if (event.button === 1 && (event.target as Element).closest?.("a[href], .wikilink")) {
            event.preventDefault();
            return true;
          }
          if (event.button !== 0 || event.target !== view.dom || !view.editable) return false;
          const last = view.dom.lastElementChild;
          if (!last || event.clientY <= last.getBoundingClientRect().bottom) return false;
          event.preventDefault();
          const { doc, schema } = view.state;
          const end = doc.lastChild;
          const tr = view.state.tr;
          if (!(end?.type === schema.nodes.paragraph && end.content.size === 0)) tr.insert(doc.content.size, schema.nodes.paragraph.create());
          tr.setSelection(TextSelection.create(tr.doc, tr.doc.content.size - 1)).scrollIntoView();
          view.dispatch(tr);
          view.focus();
          return true;
        },
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !event.dataTransfer?.files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
        void readFiles(event.dataTransfer.files).then((files) => editorRef.current && insertAttachments(editorRef.current, wiring.bridge.current, files, pos));
        return true;
      },
      handlePaste: (view, event, slice) => {
        // Without clipboard data, a paste of plain text (pastePlainText): ProseMirror's own, a paragraph per line.
        if (!event.clipboardData) return false;
        if (event.clipboardData?.files.length) {
          const pos = view.state.selection.from;
          void readFiles(event.clipboardData.files).then((files) => editorRef.current && insertAttachments(editorRef.current, wiring.bridge.current, files, pos));
          return true;
        }
        // A web address pasted over selected text links that text.
        const url = event.clipboardData?.getData("text/plain").trim() ?? "";
        const { selection, schema, doc } = view.state;
        const linkable = !selection.empty && selection.$from.sameParent(selection.$to) && selection.$from.parent.isTextblock && !selection.$from.parent.type.spec.code;
        if (/^https?:\/\/\S+$/i.test(url) && linkable && !doc.rangeHasMark(selection.from, selection.to, schema.marks.code)) {
          view.dispatch(view.state.tr.removeMark(selection.from, selection.to, schema.marks.link).addMark(selection.from, selection.to, schema.marks.link.create({ href: url, title: null, kind: "inline" })));
          return true;
        }
        // A web address pasted alone takes the page's title (⌘⇧V: kept bare).
        const pasted = pastedUrl(url);
        if (pasted && selection.empty && pasteUrlWithTitle(view, pasted, fetchTitle)) return true;
        // Cells copied from a spreadsheet, or a CSV, give a table (⌘⇧V: kept as text). Not inside a table or code.
        const text = event.clipboardData?.getData("text/plain") ?? "";
        const fromNote = event.clipboardData?.getData("text/html").includes("data-pm-slice") ?? false;
        const inCell = [...Array(selection.$from.depth).keys()].some((d) => selection.$from.node(d + 1).type.spec.tableRole);
        const table = fromNote || inCell || selection.$from.parent.type.spec.code ? null : pastedTable(text);
        if (table && insertMarkdownBlocks(view, table)) return true;
        // Plain text (no HTML: a text file, a terminal, Obsidian's source) is read as Markdown.
        // HTML from elsewhere (a web page, Word): one block pasted gives its text only, the line keeps its kind.
        // Copied from a note (ProseMirror marks its HTML with data-pm-slice), blocks stay as they were.
        if (event.clipboardData?.types.includes("text/html")) {
          return !event.clipboardData.getData("text/html").includes("data-pm-slice") && pasteInline(view, slice.content);
        }
        return pasteMarkdown(view, text);
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
    // The cursor starts after a hidden title heading, never in it.
    const selection = wiring.titleHeading.current ? afterTitleHeading(node) : undefined;
    editor.view.updateState(EditorState.create({ doc: node, plugins: editor.state.plugins, selection }));
    session.current = new NoteSession(layout, node);
    setFrontmatter(layout.frontmatter);
  }, [editor, source, wiring.titleHeading]);

  // After a load (a fresh state forgets it), and whenever the committed version changes.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(setGitBase(editor.state, gitBase));
  }, [editor, source, gitBase]);

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

  /** The vault's properties, offered when adding one to this note. */
  const [suggestKeys] = useState(() => async () => vaultPropertyKeys((await wiring.bridge.current.queryVault?.())?.notes ?? []));

  return (
    <div className="note-editor" ref={shell}>
      {header?.(frontmatter, changeFrontmatter)}
      {properties && <PropertiesPanel raw={frontmatter} readOnly={!editable} onChange={changeFrontmatter} hidden={hiddenProperties} suggestKeys={suggestKeys} />}
      <EditorContent editor={editor} />
      <BlockHandle editor={editor} shell={shell} bridge={wiring.bridge} />
      <HeadingLevel editor={editor} shell={shell} />
      <TableHandles editor={editor} />
      <CalloutPicker />
      <MathPrompt editor={editor} />
      <TableSizePicker />
      <LinkHover editor={editor} onEdit={setLinkRequest} />
      <FormatBar
        editor={editor}
        onLink={(target) => {
          if (!editor) return;
          const start = editor.view.coordsAtPos(target.from);
          setLinkRequest({ ...target, x: start.left, y: editor.view.coordsAtPos(target.to).bottom });
        }}
        onFootnote={(at) => {
          if (!editor) return;
          const end = editor.view.coordsAtPos(at);
          setFootnoteRequest({ from: at, to: at, href: "", x: end.left, y: end.bottom });
        }}
        onExtract={() => {
          if (!editor) return;
          const { from, to } = editor.state.selection;
          const range = selectionRange(editor.state.doc, from, to);
          if (range) void extractToNote(editor, wiring.bridge.current, range).catch(reportError);
        }}
      />
      {footnoteRequest && editor && (
        <LinkPrompt
          request={footnoteRequest}
          placeholder="Texte de la note de bas de page…"
          label="Texte de la note de bas de page"
          onDone={(text) => {
            setFootnoteRequest(null);
            if (text?.trim()) insertFootnote(editor, { from: footnoteRequest.to, to: footnoteRequest.to }, text);
            editor.commands.focus();
          }}
        />
      )}
      {linkRequest && editor && (
        <LinkPrompt
          request={linkRequest}
          onDone={(href) => {
            setLinkRequest(null);
            if (href !== null) applyLink(editor, linkRequest.from, linkRequest.to, href);
            editor.commands.focus();
          }}
        />
      )}
      <GrammarPopover />
      {gitPopover && editor && (
        <GitChangePopover
          {...gitPopover}
          dom={editor.view.dom}
          markdownOf={(node) => serializeTopLevelBlock(node.toJSON(), session.current?.layout.context)}
          onRestore={() => {
            // The committed blocks are written back with their exact text.
            for (const { node, source } of gitPopover.change.before) if (source !== null) session.current?.restore(node, source);
            editor.view.dispatch(undoGitChange(editor.state, gitPopover.change));
            editor.commands.focus();
          }}
          onClose={() => setGitPopover(null)}
        />
      )}
      <SuggestionMenu store={wiring.slashStore} blocks />
      <SuggestionMenu store={wiring.linkStore} />
      <SuggestionMenu store={wiring.emojiStore} />
      <SuggestionMenu store={wiring.languageStore} />
    </div>
  );
}
