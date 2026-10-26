import { useRef, useState } from "react";

/**
 * The hidden sidebar shown over the page while the pointer is near the left
 * edge: it opens at once and closes a moment after the pointer left.
 */
export function useSidebarPeek() {
  const [peek, setPeek] = useState(false);
  const timer = useRef<number>(undefined);
  const openPeek = () => {
    window.clearTimeout(timer.current);
    setPeek(true);
  };
  const closePeekSoon = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPeek(false), 250);
  };
  return { peek, setPeek, openPeek, closePeekSoon };
}
