import { element } from "./dom";

/**
 * Images of a note: resized by the handle at their bottom right corner (the
 * width is written in the link, `![[image.png|300]]` or `![texte|300](image.png)`,
 * as Obsidian reads it), seen full size on a double click.
 */

const MIN_WIDTH = 40;

/** The width written after a `|` (`300`, `300x200`), or null. */
export function sizeOf(text: string | null): { width: number; height: number | null } | null {
  const size = /^(\d+)(?:x(\d+))?$/.exec(text ?? "");
  return size ? { width: Number(size[1]), height: size[2] ? Number(size[2]) : null } : null;
}

/** A Markdown image's alt text and the size written after its last `|` (`![texte|300](…)`). */
export function splitAlt(alt: string): { text: string; size: { width: number; height: number | null } | null } {
  const bar = alt.lastIndexOf("|");
  const size = sizeOf(bar === -1 ? alt : alt.slice(bar + 1));
  if (!size) return { text: alt, size: null };
  return { text: bar === -1 ? "" : alt.slice(0, bar), size };
}

/** Shows `img` at the size written in its link (none: its own, at most the page's width). */
export function applySize(img: HTMLImageElement, size: { width: number; height: number | null } | null) {
  img.style.width = size ? `${size.width}px` : "";
  img.style.height = size?.height ? `${size.height}px` : "";
}

/**
 * Puts `img` in a frame with a resize handle. Dragging it changes the width
 * on screen; `commit` writes it when the button is released. Returns the frame.
 */
export function resizableImage(img: HTMLImageElement, commit: (width: number) => void): HTMLElement {
  const frame = element("span", "image-frame");
  const handle = element("span", "image-resize");
  handle.title = "Redimensionner";
  frame.append(img, handle);
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const start = img.getBoundingClientRect().width;
    const max = (frame.closest(".note") as HTMLElement | null)?.clientWidth ?? Infinity;
    let width = start;
    handle.setPointerCapture(event.pointerId);
    frame.classList.add("resizing");
    const move = (e: PointerEvent) => {
      width = Math.round(Math.max(MIN_WIDTH, Math.min(max, start + e.clientX - startX)));
      img.style.width = `${width}px`;
      img.style.height = "";
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      frame.classList.remove("resizing");
      if (width !== Math.round(start)) commit(width);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  });
  img.addEventListener("dblclick", (event) => {
    if (!img.src) return;
    event.preventDefault();
    openLightbox(img.src, img.alt);
  });
  return frame;
}

/** Events the image's frame handles itself (the handle, the double click), not the editor. */
export function isImageEvent(event: Event): boolean {
  const target = event.target as Element | null;
  return !!target?.closest?.(".image-resize") || (event.type === "dblclick" && target?.tagName === "IMG");
}

/** The image full size over the app, on a dark background; a click or Échap closes it. */
export function openLightbox(src: string, alt: string) {
  const overlay = element("div", "image-lightbox");
  const img = element("img");
  img.src = src;
  img.alt = alt;
  overlay.append(img);
  const close = () => {
    overlay.remove();
    window.removeEventListener("keydown", key, true);
  };
  const key = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  overlay.addEventListener("click", close);
  window.addEventListener("keydown", key, true);
  document.body.append(overlay);
}
