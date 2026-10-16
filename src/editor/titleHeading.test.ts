// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { TextSelection } from "@tiptap/pm/state";
import { destroyEditors, openEditor, press, type } from "./testUtils";
import { setTitleHeading, titleHeadingOf } from "./titleHeading";

afterEach(destroyEditors);

const withTitle = (markdown: string) => openEditor(markdown, {}, { titleHeading: true });

describe("Title from the first # heading", () => {
  it("reads the title from a level-1 heading opening the note only", () => {
    expect(titleHeadingOf(openEditor("# Mon titre\n\nTexte\n").editor.state.doc)).toBe("Mon titre");
    expect(titleHeadingOf(openEditor("# Avec [[Cible|un lien]]\n").editor.state.doc)).toBe("Avec un lien");
    expect(titleHeadingOf(openEditor("## Sous-titre\n").editor.state.doc)).toBeNull();
    expect(titleHeadingOf(openEditor("Texte\n\n# Plus loin\n").editor.state.doc)).toBeNull();
    expect(titleHeadingOf(openEditor("Texte\n").editor.state.doc)).toBeNull();
  });

  it("rewrites the heading line only", () => {
    const { editor, save } = withTitle("---\ntags: [a]\n---\n# Ancien   titre\n\nTexte  *gardé*\n");
    editor.view.dispatch(setTitleHeading(editor.state, "  Nouveau titre ")!);
    expect(save()).toBe("---\ntags: [a]\n---\n# Nouveau titre\n\nTexte  *gardé*\n");
    expect(setTitleHeading(editor.state, "Nouveau titre")).toBeNull();
    expect(setTitleHeading(editor.state, "  ")).toBeNull();
  });

  it("adds the heading at the top of a note without one, the rest unchanged", () => {
    const { editor, save } = withTitle("---\ntags: [a]\n---\nTexte  *gardé*\n");
    editor.view.dispatch(setTitleHeading(editor.state, "Mon titre")!);
    expect(save()).toBe("---\ntags: [a]\n---\n# Mon titre\n\nTexte  *gardé*\n");
    expect(titleHeadingOf(editor.state.doc)).toBe("Mon titre");
    const empty = withTitle("");
    empty.editor.view.dispatch(setTitleHeading(empty.editor.state, "Seul")!);
    expect(empty.save()).toBe("# Seul\n");
  });

  it("keeps the cursor out of the hidden heading", () => {
    const { editor } = withTitle("# Titre\n\nTexte\n");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)));
    expect(editor.state.selection.$from.parent.textContent).toBe("Texte");
    expect(editor.state.selection.$from.parentOffset).toBe(0);
  });

  it("does not merge the first line into the title with Backspace", () => {
    const { editor, save } = withTitle("# Titre\n\nTexte\n");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, editor.state.doc.firstChild!.nodeSize + 1)));
    press(editor, "Backspace");
    expect(save()).toBe("# Titre\n\nTexte\n");
  });

  it("gives a note holding only its title a line to write in, without changing the file", () => {
    const { editor, save } = withTitle("# Titre\n");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3)));
    expect(editor.state.doc.childCount).toBe(2);
    expect(save()).toBe("# Titre\n");
    type(editor, "Suite");
    expect(save()).toBe("# Titre\n\nSuite\n");
  });

  it("leaves the heading alone where the page shows no title", () => {
    const { editor } = openEditor("# Titre\n\nTexte\n");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)));
    expect(editor.state.selection.$from.parent.type.name).toBe("heading");
  });
});
