/** Pages opened recently in a vault (kept in this browser/app only), newest first. */

const key = (vault: string) => `flownote:recent-pages:${vault}`;
const MAX = 20;

export interface RecentPage {
  path: string;
  /** Last time it was opened (ms). */
  at: number;
}

export function recentPages(vault: string): RecentPage[] {
  try {
    const list = JSON.parse(localStorage.getItem(key(vault)) ?? "[]") as unknown;
    return Array.isArray(list) ? list.filter((p): p is RecentPage => typeof p?.path === "string" && typeof p?.at === "number") : [];
  } catch {
    return [];
  }
}

export function recordRecentPage(vault: string, path: string, at = Date.now()) {
  try {
    const next = [{ path, at }, ...recentPages(vault).filter((p) => p.path !== path)].slice(0, MAX);
    localStorage.setItem(key(vault), JSON.stringify(next));
  } catch {
    // not remembered
  }
}

/** Follows a rename or a deletion (path → next, or removed with null). */
export function moveRecentPage(vault: string, path: string, next: string | null) {
  try {
    const list = recentPages(vault)
      .map((p) => (p.path === path || p.path.startsWith(`${path.replace(/\.md$/, "")}/`) ? { ...p, path: next ? p.path.replace(path, next) : "" } : p))
      .filter((p) => p.path);
    localStorage.setItem(key(vault), JSON.stringify(list));
  } catch {
    // not remembered
  }
}
