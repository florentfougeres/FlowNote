import { useEffect, useState } from "react";
import type { RenderedSlides } from "./slides";

/**
 * Slides of a presentation note, rendered by Marp a moment after the text
 * stops changing, with the vault's images.
 */
export function useSlides(markdown: string, notePath: string, files: string[], loadImage: (path: string) => Promise<string>, enabled = true, delay = 250): RenderedSlides | null {
  const [rendered, setRendered] = useState<RenderedSlides | null>(null);
  useEffect(() => {
    if (!enabled) return setRendered(null);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      // Marp is loaded with the first presentation, not with the app.
      void import("./slides").then(async ({ renderSlides, withLocalImages }) => {
        let next: RenderedSlides;
        try {
          next = renderSlides(markdown);
        } catch {
          return;
        }
        const slides = await Promise.all(next.slides.map((html) => withLocalImages(html, notePath, files, loadImage)));
        if (!cancelled) setRendered({ ...next, slides });
      });
    }, rendered ? delay : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown, notePath, files, loadImage, enabled]);
  return rendered;
}

/** Index of the slide holding editor position `pos`: the number of slide breaks (top-level rules) before it. */
export function slideAt(doc: { forEach: (f: (node: { type: { name: string } }, offset: number) => void) => void }, pos: number): number {
  let index = 0;
  doc.forEach((node, offset) => {
    if (node.type.name === "horizontalRule" && offset < pos) index++;
  });
  return index;
}

/** Editor position of the start of slide `index` (just after its break), or 0. */
export function slideStart(doc: { forEach: (f: (node: { type: { name: string }; nodeSize: number }, offset: number) => void) => void }, index: number): number {
  if (index === 0) return 0;
  let seen = 0;
  let start = 0;
  doc.forEach((node, offset) => {
    if (node.type.name === "horizontalRule" && ++seen === index) start = offset + node.nodeSize;
  });
  return start;
}
