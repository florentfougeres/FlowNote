import type { Editor } from "@tiptap/core";

/** DOM helpers shared by the node views. */

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

/**
 * Calls `listener` when the app's palette changes: the theme chosen in the
 * settings (`data-theme` on the root) or the system's while it is followed.
 * Returns the unsubscribe function.
 */
export function onThemeChange(listener: () => void): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener("change", listener);
  return () => {
    observer.disconnect();
    media?.removeEventListener("change", listener);
  };
}

export function updateAttrs(editor: Editor, getPos: () => number | undefined, attrs: Record<string, unknown>) {
  const pos = getPos();
  if (typeof pos !== "number") return;
  const current = editor.state.doc.nodeAt(pos);
  if (!current) return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attrs }));
}
