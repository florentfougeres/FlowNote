import { useCallback, useState } from "react";

/**
 * A boolean preference remembered in localStorage as one of two words
 * (e.g. "shown" / "hidden"); any other stored value means `initial`.
 */
export function usePersistentFlag(key: string, initial: boolean, [onWord, offWord]: [string, string]) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === onWord ? true : stored === offWord ? false : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: boolean | ((current: boolean) => boolean)) =>
      setValue((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        try {
          localStorage.setItem(key, resolved ? onWord : offWord);
        } catch {
          // not remembered
        }
        return resolved;
      }),
    [key, onWord, offWord],
  );
  return [value, set] as const;
}
