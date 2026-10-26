import { describe, expect, it } from "vitest";
import { joinTab, nextPageTab, restoredTabs, separateTab, splitOf, swapReading, tabsToSave, withReading, withSplit } from "./tabs";
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

  it("keeps each page's reading mode when joining, swapping and separating", () => {
    const reading = withReading(withSplit(tabs, "c", null), "c", "page", true);
    const joined = joinTab(withReading(withSplit(reading, "a", "Old.md"), "a", "split", true), "a", "c", "n", isPage);
    expect(joined).toEqual([{ id: "a", path: "A.md", split: "C.md", splitReading: true }, tabs[1], { id: "n", path: "Old.md", reading: true }]);
    const swapped = swapReading(joined!, "a");
    expect(swapped[0]).toEqual({ id: "a", path: "A.md", split: "C.md", reading: true });
    expect(separateTab(withReading(joined!, "a", "split", false), "a", "m")?.[1]).toEqual({ id: "m", path: "C.md", reading: false });
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

describe("Tabs remembered between launches", () => {
  const ids = () => {
    let n = 0;
    return () => `t${++n}`;
  };
  const tabs: Tab[] = [
    { id: "a", path: null },
    { id: "b", path: "A.md", split: "B.md", splitReading: true },
    { id: "c", path: "flownote:graph" },
    { id: "d", path: "Gone.md", split: "C.md" },
    { id: "e", path: "Gone.md" },
  ];

  it("comes back with new ids, the same pages and the active one", () => {
    const back = restoredTabs(tabsToSave(tabs, "c"), (p) => p !== "Gone.md", ids());
    expect(back).toEqual({
      tabs: [
        { id: "t1", path: null, reading: false },
        { id: "t2", path: "A.md", reading: false, split: "B.md", splitReading: true },
        { id: "t3", path: "flownote:graph", reading: false },
        { id: "t4", path: "C.md", reading: false },
      ],
      active: "t3",
    });
  });

  it("falls back on the first tab when the active one is gone, and on nothing when all are", () => {
    expect(restoredTabs(tabsToSave(tabs, "e"), (p) => p !== "Gone.md", ids())?.active).toBe("t1");
    expect(restoredTabs(tabsToSave([tabs[4]], "e"), () => false, ids())).toBeNull();
    expect(restoredTabs("pas du JSON", () => true, ids())).toBeNull();
    expect(restoredTabs(null, () => true, ids())).toBeNull();
  });
});
