import { animate } from "motion";

/**
 * Visuals of a block drag, following Apple's fluid-interface principles:
 * the ghost tracks the pointer 1:1 and keeps the grab offset, lifts slightly
 * when grabbed, the insertion line glides between targets with an
 * interruptible spring, and on release the ghost continues with the gesture's
 * velocity into its new place (or back where it came from when cancelled).
 * With "reduce motion", positions change without springs.
 */

export interface Line {
  top: number;
  left: number;
  width: number;
}

interface Point {
  x: number;
  y: number;
}

/** Critically damped: settles without overshoot (default UI motion). */
const SETTLE = { type: "spring", bounce: 0, duration: 0.3 } as const;
/** Slight bounce, used only after a gesture that carried momentum (the release). */
const THROW = { type: "spring", bounce: 0.12, duration: 0.38 } as const;

const VELOCITY_WINDOW_MS = 100;

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export class DragVisual {
  private readonly wrap = document.createElement("div");
  private readonly ghost: HTMLElement;
  private readonly indicator = document.createElement("div");
  private readonly origin: DOMRect;
  private readonly offset: Point;
  private position: Point;
  private history: { x: number; y: number; t: number }[] = [];
  private indicatorVisible = false;
  private readonly reduced = prefersReducedMotion();

  constructor(
    private readonly source: HTMLElement,
    pointer: Point,
  ) {
    this.origin = source.getBoundingClientRect();
    // Respect where the block was grabbed: no jump to the pointer.
    this.offset = { x: pointer.x - this.origin.left, y: pointer.y - this.origin.top };
    this.position = { x: this.origin.left, y: this.origin.top };

    this.wrap.className = "drag-ghost-wrap";
    this.ghost = source.cloneNode(true) as HTMLElement;
    this.ghost.classList.add("drag-ghost");
    this.ghost.style.width = `${this.origin.width}px`;
    this.wrap.append(this.ghost);
    this.render();
    document.body.append(this.wrap);
    source.classList.add("dragging-source");

    this.indicator.className = "drop-indicator";
    this.indicator.style.opacity = "0";
    document.body.append(this.indicator);

    if (!this.reduced) animate(this.ghost, { scale: 1.02 }, SETTLE);
  }

  /** Follows the pointer exactly (direct manipulation). */
  move(pointer: Point) {
    this.position = { x: pointer.x - this.offset.x, y: pointer.y - this.offset.y };
    const now = performance.now();
    this.history.push({ ...pointer, t: now });
    this.history = this.history.filter((h) => now - h.t <= VELOCITY_WINDOW_MS);
    this.render();
  }

  showTarget(line: Line | null) {
    if (!line) {
      if (this.indicatorVisible) animate(this.indicator, { opacity: 0 }, { duration: 0.12 });
      this.indicatorVisible = false;
      return;
    }
    const target = { x: line.left, y: line.top - 1.5, width: line.width };
    if (!this.indicatorVisible || this.reduced) {
      // First appearance: placed directly, then faded in.
      animate(this.indicator, target, { duration: 0 });
      animate(this.indicator, { opacity: 1 }, { duration: 0.12 });
    } else {
      // Retargeting mid-flight continues from the current position and velocity.
      animate(this.indicator, target, SETTLE);
    }
    this.indicatorVisible = true;
  }

  /** Release: the ghost flies into `target` (the block's new place) with the gesture's velocity. */
  async land(target: HTMLElement | null): Promise<void> {
    animate(this.indicator, { opacity: 0 }, { duration: 0.1 });
    const rect = target?.getBoundingClientRect();
    if (this.reduced || !rect) return this.dispose();
    target!.style.opacity = "0";
    const velocity = this.velocity();
    await Promise.all([this.springTo({ x: rect.left, y: rect.top }, velocity, THROW), animate(this.ghost, { scale: 1 }, SETTLE)]);
    target!.style.opacity = "";
    target!.classList.add("just-dropped");
    window.setTimeout(() => target!.classList.remove("just-dropped"), 700);
    this.dispose();
  }

  /** Cancel: back along the same path to where the block came from. */
  async cancel(): Promise<void> {
    animate(this.indicator, { opacity: 0 }, { duration: 0.1 });
    if (this.reduced) return this.dispose();
    await Promise.all([this.springTo({ x: this.origin.left, y: this.origin.top }, this.velocity(), SETTLE), animate(this.ghost, { scale: 1 }, SETTLE)]);
    this.dispose();
  }

  private velocity(): Point {
    if (this.history.length < 2) return { x: 0, y: 0 };
    const first = this.history[0];
    const last = this.history[this.history.length - 1];
    const seconds = Math.max((last.t - first.t) / 1000, 0.001);
    return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds };
  }

  /** Independent springs for X and Y, each starting with its own velocity. */
  private springTo(to: Point, velocity: Point, options: typeof THROW | typeof SETTLE): Promise<unknown> {
    const axis = (key: "x" | "y") =>
      animate(this.position[key], to[key], {
        ...options,
        velocity: velocity[key],
        onUpdate: (value: number) => {
          this.position = { ...this.position, [key]: value };
          this.render();
        },
      });
    return Promise.all([axis("x"), axis("y")]);
  }

  private render() {
    this.wrap.style.transform = `translate3d(${this.position.x}px, ${this.position.y}px, 0)`;
  }

  private dispose() {
    this.wrap.remove();
    this.indicator.remove();
    this.source.classList.remove("dragging-source");
  }
}
