import { useState } from "react";

const KEY = "flownote:split-width";
const clamp = (share: number) => Math.min(0.75, Math.max(0.25, share));

/**
 * The right side's share of the split view, and the drag of its separator:
 * kept between 25 % and 75 %, remembered for next time.
 */
export function useSplitWidth(): [number, (event: React.PointerEvent) => void] {
  const [width, setWidth] = useState(() => {
    try {
      return clamp(Number(localStorage.getItem(KEY)) || 0.5);
    } catch {
      return 0.5;
    }
  });

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const area = (event.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    document.body.classList.add("split-resizing");
    let share = width;
    const move = (ev: PointerEvent) => {
      share = clamp((area.right - ev.clientX) / area.width);
      setWidth(share);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("split-resizing");
      try {
        localStorage.setItem(KEY, String(share));
      } catch {
        // not remembered
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return [width, startResize];
}
