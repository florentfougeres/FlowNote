import { useEffect, useRef, type RefObject } from "react";

/** Closes a popover on a click outside its box, and on Escape with `escape`; while `active` (default: always). */
export function useClickOutside(box: RefObject<HTMLElement | null>, onClose: () => void, { active = true, escape = false } = {}) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!active) return;
    const down = (event: MouseEvent) => !box.current?.contains(event.target as Node) && close.current();
    const key = (event: KeyboardEvent) => event.key === "Escape" && close.current();
    window.addEventListener("mousedown", down);
    if (escape) window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [box, active, escape]);
}
