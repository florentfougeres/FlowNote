import type { Tab } from "./TabBar";

/**
 * The tab list and the split view, as pure functions: a tab shows a page (or
 * a view), and maybe a second page on its right (`split`), the pair being one
 * tab. `isPage` tells pages from the app's views (dashboard, tickets…).
 */

/** The page on the right of a tab, or null. */
export const splitOf = (tabs: Tab[], id: string): string | null => tabs.find((t) => t.id === id)?.split ?? null;

/** Sets (or, with null, closes) the page on the right of a tab. */
export const withSplit = (tabs: Tab[], id: string, split: string | null): Tab[] =>
  tabs.map((t) => (t.id === id ? { ...t, split, splitReading: split ? t.splitReading : undefined } : t));

/** Turns the reading mode of one side of a tab on or off. */
export const withReading = (tabs: Tab[], id: string, side: "page" | "split", on: boolean): Tab[] =>
  tabs.map((t) => (t.id === id ? (side === "page" ? { ...t, reading: on } : { ...t, splitReading: on }) : t));

/** The two sides of a tab trade places, with their reading modes. */
export const swapReading = (tabs: Tab[], id: string): Tab[] => tabs.map((t) => (t.id === id ? { ...t, reading: t.splitReading, splitReading: t.reading } : t));

/**
 * The page of tab `other` goes to the right of tab `active`; the two make one
 * tab. A page already on the right goes back to a tab of its own (`newId`), in
 * place of the one joined. Null when `other` holds no page.
 */
export function joinTab(tabs: Tab[], active: string, other: string, newId: string, isPage: (path: string) => boolean): Tab[] | null {
  const joined = tabs.find((t) => t.id === other);
  if (!joined?.path || !isPage(joined.path) || other === active) return null;
  const previous = splitOf(tabs, active);
  const previousReading = tabs.find((t) => t.id === active)?.splitReading;
  return tabs.flatMap((t) => {
    if (t.id === active) return [{ ...t, split: joined.path, splitReading: joined.reading }];
    if (t.id !== other) return [t];
    return previous ? [{ id: newId, path: previous, reading: previousReading }] : [];
  });
}

/** The page on the right of a tab goes to a tab of its own (`newId`), after it. Null when there is none. */
export function separateTab(tabs: Tab[], id: string, newId: string): Tab[] | null {
  const split = splitOf(tabs, id);
  if (!split) return null;
  return tabs.flatMap((t) => (t.id === id ? [{ ...t, split: null, splitReading: undefined }, { id: newId, path: split, reading: t.splitReading }] : [t]));
}

/** The next tab holding a page after `active` (going round), to show on its right. */
export function nextPageTab(tabs: Tab[], active: string, isPage: (path: string) => boolean): Tab | undefined {
  const index = tabs.findIndex((t) => t.id === active);
  return [...tabs.slice(index + 1), ...tabs.slice(0, index)].find((t) => t.path !== null && isPage(t.path));
}
