import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { CellSelection, isInTable } from "@tiptap/pm/tables";
import { ToolButton, ToolGroup } from "../Toolbar";

interface Position {
  top: number;
  left: number;
}

/** Locates the table and the cell holding the cursor. */
function findTable(editor: Editor): { tablePos: number; cellPos: number } | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const role = $from.node(depth).type.spec.tableRole;
    if (role === "cell" || role === "header_cell") {
      return { tablePos: $from.before(depth - 2), cellPos: $from.before(depth) };
    }
  }
  return null;
}

/** Floating toolbar above the table holding the cursor: rows, columns, alignment. */
export function TableMenu({ editor }: { editor: Editor | null }) {
  const [position, setPosition] = useState<Position | null>(null);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      if (editor.isDestroyed || !editor.isFocused || !isInTable(editor.state)) return setPosition(null);
      const found = findTable(editor);
      const dom = found && editor.view.nodeDOM(found.tablePos);
      if (!(dom instanceof HTMLElement)) return setPosition(null);
      const rect = dom.getBoundingClientRect();
      setPosition({ top: rect.top - 40, left: rect.left });
    };
    update();
    editor.on("transaction", update);
    editor.on("focus", update);
    editor.on("blur", update);
    window.addEventListener("scroll", update, true);
    return () => {
      editor.off("transaction", update);
      editor.off("focus", update);
      editor.off("blur", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [editor]);

  if (!editor || !position) return null;
  const run = (command: () => boolean) => () => {
    command();
    editor.commands.focus();
  };
  const align = (value: "left" | "center" | "right" | null) =>
    run(() => {
      const found = findTable(editor);
      if (!found) return false;
      // Alignment applies to the whole column, as in Markdown.
      const selection = editor.state.selection;
      editor.view.dispatch(editor.state.tr.setSelection(CellSelection.colSelection(editor.state.doc.resolve(found.cellPos))));
      editor.commands.setCellAttribute("align", value);
      editor.view.dispatch(editor.state.tr.setSelection(selection.map(editor.state.doc, editor.state.tr.mapping)));
      return true;
    });

  return createPortal(
    <div className="table-menu" style={{ top: position.top, left: position.left }} onMouseDown={(e) => e.preventDefault()}>
      <ToolGroup>
        <ToolButton icon="rowPlus" label="Ajouter une ligne dessous" onClick={run(() => editor.commands.addRowAfter())} />
        <ToolButton icon="colPlus" label="Ajouter une colonne à droite" onClick={run(() => editor.commands.addColumnAfter())} />
        <ToolButton icon="rowMinus" label="Supprimer la ligne" onClick={run(() => editor.commands.deleteRow())} />
        <ToolButton icon="colMinus" label="Supprimer la colonne" onClick={run(() => editor.commands.deleteColumn())} />
      </ToolGroup>
      <ToolGroup>
        <ToolButton icon="alignLeft" label="Aligner la colonne à gauche" onClick={align("left")} />
        <ToolButton icon="alignCenter" label="Centrer la colonne" onClick={align("center")} />
        <ToolButton icon="alignRight" label="Aligner la colonne à droite" onClick={align("right")} />
      </ToolGroup>
      <ToolGroup>
        <ToolButton icon="trash" label="Supprimer le tableau" onClick={run(() => editor.commands.deleteTable())} />
      </ToolGroup>
    </div>,
    document.body,
  );
}
