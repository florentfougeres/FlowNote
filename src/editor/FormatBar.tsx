import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { Icon } from "../Icon";
import { keys } from "../keys";
import { HIGHLIGHT_COLORS } from "../markdown/highlightColors";
import { clearFormatting, HIGHLIGHT_PENCIL_EVENT, highlightAt, isUnderlined, removeHighlight, setHighlight, toggleUnderline } from "./format";
import { linkTarget } from "./LinkPrompt";

/**
 * Formatting of the selected text: a bar above the
 * selection (bold, italic, underline, strike, highlight and its colour, code,
 * link, footnote, eraser). With the cursor in a highlight, its pencil
 * (format.ts) opens its colours.
 */

interface Props {
  editor: Editor | null;
  /** Opens the address field of a link over a range (⌘K). */
  onLink: (target: { from: number; to: number; href: string }) => void;
  /** Asks for the text of a footnote to call at `at` (after the selection). */
  onFootnote: (at: number) => void;
}

/** Text selected in a text block, outside code: where the bar shows. */
function formattable(editor: Editor): boolean {
  const { selection } = editor.state;
  if (!(selection instanceof TextSelection) || selection.empty || !editor.isEditable) return false;
  const { $from, $to } = selection;
  return $from.parent.isTextblock && !$from.parent.type.spec.code && !$to.parent.type.spec.code && editor.state.doc.textBetween(selection.from, selection.to).trim() !== "";
}

