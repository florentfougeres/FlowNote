/** Orders of the page tree, as in Obsidian's file explorer: folders first, then pages. */

export type PageSort = "name-asc" | "name-desc" | "mtime-desc" | "mtime-asc" | "ctime-desc" | "ctime-asc";

export const PAGE_SORTS: [PageSort, string][] = [
  ["name-asc", "Nom (A à Z)"],
  ["name-desc", "Nom (Z à A)"],
  ["mtime-desc", "Modifiée (récente d'abord)"],
  ["mtime-asc", "Modifiée (ancienne d'abord)"],
  ["ctime-desc", "Créée (récente d'abord)"],
  ["ctime-asc", "Créée (ancienne d'abord)"],
];

export const isPageSort = (value: unknown): value is PageSort => PAGE_SORTS.some(([sort]) => sort === value);

export type FileTimes = Map<string, { ctime: number; mtime: number }>;

const byName = (a: string, b: string) => a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" });

/**
 * `items` in the order `sort`: folders (no path) first, by name (reversed for
 * Z to A); pages by their shown name or by the times of their file, the
 * newest or oldest first, the name breaking ties.
 */
export function sortPages<T extends { path: string | null; label: string }>(items: T[], sort: PageSort, times: FileTimes): T[] {
  const [key, direction] = sort.split("-") as ["name" | "mtime" | "ctime", "asc" | "desc"];
  const sign = direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    if ((a.path === null) !== (b.path === null)) return a.path === null ? -1 : 1;
    if (key !== "name" && a.path !== null && b.path !== null) {
      const delta = (times.get(a.path)?.[key] ?? 0) - (times.get(b.path)?.[key] ?? 0);
      if (delta !== 0) return sign * delta;
      return byName(a.label, b.label);
    }
    return (key === "name" ? sign : 1) * byName(a.label, b.label);
  });
}
