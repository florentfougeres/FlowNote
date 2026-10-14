import { lazy, Suspense } from "react";
import type { MindmapCanvasProps } from "./MindmapCanvas";

// Mind Elixir is loaded with the first mind map, not with the app.
const MindmapCanvas = lazy(() => import("./MindmapCanvas"));

export function MindmapEditor(props: MindmapCanvasProps) {
  return (
    <div className="mindmap-page">
      <Suspense fallback={<div className="drawing-loading">Chargement de la mind map…</div>}>
        <MindmapCanvas {...props} />
      </Suspense>
    </div>
  );
}

export type { MindmapCanvasProps, MindmapControls } from "./MindmapCanvas";
