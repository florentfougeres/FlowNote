import { lazy, Suspense } from "react";
import type { CanvasBoardProps } from "./CanvasBoard";

// React Flow is loaded with the first canvas, not with the app.
const CanvasBoard = lazy(() => import("./CanvasBoard"));

export function CanvasEditor(props: CanvasBoardProps) {
  return (
    <div className="canvas-page">
      <Suspense fallback={<div className="drawing-loading">Chargement du canevas…</div>}>
        <CanvasBoard {...props} />
      </Suspense>
    </div>
  );
}
