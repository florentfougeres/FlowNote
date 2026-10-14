import { lazy, Suspense } from "react";
import type { CanvasProps } from "./ExcalidrawCanvas";

// Excalidraw is large: loaded only when a drawing is opened.
const ExcalidrawCanvas = lazy(() => import("./ExcalidrawCanvas"));

/** A drawing page (Name.excalidraw.md), edited with Excalidraw. */
export function DrawingEditor(props: CanvasProps) {
  return (
    <div className="drawing-page">
      <Suspense fallback={<div className="drawing-loading">Chargement du dessin…</div>}>
        <ExcalidrawCanvas {...props} />
      </Suspense>
    </div>
  );
}

export type { CanvasProps, DrawingControls, DrawingTool } from "./ExcalidrawCanvas";
