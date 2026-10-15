// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { destroyEditors, openEditor } from "./testUtils";
import { addToDictionary, applySuggestion, ignoreError, placedErrors, setGrammarChecker, type ParagraphResult } from "./grammar";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  clear: () => store.clear(),
});

afterEach(() => {
  setGrammarChecker(null);
  destroyEditors();
  localStorage.clear();
});

/** A fake Grammalecte: flags "tres" (spelling) and "les enfant" (grammar). */
const fake = vi.fn(async (paragraphs: string[]): Promise<ParagraphResult[]> =>
  paragraphs.map((text) => ({
    spelling: [...text.matchAll(/\btres\b/g)].map((m) => ({ start: m.index, end: m.index + 4, word: "tres", suggestions: ["très"] })),
    grammar: [...text.matchAll(/enfant\b/g)].map((m) => ({ start: m.index, end: m.index + 6, message: "Accord", suggestions: ["enfants"], rule: "gn" })),
  })),
);

const settle = async () => {
  await new Promise((r) => setTimeout(r, 750));
  await new Promise((r) => setTimeout(r, 0));
};

describe("grammar checking", () => {
  it("underlines errors in prose, not in code, links targets, tags or shortcodes", async () => {
    const { editor } = openEditor("Les enfant sont tres sages.\n\n`tres` #tres :tres: [[tres]]\n\n```\ntres\n```\n");
    setGrammarChecker(fake);
    await settle();
    expect(placedErrors(editor.state.doc).map((p) => [p.kind, editor.state.doc.textBetween(p.from, p.to)])).toEqual([
      ["spelling", "tres"],
      ["grammar", "enfant"],
    ]);
    expect(editor.view.dom.querySelectorAll(".gc-error")).toHaveLength(2);
    expect(editor.view.dom.spellcheck).toBe(false);
  });

  it("accepting a suggestion edits only that block; unchanged paragraphs are not re-checked", async () => {
    fake.mockClear();
    const { editor, save } = openEditor("* liste  \n\nC'est tres bien.\n");
    setGrammarChecker(fake);
    await settle();
    const spelling = placedErrors(editor.state.doc)[0];
    applySuggestion(editor.view, spelling, "très");
    expect(save()).toBe("* liste  \n\nC'est très bien.\n");
    await settle();
    expect(fake.mock.calls.flat(2)).toEqual(["liste", "C'est tres bien.", "C'est très bien."]);
  });

  it("ignore and personal dictionary hide errors", async () => {
    const { editor } = openEditor("Les enfant sont tres sages.\n");
    setGrammarChecker(fake);
    await settle();
    const [spelling, grammar] = placedErrors(editor.state.doc);
    ignoreError(grammar);
    addToDictionary(spelling.text.slice(spelling.error.start, spelling.error.end));
    expect(placedErrors(editor.state.doc)).toEqual([]);
    expect(JSON.parse(localStorage.getItem("flownote:dictionary")!)).toEqual(["tres"]);
  });

  it("nothing is shown when checking is off", async () => {
    const { editor } = openEditor("Les enfant sont tres sages.\n");
    expect(placedErrors(editor.state.doc)).toEqual([]);
    expect(editor.view.dom.spellcheck).toBe(true);
  });
});

describe("spell checker choice", () => {
  it("the system checker is used only when Grammalecte is off", async () => {
    const { setSystemSpellcheck } = await import("./grammar");
    const { editor } = openEditor("Texte\n");
    setSystemSpellcheck(false);
    expect(editor.view.dom.spellcheck).toBe(false);
    setSystemSpellcheck(true);
    expect(editor.view.dom.spellcheck).toBe(true);
    setGrammarChecker(fake);
    expect(editor.view.dom.spellcheck).toBe(false);
  });

  it("settings keep the former Grammalecte choice", async () => {
    const { loadSettings } = await import("../SettingsPage");
    expect(loadSettings().spellChecker).toBe("grammalecte");
    localStorage.setItem("flownote:grammar", "false");
    expect(loadSettings().spellChecker).toBe("system");
    localStorage.setItem("flownote:spellchecker", "off");
    expect(loadSettings().spellChecker).toBe("off");
  });
});
