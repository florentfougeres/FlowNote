import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { renderMath, texOf } from "./math";

/** A formula to edit: where to show the field, its TeX, and what to do with the result (null: cancelled). */
export interface MathRequest {
  /** The editor asking: only its MathPrompt shows (two notes are open side by side in the split view). */
  editor: Editor;
  x: number;
  y: number;
  tex: string;
  onDone: (tex: string | null) => void;
}

class MathPromptStore {
  state: MathRequest | null = null;
  private listeners = new Set<() => void>();
  open(request: MathRequest | null) {
    this.state = request;
    this.listeners.forEach((listener) => listener());
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
}

/** Opened by an inline formula (click) or the slash menu. */
export const mathPrompt = new MathPromptStore();

/**
 * Edits the inline formula at `pos` (an `inlineRaw` node of kind
 * `inlineMath`): its source becomes `$tex$`, or the formula goes when emptied.
 */
export function editInlineMath(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "inlineRaw" || node.attrs.kind !== "inlineMath" || !editor.isEditable) return;
  const at = editor.view.coordsAtPos(pos);
  mathPrompt.open({
    editor,
    x: at.left,
    y: at.bottom,
    tex: texOf(String(node.attrs.source)),
    onDone: (tex) => {
      const current = editor.state.doc.nodeAt(pos);
      if (tex !== null && current?.type === node.type) {
        const tr = editor.state.tr;
        if (tex.trim()) tr.setNodeMarkup(pos, undefined, { ...current.attrs, source: `$${tex.trim()}$` });
        else tr.delete(pos, pos + current.nodeSize);
        editor.view.dispatch(tr);
      }
      editor.commands.focus();
    },
  });
}

/**
 * The TeX of an inline formula under it, with the formula drawn live below
 * the field, like the link field (⌘K). ↵ or a click outside keeps it, Escape
 * leaves it as it was.
 */
export function MathPrompt({ editor }: { editor: Editor | null }) {
  const request = useSyncExternalStore(
    (listener) => mathPrompt.subscribe(listener),
    () => mathPrompt.state,
  );
  const [tex, setTex] = useState("");
  const preview = useRef<HTMLDivElement>(null);

  useEffect(() => setTex(request?.tex ?? ""), [request]);
  useEffect(() => {
    if (preview.current) renderMath(preview.current, tex, false);
  }, [tex, request]);

  if (!request || request.editor !== editor) return null;
  const done = (value: string | null) => {
    mathPrompt.open(null);
    request.onDone(value);
  };
  const left = Math.max(8, Math.min(request.x, window.innerWidth - 340));
  const top = request.y + 140 > window.innerHeight ? request.y - 120 : request.y + 6;
  return createPortal(
    <div className="callout-picker-backdrop" onMouseDown={() => done(tex)}>
      <div className="block-menu link-prompt math-prompt" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={tex}
          placeholder="Formule LaTeX : x^2, \frac{a}{b}…"
          aria-label="Formule LaTeX"
          spellCheck={false}
          onChange={(e) => setTex(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") done(tex);
            else if (e.key === "Escape") done(null);
            else return;
            e.preventDefault();
          }}
        />
        <div className="math-prompt-preview" ref={preview} aria-live="polite" />
      </div>
    </div>,
    document.body,
  );
}
