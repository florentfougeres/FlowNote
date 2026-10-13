/**
 * Obsidian's built-in callout types (`> [!type]`), with their aliases, colors
 * and icons as Obsidian displays them. Unknown types render like a note, as in
 * Obsidian; the type written in the Markdown is never changed.
 */

export interface CalloutType {
  type: string;
  label: string;
  aliases: string[];
  /** "r, g, b", Obsidian's default color for the type. */
  color: string;
  /** 16×16 stroke icon. */
  icon: string;
}

const CIRCLE = "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12z";

export const CALLOUT_TYPES: CalloutType[] = [
  { type: "note", label: "Note", aliases: [], color: "8, 109, 221", icon: "M10.5 2.5l3 3L6 13H3v-3z M9 4l3 3" },
  { type: "abstract", label: "Résumé", aliases: ["summary", "tldr"], color: "0, 191, 188", icon: "M5.5 2.5h5v2h-5z M4.5 3.5H3v10h10v-10h-1.5 M5.5 8h5 M5.5 10.5h5" },
  { type: "info", label: "Info", aliases: [], color: "8, 109, 221", icon: `${CIRCLE} M8 7.5V11 M8 5h.01` },
  { type: "todo", label: "À faire", aliases: [], color: "8, 109, 221", icon: `${CIRCLE} M5.5 8l2 2 3-3.5` },
  { type: "tip", label: "Astuce", aliases: ["hint", "important"], color: "0, 191, 188", icon: "M8 14c2.5 0 4-1.7 4-4 0-2.5-2-4-2.5-6.5C8 5 7.5 6 7.5 7 6.5 6.5 6 5.5 6 4.5 4.5 6 4 7.8 4 10c0 2.3 1.5 4 4 4z" },
  { type: "success", label: "Succès", aliases: ["check", "done"], color: "8, 185, 78", icon: "M3 8.5l3.5 3.5L13 4.5" },
  { type: "question", label: "Question", aliases: ["help", "faq"], color: "236, 117, 0", icon: `${CIRCLE} M6.3 6.2a1.8 1.8 0 0 1 3.5.6c0 1.2-1.8 1.7-1.8 1.7 M8 11h.01` },
  { type: "warning", label: "Attention", aliases: ["caution", "attention"], color: "236, 117, 0", icon: "M8 2.5l6 10.5H2z M8 6.5v3 M8 11.5h.01" },
  { type: "failure", label: "Échec", aliases: ["fail", "missing"], color: "233, 49, 71", icon: "M4 4l8 8 M12 4l-8 8" },
  { type: "danger", label: "Danger", aliases: ["error"], color: "233, 49, 71", icon: "M9 1.5L3 9h4.5L7 14.5 13 7H8.5z" },
  { type: "bug", label: "Bug", aliases: [], color: "233, 49, 71", icon: "M5.5 5.5h5v5a2.5 2.5 0 0 1-5 0z M8 5.5V13 M5.5 8H3 M13 8h-2.5 M6 3.5l1 1.5 M10 3.5L9 5" },
  { type: "example", label: "Exemple", aliases: [], color: "120, 82, 238", icon: "M6 4h7 M6 8h7 M6 12h7 M3 4h.01 M3 8h.01 M3 12h.01" },
  { type: "quote", label: "Citation", aliases: ["cite"], color: "158, 158, 158", icon: "M3.5 9.5h3v3.5h-3z M3.5 9.5C3.5 7 4.5 5 6.5 4 M9.5 9.5h3v3.5h-3z M9.5 9.5c0-2.5 1-4.5 3-5.5" },
];

/** The built-in type a written type (or alias, any case) stands for; unknown types look like notes. */
export function calloutInfo(type: string): CalloutType {
  const t = type.trim().toLowerCase();
  return CALLOUT_TYPES.find((c) => c.type === t || c.aliases.includes(t)) ?? CALLOUT_TYPES[0];
}

export function calloutIconSvg(info: CalloutType): string {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${info.icon}"/></svg>`;
}

/* ---- Callout type picker (all types), opened from the slash menu or a callout's icon ---- */

export interface PickerRequest {
  x: number;
  y: number;
  current?: string;
  onPick: (type: string) => void;
}

class PickerStore {
  state: PickerRequest | null = null;
  private listeners = new Set<() => void>();
  open(request: PickerRequest | null) {
    this.state = request;
    this.listeners.forEach((listener) => listener());
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
}

export const calloutPicker = new PickerStore();
