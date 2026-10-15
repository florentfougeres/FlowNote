import { useState } from "react";
import { createPortal } from "react-dom";
import { getMarkRange, type Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

export interface LinkRequest {
  from: number;
  to: number;
  href: string;
  x: number;
  y: number;
}

/**
 * What ⌘K links: the selected text (one line, no code), or the link around
 * the cursor; null otherwise (⌘K then opens the page search).
 */
export function linkTarget(state: EditorState): { from: number; to: number; href: string } | null {
  const { selection, schema, doc } = state;
  const link = schema.marks.link;
  if (selection.empty) {
    const range = getMarkRange(selection.$from, link);
    if (!range) return null;
    const mark = doc.resolve(range.from + 1).marks().find((m) => m.type === link) ?? selection.$from.marks().find((m) => m.type === link);
    return { ...range, href: String(mark?.attrs.href ?? "") };
  }
  const { $from, $to, from, to } = selection;
  if (!$from.sameParent($to) || !$from.parent.isTextblock || $from.parent.type.spec.code || doc.rangeHasMark(from, to, schema.marks.code)) return null;
  let href = "";
  doc.nodesBetween(from, to, (node) => {
    const found = node.marks.find((m) => m.type === link);
    if (found && !href) href = String(found.attrs.href);
  });
  return { from, to, href };
}

/** Sets (or, with an empty address, removes) the link on a range. */
export function applyLink(editor: Editor, from: number, to: number, href: string) {
  const { state } = editor;
  const link = state.schema.marks.link;
  const tr = state.tr.removeMark(from, to, link);
  if (href.trim()) tr.addMark(from, to, link.create({ href: href.trim(), title: null, kind: "inline" }));
  editor.view.dispatch(tr);
}

/** A small field under the selection to type the address of a link (⌘K). */
export function LinkPrompt({ request, onDone }: { request: LinkRequest; onDone: (href: string | null) => void }) {
  const [href, setHref] = useState(request.href);
  const left = Math.max(8, Math.min(request.x, window.innerWidth - 340));
  const top = request.y + 300 > window.innerHeight ? request.y - 52 : request.y + 6;
  return createPortal(
    <div className="callout-picker-backdrop" onMouseDown={() => onDone(null)}>
      <div className="block-menu link-prompt" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={href}
          placeholder="Coller ou saisir un lien…"
          aria-label="Adresse du lien"
          spellCheck={false}
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onDone(href);
            else if (e.key === "Escape") onDone(null);
            else return;
            e.preventDefault();
          }}
        />
        {request.href && (
          <button className="link-prompt-remove" onClick={() => onDone("")}>
            Retirer le lien
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
