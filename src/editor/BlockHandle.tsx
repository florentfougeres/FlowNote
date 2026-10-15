import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { keys } from "../keys";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { Selection, TextSelection } from "@tiptap/pm/state";
import { blockAt, deleteBlock, duplicateBlock, moveBlock, moveBlockByOne, movableBlocks, turnInto, type BlockKind, type BlockRef, type DropSide } from "./blocks";
import { openSlashMenu } from "./slash";
import { DragVisual } from "./dragMotion";

/**
 * Notion-style gutter controls shown next to the hovered block: "+" inserts a
 * block below and opens the slash menu; the grip opens the block menu on click
 * and moves the block on drag.
 *
 * Dragging uses pointer events rather than the HTML drag-and-drop API. Drop
 * targets are found geometrically from block rectangles: above or below a
 * block, or nested under a list item when the pointer is moved to the right.
 */

interface Hover {
  block: BlockRef;
  top: number;
  left: number;
}

interface DropTarget {
  block: BlockRef;
  side: DropSide;
  line: { top: number; left: number; width: number };
}

interface Drag {
  source: BlockRef;
  visual: DragVisual;
  target: DropTarget | null;
}

const TURN_INTO: { kind: BlockKind; label: string }[] = [
  { kind: "paragraph", label: "Texte" },
  { kind: "heading1", label: "Titre 1" },
  { kind: "heading2", label: "Titre 2" },
  { kind: "heading3", label: "Titre 3" },
  { kind: "bullet", label: "Liste à puces" },
  { kind: "ordered", label: "Liste numérotée" },
  { kind: "task", label: "Liste de tâches" },
  { kind: "toggle", label: "Toggle" },
  { kind: "quote", label: "Citation" },
  { kind: "callout", label: "Callout" },
  { kind: "code", label: "Code" },
];

const DRAG_THRESHOLD = 4;
const NEST_OFFSET = 40;

function blockDom(editor: Editor, block: BlockRef): HTMLElement | null {
  const dom = editor.view.nodeDOM(block.pos);
  return dom instanceof HTMLElement ? dom : null;
}

/** The first line of a block (a list item's own text, without its nested children). */
function lineRect(dom: HTMLElement): DOMRect {
  const content = dom.querySelector(":scope > .li-content > :first-child, :scope > .callout-body > :first-child");
  return (content instanceof HTMLElement ? content : dom).getBoundingClientRect();
}

function findDropTarget(editor: Editor, source: BlockRef, x: number, y: number): DropTarget | null {
  const sourceEnd = source.pos + source.node.nodeSize;
  let best: { block: BlockRef; rect: DOMRect; line: DOMRect; distance: number; height: number } | null = null;
  for (const block of movableBlocks(editor.state.doc)) {
    if (block.pos >= source.pos && block.pos < sourceEnd) continue;
    const dom = blockDom(editor, block);
    if (!dom) continue;
    const rect = dom.getBoundingClientRect();
    const distance = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    // Prefer the innermost block containing the pointer, otherwise the closest one.
    if (!best || distance < best.distance || (distance === best.distance && rect.height < best.height)) {
      best = { block, rect, line: lineRect(dom), distance, height: rect.height };
    }
  }
  if (!best) return null;
  const { block, rect, line } = best;
  const isItem = block.node.type.name === "listItem";
  const left = isItem ? line.left : rect.left;
  const width = rect.right - left;
  if (y < line.top + line.height / 2) return { block, side: "above", line: { top: rect.top, left, width } };
  if (isItem && x > line.left + NEST_OFFSET) {
    return { block, side: "nest", line: { top: rect.bottom, left: line.left + 24, width: width - 24 } };
  }
  return { block, side: "below", line: { top: rect.bottom, left, width } };
}

