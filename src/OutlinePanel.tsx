import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { moveSection, sectionOf } from "./editor/sections";

interface Heading {
  pos: number;
  level: number;
  text: string;
  /** End of its section, for a top-level heading that can be moved (not the title, not inside a callout). */
  end: number | null;
}

function headingsOf(editor: Editor): Heading[] {
  const headings: Heading[] = [];
  const { doc } = editor.state;
  doc.descendants((node, pos) => {
    if (node.type.name === "heading") headings.push({ pos, level: node.attrs.level, text: node.textContent, end: sectionOf(doc, pos)?.end ?? null });
    return node.isBlock && !node.isTextblock;
  });
  return headings;
}

interface Drag {
  heading: Heading;
  startY: number;
  moved: boolean;
  /** Where the section would go: before a top-level heading, or the end of the note. */
  target: number | null;
}

/**
 * Outline of the open note: headings, the one being read highlighted; a click
 * scrolls to it. Dragging a heading moves its whole section (sub-headings
 * included) before another heading, or to the end of the note.
 */
export function OutlinePanel({ editor, onClose }: { editor: Editor | null; onClose: () => void }) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return setHeadings([]);
    const update = () => !editor.isDestroyed && setHeadings(headingsOf(editor));
    update();
    editor.on("update", update);
    return () => {
      editor.off("update", update);
    };
  }, [editor]);

  // Scroll spy: the last heading above the top of the reading area.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const scroller = editor.view.dom.closest(".content");
    if (!scroller) return;
    const spy = () => {
      const top = scroller.getBoundingClientRect().top + 90;
      let current: number | null = null;
      for (const heading of headings) {
        const dom = editor.view.nodeDOM(heading.pos);
        if (dom instanceof HTMLElement && dom.getBoundingClientRect().top <= top) current = heading.pos;
      }
      setActive(current ?? headings[0]?.pos ?? null);
    };
    spy();
    scroller.addEventListener("scroll", spy, { passive: true });
    return () => scroller.removeEventListener("scroll", spy);
  }, [editor, headings]);

  const go = (heading: Heading) => {
    if (!editor || editor.isDestroyed) return;
    const dom = editor.view.nodeDOM(heading.pos);
    if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "start", behavior: "smooth" });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(heading.pos + 1))));
    editor.view.focus();
  };

  // Pointer events, not HTML5 drag (WebKit refuses it on buttons).
  const startDrag = (event: ReactPointerEvent, heading: Heading) => {
    if (event.button !== 0 || heading.end === null || !editor?.isEditable) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ heading, startY: event.clientY, moved: false, target: null });
  };

  const dropTarget = (y: number, dragged: Heading): number | null => {
    if (!editor || !nav.current) return null;
    const docEnd = editor.state.doc.content.size;
    let target = docEnd;
    for (const item of nav.current.querySelectorAll<HTMLElement>(".outline-item[data-top]")) {
      const rect = item.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        target = Number(item.dataset.pos);
        break;
      }
    }
    return moveSection(editor.state, dragged.pos, target) ? target : null;
  };

  const moveDrag = (event: ReactPointerEvent) => {
    if (!drag) return;
    const moved = drag.moved || Math.abs(event.clientY - drag.startY) > 4;
    if (!moved) return;
    const target = dropTarget(event.clientY, drag.heading);
    if (moved !== drag.moved || target !== drag.target) setDrag({ ...drag, moved, target });
  };

  const endDrag = (heading: Heading) => {
    if (!drag) return;
    setDrag(null);
    if (!drag.moved) return go(heading);
    if (!editor || editor.isDestroyed || drag.target === null) return;
    const tr = moveSection(editor.state, drag.heading.pos, drag.target);
    if (tr) {
      editor.view.dispatch(tr);
      editor.view.focus();
    }
  };

  const dragging = drag?.moved ? drag : null;
  const inDragged = (heading: Heading) =>
    dragging !== null && heading.pos >= dragging.heading.pos && heading.pos < (dragging.heading.end ?? 0);
  const docEnd = editor && !editor.isDestroyed ? editor.state.doc.content.size : -1;

  const minLevel = Math.min(...headings.map((h) => h.level), 6);
  return (
    <aside className="outline-panel" aria-label="Plan de la note">
      <header>
        <span>Plan</span>
        <button onClick={onClose} aria-label="Masquer le plan">
          ×
        </button>
      </header>
      {headings.length === 0 ? (
        <p className="git-none">Aucun titre dans cette note.</p>
      ) : (
        <nav ref={nav} className={dragging ? (dragging.target === docEnd ? "dragging drop-end" : "dragging") : undefined}>
          {headings.map((heading) => (
            <button
              key={heading.pos}
              className={[
                "outline-item",
                heading.pos === active && "active",
                inDragged(heading) && "dragged",
                dragging?.target === heading.pos && "drop-before",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ paddingLeft: 8 + (heading.level - minLevel) * 14 }}
              data-pos={heading.pos}
              data-top={heading.end !== null || undefined}
              onPointerDown={(event) => startDrag(event, heading)}
              onPointerMove={moveDrag}
              onPointerUp={() => endDrag(heading)}
              onPointerCancel={() => setDrag(null)}
              onClick={(event) => {
                // Pointer presses are handled on release; this is the keyboard's click.
                if (event.detail === 0 || !editor?.isEditable || heading.end === null) go(heading);
              }}
              title={heading.text}
            >
              {heading.text || "Titre vide"}
            </button>
          ))}
        </nav>
      )}
    </aside>
  );
}
