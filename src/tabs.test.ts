import { describe, expect, it } from "vitest";
import { joinTab, nextPageTab, separateTab, splitOf, withSplit } from "./tabs";
import type { Tab } from "./TabBar";

const isPage = (path: string) => !path.startsWith("flownote:");
const tabs: Tab[] = [
  { id: "a", path: "A.md" },
  { id: "b", path: "flownote:tickets" },
  { id: "c", path: "C.md" },
];

describe("Split view in the tab list", () => {
  it("joins the page of another tab on the right of the active one", () => {
    expect(joinTab(tabs, "a", "c", "n", isPage)).toEqual([{ id: "a", path: "A.md", split: "C.md" }, tabs[1]]);
  });

  it("puts back the page already on the right in place of the joined tab", () => {
    const split = withSplit(tabs, "a", "Old.md");
    expect(joinTab(split, "a", "c", "n", isPage)).toEqual([{ id: "a", path: "A.md", split: "C.md" }, tabs[1], { id: "n", path: "Old.md" }]);
  });

  it("does not join a view nor the active tab itself", () => {
    expect(joinTab(tabs, "a", "b", "n", isPage)).toBeNull();
    expect(joinTab(tabs, "a", "a", "n", isPage)).toBeNull();
  });

  it("separates the pair into two tabs, the right page after", () => {
    const split = withSplit(tabs, "a", "C.md");
    expect(separateTab(split, "a", "n")).toEqual([{ id: "a", path: "A.md", split: null }, { id: "n", path: "C.md" }, tabs[1], tabs[2]]);
    expect(separateTab(tabs, "a", "n")).toBeNull();
  });

  it("finds the next tab holding a page, going round", () => {
    expect(nextPageTab(tabs, "a", isPage)?.id).toBe("c");
    expect(nextPageTab(tabs, "c", isPage)?.id).toBe("a");
    expect(splitOf(withSplit(tabs, "c", "X.md"), "c")).toBe("X.md");
  });
});