export function BlockHandle({ editor, shell }: { editor: Editor | null; shell: RefObject<HTMLDivElement | null> }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const [menu, setMenu] = useState<{ block: BlockRef; x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);

  // Hover tracking on the editor shell.
  useEffect(() => {
    const el = shell.current;
    if (!editor || editor.isDestroyed || !el) return;
    const onMove = (event: MouseEvent) => {
      if (drag.current || menu || editor.isDestroyed) return;
      const note = editor.view.dom;
      const noteRect = note.getBoundingClientRect();
      const contentLeft = noteRect.left + parseFloat(getComputedStyle(note).paddingLeft);
      const found = editor.view.posAtCoords({ left: Math.max(event.clientX, contentLeft + 8), top: event.clientY });
      if (!found) return setHover(null);
      const block = blockAt(editor.state.doc, found.pos);
      const dom = block && blockDom(editor, block);
      if (!block || !dom) return setHover(null);
      const shellRect = el.getBoundingClientRect();
      const line = lineRect(dom);
      // List markers are drawn outside the item box: keep the handle clear of them.
      const left = (block.node.type.name === "listItem" ? line.left - 26 : dom.getBoundingClientRect().left) - shellRect.left;
      setHover({ block, top: line.top - shellRect.top + Math.min(line.height, 28) / 2 - 12, left });
    };
    const onLeave = () => !drag.current && setHover(null);
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    // Typing hides the controls, as in Notion.
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => transaction.docChanged && setHover(null);
    editor.on("transaction", onTransaction);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      editor.off("transaction", onTransaction);
    };
  }, [editor, shell, menu]);

  const insertBelow = useCallback(
    (block: BlockRef) => {
      if (!editor) return;
      const { listItem, paragraph } = editor.schema.nodes;
      const node = block.node;
      if (node.type === paragraph && node.content.size === 0) {
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, block.pos + 1)));
      } else {
        const at = block.pos + node.nodeSize;
        const isItem = node.type === listItem;
        const inserted = isItem
          ? listItem.create({ checked: node.attrs.checked === null ? null : false, checkChar: node.attrs.checked === null ? null : " " }, paragraph.create())
          : paragraph.create();
        const tr = editor.state.tr.insert(at, inserted);
        tr.setSelection(TextSelection.create(tr.doc, at + (isItem ? 2 : 1)));
        editor.view.dispatch(tr);
      }
      openSlashMenu(editor);
    },
    [editor],
  );

  const endDrag = useCallback(
    (drop: boolean) => {
      const current = drag.current;
      if (!current || !editor) return;
      document.body.classList.remove("is-dragging-block");
      drag.current = null;
      if (drop && current.target) {
        const tr = moveBlock(editor.state, current.source, current.target.block, current.target.side);
        if (tr) {
          editor.view.dispatch(tr);
          editor.view.focus();
          // The ghost flies into the block's new place.
          const moved = blockAt(editor.state.doc, editor.state.selection.from);
          void current.visual.land(moved && blockDom(editor, moved));
          return;
        }
      }
      void current.visual.cancel();
    },
    [editor],
  );

  const onGripPointerDown = (event: React.PointerEvent) => {
    if (!editor || !hover || event.button !== 0) return;
    event.preventDefault();
    const source = hover.block;
    const start = { x: event.clientX, y: event.clientY };
    const scroller = shell.current?.closest(".content") ?? null;
    let started = false;
    let frame = 0;

    const onMove = (e: PointerEvent) => {
      if (!started) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) return;
        const sourceDom = blockDom(editor, source);
        if (!sourceDom) return;
        started = true;
        document.body.classList.add("is-dragging-block");
        drag.current = { source, visual: new DragVisual(sourceDom, start), target: null };
        setHover(null);
      }
      const current = drag.current!;
      current.visual.move({ x: e.clientX, y: e.clientY });
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Scroll when the pointer approaches the top or bottom of the note.
        if (scroller) {
          const box = scroller.getBoundingClientRect();
          if (e.clientY < box.top + 50) scroller.scrollBy(0, -12);
          else if (e.clientY > box.bottom - 50) scroller.scrollBy(0, 12);
        }
        current.target = findDropTarget(editor, source, e.clientX, e.clientY);
        current.visual.showTarget(current.target?.line ?? null);
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(frame);
      if (started) endDrag(true);
      else setMenu({ block: source, x: start.x, y: start.y });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      endDrag(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
  };

  return (
    <>
      {hover && !menu && (
        <div className="block-handle" style={{ top: hover.top, left: hover.left - 50 }} contentEditable={false}>
          <button title="Cliquer pour ajouter un bloc en dessous" onMouseDown={(e) => e.preventDefault()} onClick={() => insertBelow(hover.block)}>
            +
          </button>
          <button className="grip" title="Glisser pour déplacer · Cliquer pour le menu" onPointerDown={onGripPointerDown}>
            ⋮⋮
          </button>
        </div>
      )}
      {menu && editor && <BlockMenu editor={editor} block={menu.block} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </>
  );
}

function BlockMenu({ editor, block, x, y, onClose }: { editor: Editor; block: BlockRef; x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [turnOpen, setTurnOpen] = useState(false);

  useEffect(() => {
    const onDown = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && onClose();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const run = (action: () => void) => {
    action();
    onClose();
    editor.view.focus();
  };
  const selectBlock = () => editor.view.dispatch(editor.state.tr.setSelection(Selection.near(editor.state.doc.resolve(block.pos + 1))));

  return createPortal(
    <div className="block-menu" ref={ref} style={{ left: x + 8, top: y + 8 }}>
      <button onClick={() => run(() => editor.view.dispatch(deleteBlock(editor.state, block)))}>
        Supprimer <kbd>Suppr</kbd>
      </button>
      <button onClick={() => run(() => editor.view.dispatch(duplicateBlock(editor.state, block)))}>
        Dupliquer <kbd>{keys("⌘D")}</kbd>
      </button>
      <button
        onClick={() =>
          run(() => {
            selectBlock();
            const tr = moveBlockByOne(editor.state, -1);
            if (tr) editor.view.dispatch(tr);
          })
        }
      >
        Monter <kbd>{keys("⌥↑")}</kbd>
      </button>
      <button
        onClick={() =>
          run(() => {
            selectBlock();
            const tr = moveBlockByOne(editor.state, 1);
            if (tr) editor.view.dispatch(tr);
          })
        }
      >
        Descendre <kbd>{keys("⌥↓")}</kbd>
      </button>
      <button onClick={() => setTurnOpen(!turnOpen)}>Transformer en {turnOpen ? "▾" : "▸"}</button>
      {turnOpen && (
        <div className="block-menu-sub">
          {TURN_INTO.map(({ kind, label }) => (
            <button
              key={kind}
              onClick={() =>
                run(() => {
                  selectBlock();
                  turnInto(editor, kind);
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
