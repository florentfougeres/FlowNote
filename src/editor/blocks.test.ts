// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { blockAt, deleteBlock, duplicateBlock, moveBlock, movableBlocks, turnInto, type BlockRef, type DropSide } from "./blocks";
import { filterSlashItems } from "./slash";
import { cursorAtStartOf, destroyEditors, openEditor, press, type } from "./testUtils";

afterEach(destroyEditors);

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The movable block whose text starts with `text`. */
function block(editor: Editor, text: string): BlockRef {
  const found = movableBlocks(editor.state.doc).filter((b) => b.node.textContent.startsWith(text));
  // The innermost match (a nested item rather than its parent).
  const ref = found[found.length - 1];
  if (!ref) throw new Error(`block not found: ${text}`);
  return ref;
}

function move(editor: Editor, source: string, target: string, side: DropSide) {
  const tr = moveBlock(editor.state, block(editor, source), block(editor, target), side);
  if (!tr) throw new Error("move refused");
  editor.view.dispatch(tr);
}

describe("moving blocks", () => {
  it("moved top-level blocks keep their exact source", () => {
    const { editor, save } = openEditor("# Titre\n\nA  avec  espaces  \n\n* B\n*   bizarre\n");
    const [, a, list] = movableBlocks(editor.state.doc).filter((b) => editor.state.doc.resolve(b.pos).depth === 0);
    editor.view.dispatch(moveBlock(editor.state, list, a, "above")!);
    expect(save()).toBe("# Titre\n\n* B\n*   bizarre\n\nA  avec  espaces  \n");
  });

  it("a list item dragged out of its list becomes a one-item list", () => {
    const { editor, save } = openEditor("- un\n- deux\n\nTexte\n");
    move(editor, "deux", "Texte", "below");
    expect(save()).toBe("- un\n\nTexte\n\n- deux\n");
  });

  it("the last item of a list takes its list with it", () => {
    const { editor, save } = openEditor("Texte\n\n- seul\n");
    move(editor, "seul", "Texte", "above");
    expect(save()).toBe("- seul\n\nTexte\n");
  });

  it("reordering items inside a list", () => {
    const { editor, save } = openEditor("- un\n- deux\n- trois\n");
    move(editor, "trois", "un", "above");
    expect(save()).toBe("- trois\n- un\n- deux\n");
  });

  it("nesting an item under another one", () => {
    const { editor, save } = openEditor("- un\n- deux\n");
    move(editor, "deux", "un", "nest");
    expect(save()).toBe("- un\n  - deux\n");
  });

  it("a paragraph dropped between tasks becomes a task", () => {
    const { editor, save } = openEditor("- [ ] a\n- [ ] b\n\nIdée\n");
    move(editor, "Idée", "a", "below");
    expect(save()).toBe("- [ ] a\n- [ ] Idée\n- [ ] b\n");
  });

  it("a block cannot be dropped inside itself", () => {
    const { editor } = openEditor("- parent\n  - enfant\n");
    expect(moveBlock(editor.state, block(editor, "parent"), block(editor, "enfant"), "below")).toBeNull();
  });

  it("dragging a list item next to a list of the same kind joins them", () => {
    const { editor, save } = openEditor("- a\n\nTexte\n\n- b\n");
    move(editor, "b", "Texte", "above");
    expect(save()).toBe("- a\n- b\n\nTexte\n");
  });

  it("moves are a single undo step", () => {
    const { editor, save } = openEditor("A\n\nB\n");
    move(editor, "B", "A", "above");
    press(editor, "z", { ctrlKey: true });
    expect(save()).toBe("A\n\nB\n");
  });

  it("Mod-Shift-Arrow moves the current block", () => {
    const { editor, save } = openEditor("A\n\nB\n\nC\n");
    cursorAtStartOf(editor, "C");
    press(editor, "ArrowUp", { ctrlKey: true, shiftKey: true });
    expect(save()).toBe("A\n\nC\n\nB\n");
    press(editor, "ArrowUp", { ctrlKey: true, shiftKey: true });
    expect(save()).toBe("C\n\nA\n\nB\n");
  });
});

describe("block menu actions", () => {
  it("duplicate and delete", () => {
    const { editor, save } = openEditor("A\n\nB\n");
    editor.view.dispatch(duplicateBlock(editor.state, block(editor, "A")));
    expect(save()).toBe("A\n\nA\n\nB\n");
    editor.view.dispatch(deleteBlock(editor.state, block(editor, "B")));
    expect(save()).toBe("A\n\nA\n");
  });

  it("turn into", () => {
    const { editor, save } = openEditor("Idée\n");
    cursorAtStartOf(editor, "Idée");
    turnInto(editor, "task");
    expect(save()).toBe("- [ ] Idée\n");
    turnInto(editor, "heading2");
    expect(save()).toBe("## Idée\n");
    turnInto(editor, "toggle");
    expect(save()).toBe("> [!note]- Idée\n");
    expect(blockAt(editor.state.doc, editor.state.selection.from)?.node.type.name).toBe("callout");
  });
});

describe("slash menu", () => {
  it("ranks matches: titles first, accents ignored", () => {
    expect(filterSlashItems("tit").map((i) => i.key).slice(0, 3)).toEqual(["heading1", "heading2", "heading3"]);
    expect(filterSlashItems("separ")[0].key).toBe("divider");
    expect(filterSlashItems("todo")[0].key).toBe("task");
    expect(filterSlashItems("zzz")).toEqual([]);
  });

  it("frequently used items come first for equal matches", () => {
    const now = Date.now();
    const ranked = filterSlashItems("titre", undefined, { heading3: { count: 5, last: now } }, now);
    expect(ranked[0].key).toBe("heading3");
  });

  it("typing / opens the menu, the query filters it and Enter applies the item", async () => {
    const { editor, slash, save } = openEditor();
    type(editor, "/tit");
    await tick(); // menu items are computed asynchronously
    expect(slash.state?.items[0].key).toBe("heading1");
    press(editor, "ArrowDown");
    press(editor, "Enter");
    type(editor, "Section");
    expect(save()).toBe("## Section\n");
    expect(slash.state).toBeNull();
  });

  it("does not open after a digit or inside a word", async () => {
    const { editor, slash } = openEditor();
    type(editor, "1/2 et a/b");
    await tick();
    expect(slash.state).toBeNull();
  });

  it("does not open in code blocks", () => {
    const { editor, slash } = openEditor("```\ncode\n```\n");
    cursorAtStartOf(editor, "code");
    type(editor, "/");
    expect(slash.state).toBeNull();
  });

  it("Escape closes the menu and keeps the text", async () => {
    const { editor, slash, save } = openEditor();
    type(editor, "/tit");
    await tick();
    expect(slash.state).not.toBeNull();
    press(editor, "Escape");
    await tick();
    expect(slash.state).toBeNull();
    expect(save()).toBe("/tit\n");
  });

  it("closes after several letters without results", async () => {
    const { editor, slash } = openEditor();
    for (const char of "/xyzabc") {
      type(editor, char);
      await tick();
    }
    expect(slash.state === null || slash.state.items.length === 0).toBe(true);
  });
});
