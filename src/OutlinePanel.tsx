import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

interface Heading {
  pos: number;
  level: number;
  text: string;
}

function headingsOf(editor: Editor): Heading[] {
  const headings: Heading[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") headings.push({ pos, level: node.attrs.level, text: node.textContent });
    return node.isBlock && !node.isTextblock;
  });
  return headings;
}

/** Outline of the open note: headings, the one being read highlighted; a click scrolls to it. */
export function OutlinePanel({ editor, onClose }: { editor: Editor | null; onClose: () => void }) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<number | null>(null);

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
        <nav>
          {headings.map((heading) => (
            <button
              key={heading.pos}
              className={heading.pos === active ? "outline-item active" : "outline-item"}
              style={{ paddingLeft: 8 + (heading.level - minLevel) * 14 }}
              onClick={() => go(heading)}
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
