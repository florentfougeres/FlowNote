import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getMarkRange, type Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Icon } from "../Icon";

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

/** A small field under the selection to type the address of a link (⌘K), or the text of a footnote. */
export function LinkPrompt({
  request,
  onDone,
  placeholder = "Coller ou saisir un lien…",
  label = "Adresse du lien",
}: {
  request: LinkRequest;
  onDone: (href: string | null) => void;
  placeholder?: string;
  label?: string;
}) {
  const [href, setHref] = useState(request.href);
  const left = Math.max(8, Math.min(request.x, window.innerWidth - 340));
  const top = request.y + 300 > window.innerHeight ? request.y - 52 : request.y + 6;
  return createPortal(
    <div className="callout-picker-backdrop" onMouseDown={() => onDone(null)}>
      <div className="block-menu link-prompt" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={href}
          placeholder={placeholder}
          aria-label={label}
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

interface Hovered {
  from: number;
  to: number;
  href: string;
  rect: DOMRect;
}

/**
 * The link under the mouse: its address with Modify, Copy and
 * Remove, under the link. A click on the link opens it (see NoteEditor).
 */
export function LinkHover({ editor, onEdit }: { editor: Editor | null; onEdit: (request: LinkRequest) => void }) {
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const schedule = (next: Hovered | null, delay: number) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setHovered(next);
        setCopied(false);
      }, delay);
    };
    const over = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]");
      if (!link || !dom.contains(link)) return;
      const pos = editor.view.posAtDOM(link, 0);
      const range = getMarkRange(editor.state.doc.resolve(pos), editor.schema.marks.link);
      if (!range) return;
      schedule({ ...range, href: link.getAttribute("href") ?? "", rect: link.getBoundingClientRect() }, 350);
    };
    const out = (event: MouseEvent) => {
      if ((event.target as Element).closest?.("a[href]")) schedule(null, 250);
    };
    dom.addEventListener("mouseover", over);
    dom.addEventListener("mouseout", out);
    return () => {
      window.clearTimeout(timer.current);
      dom.removeEventListener("mouseover", over);
      dom.removeEventListener("mouseout", out);
    };
  }, [editor]);

  // The bar is placed once: it goes away when the page scrolls.
  useEffect(() => {
    if (!hovered) return;
    const hide = () => setHovered(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [hovered]);

  if (!editor || !hovered) return null;
  const close = () => setHovered(null);
  const left = Math.max(8, Math.min(hovered.rect.left, window.innerWidth - 360));
  return createPortal(
    <div
      className="block-menu link-hover"
      style={{ left, top: hovered.rect.bottom + 4 }}
      onMouseEnter={() => window.clearTimeout(timer.current)}
      onMouseLeave={() => (timer.current = window.setTimeout(close, 250))}
    >
      <span className="link-hover-href" title={hovered.href}>
        {hovered.href}
      </span>
      {editor.isEditable && (
        <button
          title="Modifier le lien"
          onClick={() => {
            close();
            onEdit({ from: hovered.from, to: hovered.to, href: hovered.href, x: hovered.rect.left, y: hovered.rect.bottom });
          }}
        >
          <Icon name="pencil" size={14} />
        </button>
      )}
      <button
        title={copied ? "Copié" : "Copier l'adresse"}
        onClick={() => {
          void navigator.clipboard.writeText(hovered.href).then(() => setCopied(true));
        }}
      >
        <Icon name={copied ? "check" : "copy"} size={14} />
      </button>
      {editor.isEditable && (
        <button
          title="Retirer le lien"
          onClick={() => {
            applyLink(editor, hovered.from, hovered.to, "");
            close();
          }}
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>,
    document.body,
  );
}
