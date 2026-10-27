import type { EditorView } from "@tiptap/pm/view";
import { isTauri, readClipboardText } from "../platform";

/**
 * "Coller sans mise en forme" (⌘⇧V and the right-click menu): the clipboard's
 * text as it is, a paragraph per line, without HTML, Markdown, link title or
 * table. ProseMirror's own plain-text paste does it: `handlePaste` lets a
 * paste without clipboard data through.
 */
export function pastePlainText(view: EditorView): void {
  void readClipboardText().then((text) => {
    if (!text || view.isDestroyed || !view.editable) return;
    view.focus();
    view.pasteText(text);
  });
}

/** The editor the open menu acts on (the menus are built once, then reused). */
let target: EditorView | null = null;
const menus: { editable?: Promise<{ popup: () => Promise<void> }>; readOnly?: Promise<{ popup: () => Promise<void> }> } = {};

async function buildMenu(editable: boolean) {
  const { Menu } = await import("@tauri-apps/api/menu");
  const copy = [{ item: "Copy" as const, text: "Copier" }];
  const selectAll = [{ item: "Separator" as const }, { item: "SelectAll" as const, text: "Tout sélectionner" }];
  const items = editable
    ? [
        { item: "Cut" as const, text: "Couper" },
        ...copy,
        { item: "Paste" as const, text: "Coller" },
        { text: "Coller sans mise en forme", accelerator: "CmdOrCtrl+Shift+V", action: () => target && pastePlainText(target) },
        ...selectAll,
      ]
    : [...copy, ...selectAll];
  return Menu.new({ items });
}

/**
 * Right-click in a note, in the app: a native menu with "Coller sans mise en
 * forme", which WebKit's own menu lacks. Couper, Copier and Coller are the
 * system's (the real paste, with its formatting). In a browser, the browser's menu.
 */
export function openNoteContextMenu(view: EditorView, event: MouseEvent): boolean {
  if (!isTauri()) return false;
  event.preventDefault();
  target = view;
  const key = view.editable ? "editable" : "readOnly";
  const menu = (menus[key] ??= buildMenu(view.editable));
  void menu.then((m) => m.popup());
  return true;
}
