import { describe, expect, it } from "vitest";
import { globalAction, SHORTCUTS } from "./shortcuts";

const press = (key: string, mods: { shift?: boolean; alt?: boolean; code?: string; ctrl?: boolean; handled?: boolean } = {}) =>
  globalAction({
    key,
    code: mods.code ?? "",
    metaKey: !mods.ctrl,
    ctrlKey: Boolean(mods.ctrl),
    shiftKey: Boolean(mods.shift),
    altKey: Boolean(mods.alt),
    defaultPrevented: Boolean(mods.handled),
  });

describe("global shortcuts", () => {
  it("finds the action of a key, ⌘ or Ctrl", () => {
    expect(press("t")).toBe("newTab");
    expect(press("t", { ctrl: true })).toBe("newTab");
    expect(press("T", { shift: true })).toBeNull();
    expect(press("3")).toBe("goToTab");
    expect(press("g", { shift: true })).toBe("git");
    expect(press("g")).toBeNull();
    expect(globalAction({ key: "t", code: "KeyT", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false })).toBeNull();
  });

  it("tells the variants apart by Shift and Option", () => {
    expect(press("p")).toBe("switcher");
    expect(press("P", { shift: true })).toBe("present");
    expect(press("f", { code: "KeyF" })).toBe("find");
    expect(press("ƒ", { code: "KeyF", alt: true })).toBe("replace");
    expect(press("F", { code: "KeyF", shift: true })).toBe("vaultSearch");
    expect(press("{", { code: "BracketLeft", shift: true })).toBe("previousTab");
    expect(press("[")).toBe("back");
    expect(press("«", { code: "Backslash", alt: true })).toBe("split");
    // ⌘S saves even with Shift (⌘⇧S is strikethrough in the editor, which runs first).
    expect(press("S", { shift: true })).toBe("save");
  });

  it("leaves ⌘K to the editor when it handled it", () => {
    expect(press("k")).toBe("switcher");
    expect(press("k", { handled: true })).toBeNull();
  });

  it("lists each row once in the help", () => {
    const shown = SHORTCUTS.map((s) => s.keys);
    expect(new Set(shown).size).toBe(shown.length);
  });
});