export function FormatBar({ editor, onLink, onFootnote }: Props) {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [selecting, setSelecting] = useState(false);
  const [colors, setColors] = useState<{ x: number; y: number } | null>(null);
  const closeColors = useCallback(() => setColors(null), []);
  // Where the bar sits, kept while the selection stays the same: formatting
  // the text (bold widens it) must not move the bar under the pointer.
  const placed = useRef<{ key: string; style: React.CSSProperties } | null>(null);
  const moves = useRef(0);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const update = () => refresh();
    const onScroll = () => {
      moves.current++;
      refresh();
    };
    // The bar waits for the mouse to be released, so it does not jump while selecting.
    const onDown = (event: MouseEvent) => event.button === 0 && setSelecting(true);
    const onUp = () => setSelecting(false);
    const onPencil = (event: Event) => {
      const rect = (event as CustomEvent<DOMRect>).detail;
      setColors((open) => (open ? null : { x: rect.left, y: rect.bottom + 6 }));
    };
    editor.view.dom.addEventListener(HIGHLIGHT_PENCIL_EVENT, onPencil);
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    editor.on("blur", update);
    editor.view.dom.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
      editor.off("blur", update);
      editor.view.dom.removeEventListener("mousedown", onDown);
      editor.view.dom.removeEventListener(HIGHLIGHT_PENCIL_EVENT, onPencil);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [editor]);

  if (!editor || editor.isDestroyed) return null;
  const { state, view } = editor;
  const focused = view.hasFocus() || colors !== null;
  const showBar = focused && !selecting && formattable(editor);
  const highlight = highlightAt(state);
  if (!showBar && !colors) return null;

  const run = (action: () => void) => (event: React.MouseEvent) => {
    event.preventDefault();
    action();
    editor.view.focus();
  };
  const openColors = (event: React.MouseEvent) => {
    event.preventDefault();
    const anchor = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setColors(colors ? null : { x: anchor.left, y: anchor.bottom + 6 });
  };

  let barStyle: React.CSSProperties | undefined;
  if (showBar) {
    const key = `${state.selection.from}-${state.selection.to}-${moves.current}`;
    if (placed.current?.key !== key) {
      const start = view.coordsAtPos(state.selection.from);
      const end = view.coordsAtPos(state.selection.to);
      const top = Math.min(start.top, end.top);
      // Aligned on the start of the selection: its width never shifts it.
      const left = Math.max(8, Math.min(start.left - 6, window.innerWidth - 340));
      placed.current = { key, style: top > 54 ? { left, top: top - 44 } : { left, top: Math.max(start.bottom, end.bottom) + 8 } };
    }
    barStyle = placed.current.style;
  }
  const isActive = (mark: string) => editor.isActive(mark);
  const button = (label: string, shortcut: string | null, active: boolean, onMouseDown: (event: React.MouseEvent) => void, content: React.ReactNode) => (
    <button className={active ? "active" : undefined} title={shortcut ? `${label} (${keys(shortcut)})` : label} aria-label={label} aria-pressed={active} onMouseDown={onMouseDown}>
      {content}
    </button>
  );
  const openLink = (event: React.MouseEvent) => {
    event.preventDefault();
    const target = linkTarget(state);
    if (target) onLink(target);
  };

  return createPortal(
    <>
      {showBar && (
        <div className="format-bar" style={barStyle} role="toolbar" aria-label="Mise en forme">
          {button("Gras", "⌘B", isActive("bold"), run(() => editor.commands.toggleMark("bold")), <b>B</b>)}
          {button("Italique", "⌘I", isActive("italic"), run(() => editor.commands.toggleMark("italic")), <i>I</i>)}
          {button("Souligné", "⌘U", isUnderlined(state), run(() => toggleUnderline(editor)), <u>U</u>)}
          {button("Barré", "⌘⇧S", isActive("strike"), run(() => editor.commands.toggleMark("strike")), <s>S</s>)}
          <span className="format-bar-split">
            {button("Fluo", "⌘⇧H", isActive("highlight"), run(() => (isActive("highlight") ? removeHighlight(editor) : setHighlight(editor, null))), <Icon name="pencil" size={14} />)}
            {button("Couleur du fluo", null, false, openColors, <Icon name="chevronDown" size={9} />)}
          </span>
          <span className="format-bar-separator" />
          {button("Code", "⌘E", isActive("code"), run(() => editor.commands.toggleMark("code")), <Icon name="code" size={14} />)}
          {button("Lien", "⌘K", isActive("link"), openLink, <Icon name="link" size={14} />)}
          {button("Note de bas de page", null, false, run(() => onFootnote(state.selection.to)), <span className="format-bar-footnote">¹</span>)}
          <span className="format-bar-separator" />
          {button("Effacer la mise en forme", null, false, run(() => clearFormatting(editor)), <Icon name="eraser" size={14} />)}
        </div>
      )}
      {colors && (
        <HighlightColors
          x={colors.x}
          y={colors.y}
          current={highlight ? highlight.color : undefined}
          onPick={(color) => {
            setColors(null);
            setHighlight(editor, color);
            editor.view.focus();
          }}
          onClose={closeColors}
        />
      )}
    </>,
    document.body,
  );
}

/** The highlight colour menu: the default yellow, then the five colours. `current` undefined: no highlight yet. */
function HighlightColors({ x, y, current, onPick, onClose }: { x: number; y: number; current: string | null | undefined; onPick: (color: string | null) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && onClose();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    // Listened to after the click that opened the menu: React runs this effect
    // while that click is still on its way to the window, which closed it at once.
    const timer = window.setTimeout(() => {
      window.addEventListener("mousedown", onDown);
      window.addEventListener("keydown", onKey);
    });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const left = Math.max(8, Math.min(x, window.innerWidth - 180));
  const item = (color: string | null, label: string) => (
    <button
      key={label}
      role="menuitemradio"
      aria-checked={current === color}
      onMouseDown={(event) => {
        event.preventDefault();
        onPick(color);
      }}
    >
      <span className="highlight-check">{current === color && <Icon name="check" size={12} />}</span>
      <span className="highlight-swatch" data-color={color ?? "default"} />
      <span className="highlight-label">{label}</span>
    </button>
  );
  return (
    <div className="block-menu highlight-colors" ref={ref} style={{ left, top: Math.min(y, window.innerHeight - 230) }} role="menu">
      {item(null, "Défaut")}
      <div className="menu-separator" />
      {HIGHLIGHT_COLORS.map((c) => item(c.color, c.label))}
    </div>
  );
}
