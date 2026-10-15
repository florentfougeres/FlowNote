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

/**
 * Pages shown at full width, like Notion's "Full width": remembered by FlowNote
 * (by path), the notes themselves are not changed.
 */
export function useWidePages() {
  const [wide, setWide] = useState(read);
  const toggle = useCallback((path: string) => {
    setWide((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        // not remembered
      }
      return next;
    });
  }, []);
  return [wide, toggle] as const;
}
