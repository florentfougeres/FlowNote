import { animate } from "motion";

/**
 * Shared motion for dragged things, after Apple's fluid-interface principles:
 * springs that start from where things are and keep the gesture's velocity.
 */

export interface Point {
  x: number;
  y: number;
}

/** Critically damped: settles without overshoot (default UI motion). */
export const SETTLE = { type: "spring", bounce: 0, duration: 0.3 } as const;
/** Slight bounce, used only after a gesture that carried momentum (the release). */
export const THROW = { type: "spring", bounce: 0.12, duration: 0.38 } as const;

const VELOCITY_WINDOW_MS = 100;

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The pointer's velocity over its last moves, in pixels per second. */
export class VelocityTracker {
  private history: { x: number; y: number; t: number }[] = [];

  push(x: number, y: number) {
    const now = performance.now();
    this.history.push({ x, y, t: now });
    this.history = this.history.filter((h) => now - h.t <= VELOCITY_WINDOW_MS);
  }

  velocity(): Point {
    if (this.history.length < 2) return { x: 0, y: 0 };
    const first = this.history[0];
    const last = this.history[this.history.length - 1];
    const seconds = Math.max((last.t - first.t) / 1000, 0.001);
    return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds };
  }

  reset() {
    this.history = [];
  }
}

/** The card for `path` once it is at `index` among `selector` in `column`, as the board shows it. */
export function cardInPlace(column: Element | null | undefined, selector: string, index: number, path: string): HTMLElement | null {
  const card = column?.querySelectorAll<HTMLElement>(selector)[index];
  return card?.dataset.path === path ? card : null;
}

/** How long a landing waits for the card to show in its new place (the vault write may take a moment). */
const LANDING_WAIT_MS = 800;

/**
 * Release of a card dragged as a ghost (kanban and boards): a copy of the
 * ghost flies with the gesture's velocity into the card's new place, given by
 * `find` once the board shows it, then the card takes over. If the card never
 * shows there, the copy fades out where it was dropped.
 */
export function landGhost(ghost: HTMLElement | null, velocity: Point, find: () => HTMLElement | null) {
  if (!ghost?.parentElement || prefersReducedMotion()) return;
  const from = { x: parseFloat(ghost.style.left), y: parseFloat(ghost.style.top) };
  const copy = ghost.cloneNode(true) as HTMLElement;
  ghost.parentElement.append(copy);
  const started = performance.now();
  const wait = () => {
    const target = find();
    if (!target) {
      if (performance.now() - started < LANDING_WAIT_MS) requestAnimationFrame(wait);
      else animate(copy, { opacity: 0 }, { duration: 0.15 }).then(() => copy.remove());
      return;
    }
    const to = target.getBoundingClientRect();
    target.style.opacity = "0";
    const done = () => {
      target.style.opacity = "";
      copy.remove();
    };
    // Independent springs for X and Y, each with its own velocity; the tilt and the lift settle alongside.
    Promise.all([
      animate(copy, { x: [0, to.left - from.x] }, { ...THROW, velocity: velocity.x }),
      animate(copy, { y: [0, to.top - from.y] }, { ...THROW, velocity: velocity.y }),
      animate(copy, { rotate: [2, 0], boxShadow: "0 0 0 rgba(0, 0, 0, 0)" }, SETTLE),
    ]).then(done, done);
  };
  requestAnimationFrame(wait);
}
