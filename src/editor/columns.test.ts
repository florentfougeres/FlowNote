// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { Node as PMNode } from "@tiptap/pm/model";
import { addColumn, removeColumn } from "./columns";
import { turnInto } from "./blocks";
import { cursorAtStartOf, destroyEditors, openEditor, type } from "./testUtils";

afterEach(destroyEditors);

const COLS = "Avant\n\n> [!multi-column]\n>\n>> [!blank]\n>> Gauche\n>\n>> [!note] Droite\n>> Texte\n\nAprès\n";

const posOf = (doc: PMNode, test: (node: PMNode) => boolean) => {
  let at = -1;
  doc.descendants((node, pos) => {
    if (at < 0 && test(node)) at = pos;
  });
  return at;
};
const columnsPos = (doc: PMNode) => posOf(doc, (n) => n.attrs.calloutType === "multi-column");

describe("columns", () => {
  it("reads and rewrites a multi-column callout as written, `>>` kept", () => {
    const { editor, save } = openEditor(COLS);
    expect(save()).toBe(COLS);
    cursorAtStartOf(editor, "Gauche");
    type(editor, "Ma ");
    expect(save()).toBe("Avant\n\n> [!multi-column]\n>> [!blank]\n>> Ma Gauche\n>\n>> [!note] Droite\n>> Texte\n\nAprès\n");
  });

  it("keeps `> >` for nested quotes written that way", () => {
    const { editor, save } = openEditor("> Citation\n>\n> > Imbriquée\n");
    cursorAtStartOf(editor, "Citation");
    type(editor, "La ");
    expect(save()).toBe("> La Citation\n>\n> > Imbriquée\n");
  });

  it("keeps the cursor out of the hidden titles, and lets it leave the columns upward", () => {
    const { editor, save } = openEditor("Avant\n\n> [!multi-column]\n>> [!blank]\n>> Gauche\n>\n>> [!blank]\n");
    const columns = columnsPos(editor.state.doc);
    // Arriving from above, in the columns' title: on to the first column's text.
    cursorAtStartOf(editor, "Avant");
    editor.commands.setTextSelection(columns + 2);
    expect(editor.state.selection.$from.parent.textContent).toBe("Gauche");
    // Going up from there: out, into the paragraph above.
    editor.commands.setTextSelection(columns + 5);
    expect(editor.state.selection.$from.parent.textContent).toBe("Avant");
    // The empty column read from the file can be written in.
    const empty = posOf(editor.state.doc, (n) => n.attrs.calloutType === "blank" && n.textContent === "");
    editor.commands.setTextSelection(empty + 2);
    type(editor, "Droite");
    expect(save()).toBe("Avant\n\n> [!multi-column]\n>> [!blank]\n>> Gauche\n>\n>> [!blank]\n>> Droite\n");
  });

  it("turns a line into two columns, adds and removes columns", () => {
    const { editor, save } = openEditor("Avant\n\nIdée\n");
    cursorAtStartOf(editor, "Idée");
    turnInto(editor, "columns");
    type(editor, " neuve");
    expect(save()).toBe("Avant\n\n> [!multi-column]\n>> [!blank]\n>> Idée neuve\n>\n>> [!blank]\n");
    editor.view.dispatch(addColumn(editor.state, columnsPos(editor.state.doc))!);
    type(editor, "Trois");
    expect(save()).toBe("Avant\n\n> [!multi-column]\n>> [!blank]\n>> Idée neuve\n>\n>> [!blank]\n>\n>> [!blank]\n>> Trois\n");
    const column = (text: string) => posOf(editor.state.doc, (n) => n.attrs.calloutType === "blank" && n.textContent === text);
    editor.view.dispatch(removeColumn(editor.state, column("Trois"))!);
    // The cursor goes to the column before.
    expect(editor.state.selection.$from.node(-1).attrs.calloutType).toBe("blank");
    editor.view.dispatch(removeColumn(editor.state, column(""))!);
    // The last column gives its blocks back to the note.
    expect(save()).toBe("Avant\n\nIdée neuve\n");
  });
});
