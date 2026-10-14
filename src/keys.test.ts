import { describe, expect, it } from "vitest";
import { keys } from "./keys";

describe("shortcut labels", () => {
  it("stay as written on macOS", () => {
    expect(keys("Fermer (⌘⇧G)", true)).toBe("Fermer (⌘⇧G)");
  });

  it("use Ctrl, Alt and Shift elsewhere", () => {
    expect(keys("Fermer (⌘⇧G)", false)).toBe("Fermer (Ctrl+Shift+G)");
    expect(keys("⌘F / ⌘⌥F", false)).toBe("Ctrl+F / Ctrl+Alt+F");
    expect(keys("⌘-clic", false)).toBe("Ctrl-clic");
    expect(keys("Tab / ⇧Tab", false)).toBe("Tab / Shift+Tab");
    expect(keys("⌘1 … ⌘9", false)).toBe("Ctrl+1 … Ctrl+9");
  });
});
