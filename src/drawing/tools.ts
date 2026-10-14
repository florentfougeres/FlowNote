import type { DrawingTool } from "./DrawingEditor";
import type { IconName } from "../Icon";

/** Drawing tools of the toolbar: Excalidraw tool, icon, label with its shortcut. */
export const DRAWING_TOOLS: [DrawingTool, IconName, string][] = [
  ["selection", "pointer", "Sélection (V)"],
  ["hand", "hand", "Déplacer la vue (H)"],
  ["rectangle", "rectangle", "Rectangle (R)"],
  ["diamond", "diamond", "Losange (D)"],
  ["ellipse", "ellipse", "Ellipse (O)"],
  ["arrow", "arrow", "Flèche (A)"],
  ["line", "line", "Trait (L)"],
  ["freedraw", "pencil", "Crayon (P)"],
  ["text", "text", "Texte (T)"],
  ["image", "image", "Image (9)"],
  ["eraser", "eraser", "Gomme (E)"],
];
