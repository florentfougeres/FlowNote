import { useCallback, useState } from "react";

const KEY = "flownote:wide-pages";

function read(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : []);
  } catch {
    return new Set();
  }
}

function save(paths: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...paths]));
  } catch {
    // not remembered
  }
}

/**
 * Pages shown at full width: remembered by FlowNote
 * (by path), the notes themselves are not changed.
 */
export function useWidePages() {
  const [wide, setWide] = useState(read);
  const toggle = useCallback((path: string) => {
    setWide((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      save(next);
      return next;
    });
  }, []);
  /** After a rename or a move: the pages keep their width at their new path. */
  const follow = useCallback((moved: (path: string) => string) => {
    setWide((current) => {
      const next = new Set([...current].map(moved));
      if ([...next].every((p) => current.has(p))) return current;
      save(next);
      return next;
    });
  }, []);
  return [wide, toggle, follow] as const;
}
