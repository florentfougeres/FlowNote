import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../vault/tauriVault";
import type { RenderedSlides } from "./slides";
import { SlidesStyle } from "./SlidesPanel";
import { SlideFrame } from "./SlideFrame";

/** Full screen for the presentation: the window in the desktop app, the page in a browser. */
async function setFullscreen(on: boolean) {
  try {
    if (isTauri()) await getCurrentWindow().setFullscreen(on);
    else if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    else if (!on && document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // stays windowed
  }
}


const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Presenting mode: one slide filling the screen. Arrows, space and clicks move;
 * P shows the presenter view (next slide, speaker notes, timer); Escape leaves.
 */
export function Presenter({ rendered, start, onClose }: { rendered: RenderedSlides; start: number; onClose: (index: number) => void }) {
  const count = rendered.slides.length;
  const [index, setIndex] = useState(Math.min(start, count - 1));
  const [presenterView, setPresenterView] = useState(false);
  const [black, setBlack] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void setFullscreen(true);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
      void setFullscreen(false);
    };
  }, []);

  useEffect(() => {
    const go = (step: number) => setIndex((i) => Math.max(0, Math.min(count - 1, i + step)));
    const onKey = (event: KeyboardEvent) => {
      const key = event.key;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(key)) go(1);
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(key)) go(-1);
      else if (key === "Home") setIndex(0);
      else if (key === "End") setIndex(count - 1);
      else if (key === "p" || key === "P") setPresenterView((v) => !v);
      else if (key === "b" || key === "B" || key === ".") setBlack((v) => !v);
      else if (key === "Escape") onClose(index);
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [count, index, onClose]);

  const elapsed = Math.floor((now - startedAt) / 1000);
  const clock = new Date(now);

  return (
    <div className={presenterView ? "presenter presenter-view" : "presenter"} role="dialog" aria-label="Présentation">
      <SlidesStyle css={rendered.css} />
      {presenterView ? (
        <>
          <div className="presenter-current">
            <SlideFrame html={rendered.slides[index]} fit="contain" />
          </div>
          <div className="presenter-side">
            <div className="presenter-next">
              <small>Diapo suivante</small>
              {index + 1 < count ? <SlideFrame html={rendered.slides[index + 1]} /> : <p className="presenter-end">Fin de la présentation</p>}
            </div>
            <div className="presenter-notes">
              <small>Notes</small>
              <p>{rendered.notes[index] || "Pas de notes pour cette diapo."}</p>
            </div>
            <div className="presenter-clock">
              <strong>
                {pad(Math.floor(elapsed / 60))}:{pad(elapsed % 60)}
              </strong>
              <span>
                {pad(clock.getHours())}:{pad(clock.getMinutes())} · diapo {index + 1} / {count}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="presenter-stage" onClick={(e) => setIndex((i) => Math.max(0, Math.min(count - 1, i + (e.clientX < window.innerWidth / 3 ? -1 : 1))))}>
          <SlideFrame html={rendered.slides[index]} fit="contain" />
        </div>
      )}
      {black && <div className="presenter-black" onClick={() => setBlack(false)} />}
      <div className="presenter-hint">
        {index + 1} / {count} · ← → pour avancer · P vue présentateur · B écran noir · Échap pour quitter
      </div>
    </div>
  );
}
