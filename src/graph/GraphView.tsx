import { useEffect, useRef } from "react";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import type { GraphNode, VaultGraph } from "./graph";

interface SimNode extends SimulationNodeDatum {
  node: GraphNode;
  r: number;
}
type SimLink = SimulationLinkDatum<SimNode>;

const DRAWING_COLOR = "#8e44ad";

/**
 * The vault graph drawn on a canvas, laid out by a force simulation (linked
 * notes attract, all notes repel), like Obsidian's graph view. Hover lights a
 * note and its neighbours; click opens it (⌘-click: new tab). In `compact`
 * mode (dashboard preview) the view does not zoom or pan.
 */
export function GraphView({ graph, onOpen, compact = false }: { graph: VaultGraph; onOpen: (path: string, newTab: boolean) => void; compact?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recenter = useRef<() => void>(() => {});
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const container = box.current!;
    const ctx = canvas.getContext("2d")!;
    const nodes: SimNode[] = graph.nodes.map((node) => ({ node, r: Math.min(16, 3.5 + Math.sqrt(node.degree) * 1.8) }));
    const byId = new Map(nodes.map((n) => [n.node.id, n]));
    const links: SimLink[] = graph.edges.map((e) => ({ source: byId.get(e.source)!, target: byId.get(e.target)! }));
    const neighbours = new Map<SimNode, Set<SimNode>>(nodes.map((n) => [n, new Set([n])]));
    for (const l of links) {
      neighbours.get(l.source as SimNode)!.add(l.target as SimNode);
      neighbours.get(l.target as SimNode)!.add(l.source as SimNode);
    }

    const simulation = forceSimulation(nodes)
      .force("link", forceLink<SimNode, SimLink>(links).distance(36))
      .force("charge", forceManyBody<SimNode>().strength(compact ? -45 : -80).distanceMax(500))
      .force("x", forceX<SimNode>().strength(0.07))
      .force("y", forceY<SimNode>().strength(0.07))
      .force("collide", forceCollide<SimNode>((n) => n.r + 2))
      .stop();

    let width = 0;
    let height = 0;
    const view = { x: 0, y: 0, k: 1 };
    /** Until the user zooms or pans, the view keeps the whole graph in frame. */
    let autoFit = true;
    let hover: SimNode | null = null;
    let frame = 0;
    let dragging: { node: SimNode | null; startX: number; startY: number; viewX: number; viewY: number; moved: boolean } | null = null;

    const fit = () => {
      if (nodes.length === 0 || width === 0) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of nodes) {
        minX = Math.min(minX, n.x! - n.r);
        minY = Math.min(minY, n.y! - n.r);
        maxX = Math.max(maxX, n.x! + n.r);
        maxY = Math.max(maxY, n.y! + n.r);
      }
      const pad = compact ? 16 : 48;
      view.k = Math.min(2, (width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxY - minY));
      view.x = width / 2 - ((minX + maxX) / 2) * view.k;
      view.y = height / 2 - ((minY + maxY) / 2) * view.k;
    };

    const colors = () => {
      const style = getComputedStyle(container);
      const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
      return { text: v("--text", "#1d1d1f"), muted: v("--muted", "#86868b"), accent: v("--accent", "#0a84ff"), bg: v("--bg-elevated", "#fff") };
    };

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const c = colors();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.translate(view.x, view.y);
      ctx.scale(view.k, view.k);
      const lit = hover ? neighbours.get(hover)! : null;

      ctx.lineWidth = 1 / view.k;
      for (const l of links) {
        const s = l.source as SimNode;
        const t = l.target as SimNode;
        const on = hover !== null && (s === hover || t === hover);
        ctx.strokeStyle = on ? c.accent : c.muted;
        ctx.globalAlpha = on ? 0.9 : lit ? 0.08 : 0.3;
        ctx.beginPath();
        ctx.moveTo(s.x!, s.y!);
        ctx.lineTo(t.x!, t.y!);
        ctx.stroke();
      }

      for (const n of nodes) {
        const kind = n.node.kind;
        ctx.globalAlpha = lit && !lit.has(n) ? 0.15 : kind === "missing" ? 0.45 : 1;
        ctx.fillStyle = n === hover ? c.accent : kind === "ticket" ? c.accent : kind === "drawing" ? DRAWING_COLOR : c.muted;
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Titles fade in with the zoom; the hovered note and its neighbours always have theirs.
      const zoomAlpha = Math.max(0, Math.min(1, (view.k - (compact ? 1.4 : 0.9)) / 0.5));
      ctx.font = `${12 / view.k}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const n of nodes) {
        const alpha = lit ? (lit.has(n) ? 1 : 0) : zoomAlpha;
        if (alpha <= 0) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = n === hover ? c.text : c.muted;
        ctx.fillText(n.node.icon ? `${n.node.icon} ${n.node.title}` : n.node.title, n.x!, n.y! + n.r + 3 / view.k);
      }
      ctx.globalAlpha = 1;
    };

    /** Runs the simulation and redraws until it settles. */
    const loop = () => {
      cancelAnimationFrame(frame);
      const step = () => {
        const ticks = nodes.length > 1500 ? 1 : nodes.length > 400 ? 2 : 3;
        for (let i = 0; i < ticks; i++) simulation.tick();
        if (autoFit) fit();
        draw();
        if (simulation.alpha() > simulation.alphaMin() || dragging?.node) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (autoFit) fit();
      draw();
    };

    // A head start, so the graph appears nearly laid out.
    const start = performance.now();
    while (performance.now() - start < 120 && simulation.alpha() > 0.08) simulation.tick();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    loop();

    const toGraph = (event: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left - view.x) / view.k, y: (event.clientY - rect.top - view.y) / view.k };
    };
    const nodeAt = (event: { clientX: number; clientY: number }) => {
      const p = toGraph(event);
      let best: SimNode | null = null;
      let bestDistance = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(n.x! - p.x, n.y! - p.y);
        if (d < Math.max(n.r + 3, 6 / view.k) && d < bestDistance) {
          best = n;
          bestDistance = d;
        }
      }
      return best;
    };

    const onPointerDown = (event: PointerEvent) => {
      const node = nodeAt(event);
      if (!node && compact) return;
      canvas.setPointerCapture(event.pointerId);
      dragging = { node, startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y, moved: false };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (dragging) {
        const dx = event.clientX - dragging.startX;
        const dy = event.clientY - dragging.startY;
        if (!dragging.moved && Math.hypot(dx, dy) < 4) return;
        dragging.moved = true;
        if (dragging.node) {
          const p = toGraph(event);
          dragging.node.fx = p.x;
          dragging.node.fy = p.y;
          simulation.alphaTarget(0.25);
          if (simulation.alpha() < 0.25) simulation.alpha(0.25);
          loop();
        } else {
          autoFit = false;
          view.x = dragging.viewX + dx;
          view.y = dragging.viewY + dy;
          draw();
        }
        return;
      }
      const node = nodeAt(event);
      if (node !== hover) {
        hover = node;
        canvas.style.cursor = node && node.node.kind !== "missing" ? "pointer" : "default";
        draw();
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      const drag = dragging;
      dragging = null;
      if (!drag) return;
      if (drag.node) {
        drag.node.fx = null;
        drag.node.fy = null;
        simulation.alphaTarget(0);
        if (!drag.moved && drag.node.node.kind !== "missing") openRef.current(drag.node.node.id, event.metaKey || event.ctrlKey);
      }
    };
    const onLeave = () => {
      if (hover && !dragging) {
        hover = null;
        draw();
      }
    };
    const onWheel = (event: WheelEvent) => {
      if (compact) return;
      event.preventDefault();
      autoFit = false;
      const rect = canvas.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const k = Math.min(8, Math.max(0.05, view.k * Math.exp(-event.deltaY * 0.0015)));
      view.x = mx - ((mx - view.x) / view.k) * k;
      view.y = my - ((my - view.y) / view.k) * k;
      view.k = k;
      draw();
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    // The theme can change while the graph is shown.
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", draw);
    recenter.current = () => {
      autoFit = true;
      fit();
      draw();
    };

    return () => {
      cancelAnimationFrame(frame);
      simulation.stop();
      observer.disconnect();
      media.removeEventListener("change", draw);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [graph, compact]);

  return (
    <div ref={box} className={compact ? "graph-view compact" : "graph-view"}>
      <canvas ref={canvasRef} role="img" aria-label={`Graphe : ${graph.nodes.length} notes, ${graph.edges.length} liens`} />
      {!compact && graph.nodes.length > 0 && (
        <button className="graph-recenter" onClick={() => recenter.current()}>
          Recentrer
        </button>
      )}
      {graph.nodes.length === 0 && <p className="graph-empty">Aucune note à afficher.</p>}
    </div>
  );
}
