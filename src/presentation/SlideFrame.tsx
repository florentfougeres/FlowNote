import { useLayoutEffect, useRef, useState } from "react";

/**
 * One slide scaled to its box. Marp renders a slide as a <section> of its real
 * size (1280×720 by default); the frame measures it and scales it with a CSS
 * transform. (Marp's <svg> wrapping would scale it natively, but WebKit, the
 * desktop app's engine, does not draw HTML inside SVG at the right size.)
 * `width`: as wide as the box, as tall as needed. `contain`: the whole slide
 * fits in the box, centred.
 */
export function SlideFrame({ html, fit = "width" }: { html: string | undefined; fit?: "width" | "contain" }) {
  const frame = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ scale: 0, width: 1280, height: 720, x: 0, y: 0 });

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const update = () => {
      const section = el.querySelector<HTMLElement>(".marpit > section");
      const width = section?.offsetWidth || 1280;
      const height = section?.offsetHeight || 720;
      const box = el.getBoundingClientRect();
      const scale = fit === "contain" ? Math.min(box.width / width, box.height / height) : box.width / width;
      setLayout({ scale, width, height, x: fit === "contain" ? (box.width - width * scale) / 2 : 0, y: fit === "contain" ? (box.height - height * scale) / 2 : 0 });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit, html]);

  return (
    <div ref={frame} className={`slide-frame ${fit}`} style={fit === "width" ? { height: layout.height * layout.scale } : undefined}>
      <div
        className="marpit"
        style={{ width: layout.width, height: layout.height, transform: `translate(${layout.x}px, ${layout.y}px) scale(${layout.scale})`, visibility: layout.scale ? "visible" : "hidden" }}
        dangerouslySetInnerHTML={{ __html: html ?? "" }}
      />
    </div>
  );
}
