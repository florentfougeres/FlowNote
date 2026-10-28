import { describe, expect, it } from "vitest";
import { accelerator } from "./nativeMenu";

describe("accelerator", () => {
  it("turns a shortcut written the Mac way into a menu accelerator", () => {
    expect(accelerator("⌘W")).toBe("CmdOrCtrl+W");
    expect(accelerator("⌘⇧m")).toBe("CmdOrCtrl+Shift+M");
    expect(accelerator("⌥⌘K")).toBe("Alt+CmdOrCtrl+K");
  });

  it("leaves out what is not a single key with modifiers", () => {
    expect(accelerator("W")).toBeUndefined();
    expect(accelerator("⌘Entrée")).toBeUndefined();
  });
});
