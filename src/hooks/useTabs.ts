import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Tab } from "../TabBar";
import { newTabId, readSavedTabs, restoredTabs, saveTabs, splitOf as splitIn, tabsToSave, withSplit } from "../tabs";

interface TabsContext {
  vault: { name: string } | null;
  /** Shows a page (or a view, or the dashboard: null) in the editor area; false when it could not be read. */
  show: (path: string | null) => Promise<boolean>;
  /** Writes the open note; rejects on a conflict, which keeps it open. */
  saveNow: () => Promise<void>;
  /** Writes the right side's pending changes. */
  splitSaver: RefObject<(() => Promise<void>) | null>;
  /** The path of the note open in the editor. */
  openPath: () => string | null;
  /** Pseudo-paths shown in a tab instead of a page (graph, settings…). */
  isView: (path: string | null) => boolean;
}

/**
 * The tabs: one page (or the dashboard) each, only the active one with an
 * editor; the back/forward history and scroll position of each tab, opening
 * pages in them, and the list remembered per vault. The functions returned
 * keep their identity; they call the latest `context`.
 */
export function useTabs(context: TabsContext) {
  const latest = useRef(context);
  latest.current = context;
  const { vault } = context;
  const [tabs, setTabs] = useState<Tab[]>(() => [{ id: newTabId(), path: null }]);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const [activeTab, setActiveTab] = useState(() => tabs[0].id);
  const activeRef = useRef(activeTab);
  // Visited pages of the active tab, for back/forward navigation.
  const back = useRef<string[]>([]);
  const forward = useRef<string[]>([]);
  /** Back/forward history and scroll position of the inactive tabs. */
  const tabState = useRef(new Map<string, { back: string[]; forward: string[]; scroll: number }>());
  /** The scrolled page area, whose position each tab keeps. */
  const contentRef = useRef<HTMLElement>(null);

  /** Page on the right of the split view: part of the tab (one tab for the pair). */
  const splitOf = (id: string) => splitIn(tabsRef.current, id);
  /** Replaces the tab list now (the ref too, for the callbacks that follow). */
  const replaceTabs = (next: Tab[]) => {
    tabsRef.current = next;
    setTabs(next);
  };
  /** Sets (or, with null, closes) the page on the right of a tab. */
  const setTabSplit = (id: string, split: string | null) => replaceTabs(withSplit(tabsRef.current, id, split));

  // The tabs are remembered for the next launch, per vault.
  useEffect(() => {
    if (vault) saveTabs(vault.name, tabsToSave(tabs, activeTab));
  }, [vault, tabs, activeTab]);

  /** The tabs a vault had when it was left (or the dashboard alone); returns the active one. */
  const restore = (vaultName: string, exists: (path: string) => boolean): Tab => {
    const restored = restoredTabs(readSavedTabs(vaultName), exists, newTabId) ?? { tabs: [{ id: newTabId(), path: null }], active: "" };
    const active = restored.tabs.find((t) => t.id === restored.active) ?? restored.tabs[0];
    tabState.current.clear();
    back.current = [];
    forward.current = [];
    activeRef.current = active.id;
    tabsRef.current = restored.tabs;
    setTabs(restored.tabs);
    setActiveTab(active.id);
    return active;
  };

  /** Shows a page (or the dashboard) in the active tab, without touching its history. */
  const load = useCallback(
    async (path: string | null): Promise<boolean> => {
      if (!(await latest.current.show(path))) return false;
      setTabs((list) => list.map((t) => (t.id === activeRef.current ? { ...t, path } : t)));
      return true;
    },
    [],
  );

  /** Makes another tab active: its page is read again, its scroll position restored. */
  const activate = useCallback(
    async (id: string) => {
      const target = tabsRef.current.find((t) => t.id === id);
      if (!target) return;
      tabState.current.set(activeRef.current, { back: back.current, forward: forward.current, scroll: contentRef.current?.scrollTop ?? 0 });
      const saved = tabState.current.get(id) ?? { back: [], forward: [], scroll: 0 };
      back.current = saved.back;
      forward.current = saved.forward;
      activeRef.current = id;
      setActiveTab(id);
      await load(target.path);
      requestAnimationFrame(() => requestAnimationFrame(() => contentRef.current && (contentRef.current.scrollTop = saved.scroll)));
    },
    [load],
  );

  const switchTab = useCallback(
    async (id: string) => {
      if (id === activeRef.current) return;
      try {
        await latest.current.saveNow();
      } catch {
        return; // keep the note open so the conflict can be resolved
      }
      await activate(id);
    },
    [activate],
  );

  /** A new tab after the active one, with a page or the dashboard. */
  const newTab = useCallback(
    async (path: string | null = null) => {
      try {
        await latest.current.saveNow();
      } catch {
        return;
      }
      const tab = { id: newTabId(), path };
      // Placed now: once activated, the new tab is the active one.
      const list = tabsRef.current;
      const index = list.findIndex((t) => t.id === activeRef.current);
      replaceTabs([...list.slice(0, index + 1), tab, ...list.slice(index + 1)]);
      await activate(tab.id);
    },
    [activate],
  );

  const closeTab = useCallback(
    async (id: string) => {
      const list = tabsRef.current;
      const index = list.findIndex((t) => t.id === id);
      if (index < 0) return;
      const closingActive = id === activeRef.current;
      if (closingActive) {
        try {
          await latest.current.saveNow();
          await latest.current.splitSaver.current?.();
        } catch {
          return;
        }
      }
      tabState.current.delete(id);
      let remaining = list.filter((t) => t.id !== id);
      if (remaining.length === 0) remaining = [{ id: newTabId(), path: null }];
      tabsRef.current = remaining;
      setTabs(remaining);
      if (closingActive) {
        // The tab being closed keeps no state: the next one starts from its own.
        activeRef.current = id;
        await activate(remaining[Math.min(index, remaining.length - 1)].id);
      }
    },
    [activate],
  );

  /** A tab joined to another (split view) leaves no history behind. */
  const forgetTab = (id: string) => tabState.current.delete(id);

  const reorderTab = (id: string, before: string | null) =>
    setTabs((list) => {
      const moved = list.find((t) => t.id === id);
      if (!moved) return list;
      const rest = list.filter((t) => t.id !== id);
      const index = before === null ? rest.length : rest.findIndex((t) => t.id === before);
      return [...rest.slice(0, index), moved, ...rest.slice(index)];
    });

  /** Opens a page: in the active tab (with history), in a new tab, or in the tab already showing it. */
  const select = useCallback(
    async (path: string, navigation: "push" | "history" = "push", newTabRequested = false) => {
      if (!latest.current.vault) return;
      if (newTabRequested) return newTab(path);
      const elsewhere = tabsRef.current.find((t) => t.path === path && t.id !== activeRef.current);
      if (elsewhere && navigation === "push") return switchTab(elsewhere.id);
      try {
        await latest.current.saveNow();
      } catch {
        return; // keep the note open so the conflict can be resolved
      }
      const previous = tabsRef.current.find((t) => t.id === activeRef.current)?.path ?? latest.current.openPath();
      if (!(await load(path))) return;
      // Another page opens at its top, not where the list it was opened from was scrolled.
      if (previous !== path) requestAnimationFrame(() => contentRef.current && (contentRef.current.scrollTop = 0));
      if (navigation === "push" && previous && previous !== path) {
        back.current.push(previous);
        forward.current = [];
      }
    },
    [load, newTab, switchTab],
  );

  const goBack = useCallback(() => {
    const path = back.current.pop();
    if (!path) return;
    const current = latest.current.openPath();
    if (current) forward.current.push(current);
    void select(path, "history");
  }, [select]);

  const goForward = useCallback(() => {
    const path = forward.current.pop();
    if (!path) return;
    const current = latest.current.openPath();
    if (current) back.current.push(current);
    void select(path, "history");
  }, [select]);

  const cycleTab = (step: number) => {
    const list = tabsRef.current;
    const index = list.findIndex((t) => t.id === activeRef.current);
    const next = list[(index + step + list.length) % list.length];
    if (next) void switchTab(next.id);
  };

  /** Shows the dashboard in the active tab; Back returns to the page. */
  const showHome = async () => {
    try {
      await latest.current.saveNow();
    } catch {
      return;
    }
    const previous = tabsRef.current.find((t) => t.id === activeRef.current)?.path ?? null;
    if ((await load(null)) && previous && !latest.current.isView(previous)) {
      back.current.push(previous);
      forward.current = [];
    }
  };

  /**
   * Opens the dashboard or a view from the sidebar: in the tab already showing
   * it, else in place when the active tab shows a view, else in a new tab (the
   * open page stays where it is).
   */
  const openView = (path: string | null, newTabRequested: boolean) => {
    const existing = tabsRef.current.find((t) => t.path === path);
    if (existing && !newTabRequested) return switchTab(existing.id);
    const current = tabsRef.current.find((t) => t.id === activeRef.current)?.path ?? null;
    if (newTabRequested || (current !== null && !latest.current.isView(current))) return newTab(path);
    return path === null ? showHome() : select(path, "push");
  };

  /** Pages moved or renamed: the tabs and the history follow them. */
  const followMoves = (moved: (path: string) => string) => {
    back.current = back.current.map(moved);
    forward.current = forward.current.map(moved);
    setTabs((list) => list.map((t) => ({ ...t, path: t.path && !latest.current.isView(t.path) ? moved(t.path) : t.path, split: t.split ? moved(t.split) : t.split })));
  };

  /** Pages deleted: their tabs show the dashboard instead, the history forgets them. */
  const forgetPages = (gone: (path: string | null) => boolean) => {
    back.current = back.current.filter((p) => !gone(p));
    forward.current = forward.current.filter((p) => !gone(p));
    setTabs((list) => list.map((t) => ({ ...t, path: gone(t.path) ? null : t.path, split: gone(t.split ?? null) ? null : t.split })));
  };

  return {
    tabs,
    activeTab,
    tabsRef,
    activeRef,
    contentRef,
    canBack: back.current.length > 0,
    canForward: forward.current.length > 0,
    splitOf,
    replaceTabs,
    setTabSplit,
    restore,
    select,
    switchTab,
    newTab,
    closeTab,
    forgetTab,
    reorderTab,
    goBack,
    goForward,
    cycleTab,
    openView,
    followMoves,
    forgetPages,
  };
}
