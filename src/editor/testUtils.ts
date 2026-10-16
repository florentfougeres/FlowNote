import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { defaultWiring, editorExtensions } from "./extensions";
import type { VaultBridge } from "./bridge";
import { loadMarkdown, NoteSession } from "../markdown/note";

/** Helpers for tests that drive a real editor (jsdom environment). */

const open_: Editor[] = [];

export function destroyEditors() {
  open_.splice(0).forEach((e) => e.destroy());
}

/** Opens Markdown in a real editor; the cursor is placed at the end of the document. */
export function openEditor(markdown = "", bridge: Partial<VaultBridge> = {}, options: { titleHeading?: boolean } = {}) {
  const { doc, layout } = loadMarkdown(markdown);
  const wiring = defaultWiring();
  wiring.bridge.current = { ...wiring.bridge.current, ...bridge };
  wiring.titleHeading.current = options.titleHeading ?? false;
  const editor = new Editor({ extensions: editorExtensions(wiring), content: doc });
  open_.push(editor);
  const session = new NoteSession(layout, editor.state.doc);
  editor.commands.focus("end");
  return { editor, slash: wiring.slashStore, links: wiring.linkStore, emojis: wiring.emojiStore, bridge: wiring.bridge, save: () => session.serialize(editor.state.doc) };
}

/** Types text character by character, going through input rules like a keyboard would. */
export function type(editor: Editor, text: string) {
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const insert = () => editor.state.tr.insertText(char, from, to);
    const handled = editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, char, insert));
    if (!handled) editor.view.dispatch(insert());
  }
}

export function press(editor: Editor, key: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers });
  const handled = editor.view.someProp("handleKeyDown", (f) => f(editor.view, event));
  if (!handled) throw new Error(`key not handled: ${key}`);
}

export function cursorAtStartOf(editor: Editor, text: string) {
  let pos = -1;
  editor.state.doc.descendants((node, p) => {
    if (pos < 0 && node.isText && node.text!.startsWith(text)) pos = p;
    return pos < 0;
  });
  if (pos < 0) throw new Error(`text not found: ${text}`);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
}
