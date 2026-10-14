import { describe, expect, it } from "vitest";
import { isEmoji, noteIcon } from "./icon";

describe("page icons", () => {
  it("come from the icon property when it is an emoji", () => {
    expect(noteIcon("---\ntitle: x\nicon: 🚀\n---\nTexte")).toBe("🚀");
    expect(noteIcon('---\r\nicon: "📚"\r\n---\r\n')).toBe("📚");
    expect(noteIcon("---\nicon: 👩🏽‍💻\n---\n")).toBe("👩🏽‍💻");
    expect(noteIcon("---\nicon: 🇫🇷\n---\n")).toBe("🇫🇷");
  });

  it("ignore plugin icon names, text and notes without front matter", () => {
    expect(noteIcon("---\nicon: LiHome\n---\n")).toBeNull();
    expect(noteIcon("---\nicon: Projet 🚀\n---\n")).toBeNull();
    expect(noteIcon("icon: 🚀\n")).toBeNull();
    expect(isEmoji("é")).toBe(false);
  });
});
