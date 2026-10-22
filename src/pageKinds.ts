import type { IconName } from "./Icon";

export type PageKind = "note" | "base" | "drawing" | "mindmap" | "canvas" | "ticket" | "presentation";

/** The page types, shared by the home page and the "Nouvelle page" dialog. */
export const PAGE_KINDS: readonly { kind: PageKind; label: string; create: string; icon: IconName; description: string }[] = [
  { kind: "note", label: "Note", create: "Nouvelle note", icon: "doc", description: "Texte, listes, tableaux, callouts" },
  { kind: "base", label: "Base", create: "Nouvelle base", icon: "database", description: "Tableau, kanban, galerie, calendrier" },
  { kind: "drawing", label: "Dessin", create: "Nouveau dessin", icon: "drawing", description: "Schémas à main levée (Excalidraw)" },
  { kind: "mindmap", label: "Mind map", create: "Nouvelle mind map", icon: "mindmap", description: "Idées en branches, à la souris et au clavier" },
  { kind: "canvas", label: "Canevas", create: "Nouveau canevas", icon: "canvas", description: "Notes, textes et liens reliés" },
  { kind: "ticket", label: "Ticket", create: "Nouveau ticket", icon: "ticket", description: "Suivi, commentaires, échéance" },
  { kind: "presentation", label: "Présentation", create: "Nouvelle présentation", icon: "slides", description: "Diapos en Markdown (Marp)" },
];

/** Class of a type's colored icon tile (a note keeps the accent: `.note` is the editor's class). */
export const kindIconClass = (kind: PageKind) => (kind === "note" ? "dash-create-icon" : `dash-create-icon ${kind}`);
