import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { RenderedSlides } from "./slides";
import { SlideFrame } from "./SlideFrame";
import { slideAt, slideStart } from "./useSlides";

/** Marp's theme CSS for the slides shown in the page (scoped to div.marpit). */
export function SlidesStyle({ css }: { css: string }) {
  return <style>{css}</style>;
}

/**
 * Thumbnails of the presentation's slides, next to the note: updated as it is
 * written, the slide under the cursor highlighted; a click goes to it.
 */
export function SlidesPanel({ editor, rendered, onPresent, onClose }: { editor: Editor | null; rendered: RenderedSlides | null; onPresent: (index: number) => void; onClose: () => void }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const update = () => !editor.isDestroyed && setCurrent(slideAt(editor.state.doc, editor.state.selection.from));
    update();
    editor.on("selectionUpdate", update);
    editor.on("update", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("update", update);
    };
  }, [editor]);

  const go = (index: number) => {
    if (!editor || editor.isDestroyed) return;
    const pos = Math.min(slideStart(editor.state.doc, index) + 1, editor.state.doc.content.size);
    const tr = editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos)));
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
    const dom = editor.view.domAtPos(pos).node as HTMLElement;
    (dom.nodeType === 1 ? dom : dom.parentElement)?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <aside className="slides-panel" aria-label="Diapos">
      <header>
        <span>Diapos{rendered ? ` · ${rendered.slides.length}` : ""}</span>
        <button onClick={onClose} aria-label="Fermer les diapos" title="Fermer">
          ×
        </button>
      </header>
      {rendered && <SlidesStyle css={rendered.css} />}
      <div className="slides-list">
        {rendered?.slides.map((html, i) => (
          <div key={i} className={i === current ? "slide-thumb current" : "slide-thumb"}>
            <span className="slide-number">{i + 1}</span>
            <button onClick={() => go(i)} onDoubleClick={() => onPresent(i)} title="Aller à la diapo (double-clic : présenter)">
              <SlideFrame html={html} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
