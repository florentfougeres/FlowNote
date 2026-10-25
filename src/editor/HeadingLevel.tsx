import { useEffect, useReducer, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { setBlockType } from "@tiptap/pm/commands";
import { Icon } from "../Icon";
import { keys } from "../keys";

/**
 * Like Bear: with the cursor in a heading, its level shows in the left
 * margin; a click opens a menu to choose another level (or plain text).
 * The `#` around the cursor (syntaxMarks.ts) stay: this is a second way.
 */

/** The heading holding the cursor: its position and level, or null. */
export function headingAtCursor(editor: Editor): { pos: number; level: number } | null {
  const { $from } = editor.state.selection;
  if ($from.parent.type.name !== "heading") return null;
  return { pos: $from.before(), level: Number($from.parent.attrs.level) };
}

/** Width the level icon takes left of a heading: the block handle moves left by as much (BlockHandle.tsx). */
export const HEADING_LEVEL_WIDTH = 26;

function LevelIcon({ level }: { level: number }) {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
      <path d="M1 3h9M1 7h9M1 11h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <text x="15.5" y="12.5" textAnchor="middle" fontSize="9" fontWeight="600" fill="currentColor">
        {level}
      </text>
    </svg>
  );
}

export function HeadingLevel({ editor, shell }: { editor: Editor | null; shell: RefObject<HTMLDivElement | null> }) {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [menu, setMenu] = useState<{ x: number; y: number; pos: number; level: number } | null>(null);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const update = () => refresh();
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    editor.on("focus", update);
    editor.on("blur", update);
    window.addEventListener("resize", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
      editor.off("focus", update);
      editor.off("blur", update);
      window.removeEventListener("resize", update);
    };
  }, [editor]);

  const heading = editor && !editor.isDestroyed ? headingAtCursor(editor) : null;
  // The cursor left the heading (keys, typing): its menu closes.
  const stale = menu !== null && heading?.pos !== menu.pos;
  useEffect(() => {
    if (stale) setMenu(null);
  }, [stale]);

  if (!editor || editor.isDestroyed || !editor.isEditable || !shell.current) return null;
  const dom = heading && editor.view.nodeDOM(heading.pos);
  // A hidden title heading (titleHeading.ts) has no box: no icon.
  const visible = heading && dom instanceof HTMLElement && dom.offsetParent !== null && (editor.view.hasFocus() || menu !== null);

  let button = null;
  if (visible && heading && dom instanceof HTMLElement) {
    const shellRect = shell.current.getBoundingClientRect();
    const line = editor.view.coordsAtPos(heading.pos + 1);
    const top = (line.top + line.bottom) / 2 - shellRect.top - 11;
    const left = dom.getBoundingClientRect().left - shellRect.left - HEADING_LEVEL_WIDTH;
    button = (
      <button
        className={menu ? "heading-level open" : "heading-level"}
        style={{ top, left }}
        contentEditable={false}
        title="Niveau du titre"
        aria-label={`Titre de niveau ${heading.level} : changer de niveau`}
        onMouseDown={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu(menu ? null : { x: rect.left, y: rect.bottom + 4, pos: heading.pos, level: heading.level });
        }}
      >
        <LevelIcon level={heading.level} />
      </button>
    );
  }

  return (
    <>
      {button}
      {menu && (
        <LevelMenu
          {...menu}
          onPick={(level) => {
            setMenu(null);
            const { state } = editor;
            const node = state.doc.nodeAt(menu.pos);
            if (!node || node.type.name !== "heading") return;
            const types = state.schema.nodes;
            // The cursor stays where it was: only the block's type changes.
            setBlockType(level === 0 ? types.paragraph : types.heading, level === 0 ? undefined : { level })(state, editor.view.dispatch);
            editor.view.focus();
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

function LevelMenu({ x, y, level, onPick, onClose }: { x: number; y: number; level: number; onPick: (level: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && !(event.target as Element).closest?.(".heading-level") && onClose();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const item = (value: number, label: string) => (
    <button
      key={value}
      role="menuitemradio"
      aria-checked={value === level}
      onMouseDown={(event) => {
        event.preventDefault();
        onPick(value);
      }}
    >
      <span className="heading-level-item">
        <span className="heading-level-check">{value === level && <Icon name="check" size={12} />}</span>
        {label}
      </span>
      <kbd>{keys(`⌘⌥${value}`)}</kbd>
    </button>
  );
  return createPortal(
    <div className="block-menu heading-level-menu" ref={ref} style={{ left: Math.max(8, x), top: Math.min(y, window.innerHeight - 260) }} role="menu">
      {[1, 2, 3, 4, 5, 6].map((value) => item(value, `Titre ${value}`))}
      <div className="menu-separator" />
      {item(0, "Texte")}
    </div>,
    document.body,
  );
}
