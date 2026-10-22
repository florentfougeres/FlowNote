// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { TextSelection } from "@tiptap/pm/state";
import { destroyEditors, openEditor, type } from "./testUtils";
import { blockChange, blockGroups, gitChange, gitGutterKey, setGitBase, undoGitChange, wordDiff } from "./gitGutter";

afterEach(destroyEditors);

describe("changes since the last commit", () => {
  it("groups added, changed and removed blocks", () => {
    expect(blockGroups(["a", "b", "c", "d"], ["a", "B", "c", "new", "d"])).toEqual([
      { at: 1, base: [1], current: [1] },
      { at: 3, base: [], current: [3] },
    ]);
    expect(blockGroups(["a", "b", "c"], ["a", "c"])).toEqual([{ at: 1, base: [1], current: [] }]);
    expect(blockGroups(["a", "b"], ["a"])).toEqual([{ at: 1, base: [1], current: [] }]);
    expect(blockGroups(["a"], ["a"])).toEqual([]);
    // Paired one to one: as many changed blocks as removed ones, the others are new.
    const [group] = blockGroups(["a", "b"], ["a", "B", "new"]);
    expect([blockChange(group, 1), blockChange(group, 2)]).toEqual(["modified", "added"]);
  });

  it("diffs word by word", () => {
    expect(wordDiff("Un petit chat.", "Un grand chat noir.")).toEqual([
      { text: "Un ", kind: "same" },
      { text: "petit", kind: "removed" },
      { text: "grand", kind: "added" },
      { text: " ", kind: "same" },
      { text: "chat.", kind: "removed" },
      { text: "chat noir.", kind: "added" },
    ]);
  });

  const committed = "# Titre\n\nUn   paragraphe *gardé*.\n\n- liste\n\nFin.\n";
  const classes = (dom: HTMLElement) => [...dom.children].map((el) => el.className.match(/git-\w+/)?.[0] ?? "");

  it("marks the blocks edited in the editor, never in the file", () => {
    const { editor, save } = openEditor(committed);
    editor.view.dispatch(setGitBase(editor.state, { text: committed, date: "2026-10-21T10:00:00Z" }));
    expect(classes(editor.view.dom)).toEqual(["", "", "", ""]);

    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 8 + editor.state.doc.child(1).content.size)));
    type(editor, " Ajouté");
    expect(classes(editor.view.dom)).toEqual(["", "git-modified", "", ""]);
    expect(save()).toBe("# Titre\n\nUn   paragraphe *gardé*. Ajouté\n\n- liste\n\nFin.\n");

    editor.view.dispatch(setGitBase(editor.state, null));
    expect(classes(editor.view.dom)).toEqual(["", "", "", ""]);
    expect(gitGutterKey.getState(editor.state)?.groups).toEqual([]);
  });

  it("puts the committed text back exactly", () => {
    const { editor, save, session } = openEditor(committed);
    editor.view.dispatch(setGitBase(editor.state, { text: committed, date: "2026-10-21T10:00:00Z" }));
    // Edit the paragraph, then remove the list.
    editor.view.dispatch(editor.state.tr.insertText("!", 8 + editor.state.doc.child(1).content.size));
    const list = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize;
    editor.view.dispatch(editor.state.tr.delete(list, list + editor.state.doc.child(2).nodeSize));
    expect(save()).toBe("# Titre\n\nUn   paragraphe *gardé*.!\n\nFin.\n");

    const changed = gitChange(editor.state, 0)!;
    expect(changed.kind).toBe("modified");
    expect(changed.before.map((b) => b.source)).toEqual(["Un   paragraphe *gardé*.", "- liste"]);
    for (const { node, source } of changed.before) session.restore(node, source!);
    editor.view.dispatch(undoGitChange(editor.state, changed));
    expect(save()).toBe(committed);
    expect(classes(editor.view.dom)).toEqual(["", "", "", ""]);
  });

  it("takes back an added block", () => {
    const { editor, save } = openEditor(committed);
    editor.view.dispatch(setGitBase(editor.state, { text: committed, date: "" }));
    editor.view.dispatch(editor.state.tr.insert(editor.state.doc.content.size, editor.state.schema.nodes.paragraph.create(null, editor.state.schema.text("Nouveau"))));
    expect(classes(editor.view.dom)).toEqual(["", "", "", "", "git-added"]);
    const added = gitChange(editor.state, 0)!;
    expect(added.kind).toBe("added");
    editor.view.dispatch(undoGitChange(editor.state, added));
    expect(save()).toBe(committed);
  });
});
