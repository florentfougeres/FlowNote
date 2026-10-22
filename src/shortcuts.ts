/**
 * The keyboard shortcuts, written once: the help (⌘/) lists every row, and
 * the app's global handler runs the actions of the rows that have keys. The
 * editor's own shortcuts (keymap.ts) are listed here for the help only.
 */

export type GlobalAction =
  | "switcher"
  | "palette"
  | "newPage"
  | "back"
  | "forward"
  | "newTab"
  | "closeTab"
  | "previousTab"
  | "nextTab"
  | "goToTab"
  | "split"
  | "git"
  | "addLink"
  | "present"
  | "find"
  | "replace"
  | "vaultSearch"
  | "raw"
  | "reading"
  | "focus"
  | "save"
  | "settings"
  | "help"
  | "sidebar";

/** A key with ⌘ (Ctrl elsewhere). `shift` and `alt` must match unless "any". */
interface Key {
  key?: string;
  code?: string;
  shift?: boolean | "any";
  alt?: boolean;
  /** Only when the editor has not handled it already (⌘K links the selection there). */
  unhandled?: boolean;
}

interface Shortcut {
  /** As shown in the help, the Mac way (keys() adapts it elsewhere). */
  keys: string;
  label: string;
  /** Global keys and what they run, tried in order. */
  run?: [Key, GlobalAction][];
}

const digits = Array.from({ length: 9 }, (_, i): [Key, GlobalAction] => [{ key: String(i + 1) }, "goToTab"]);

export const SHORTCUTS: Shortcut[] = [
  { keys: "⌘P / ⌘K", label: "Rechercher une page", run: [[{ key: "p" }, "switcher"], [{ key: "k", shift: "any", unhandled: true }, "switcher"], [{ key: "o", shift: "any" }, "switcher"]] },
  { keys: "⌘⇧P", label: "Palette de commandes (aussi « > » dans ⌘P)", run: [[{ key: "p", shift: true }, "palette"]] },
  { keys: "⌘N", label: "Nouvelle page", run: [[{ key: "n" }, "newPage"]] },
  { keys: "⌘[ / ⌘]", label: "Page précédente / suivante", run: [[{ key: "[" }, "back"], [{ key: "]" }, "forward"]] },
  { keys: "⌘T / ⌘W", label: "Nouvel onglet / fermer l'onglet", run: [[{ key: "t" }, "newTab"], [{ key: "w" }, "closeTab"]] },
  { keys: "⌘⇧[ / ⌘⇧]", label: "Onglet précédent / suivant", run: [[{ code: "BracketLeft", shift: true }, "previousTab"], [{ code: "BracketRight", shift: true }, "nextTab"]] },
  { keys: "⌘1 … ⌘9", label: "Aller à l'onglet (⌘9 : le dernier)", run: digits },
  { keys: "⌘-clic", label: "Ouvrir dans un nouvel onglet" },
  { keys: "⌥-clic", label: "Ouvrir à droite (deux pages côte à côte)" },
  { keys: "⌘⌥\\", label: "Ouvrir ou fermer le panneau de droite", run: [[{ code: "Backslash", alt: true, shift: "any" }, "split"]] },
  { keys: "⌘⇧G", label: "Panneau Git", run: [[{ key: "g", shift: true }, "git"]] },
  { keys: "⌘⇧L", label: "Ajouter un lien à lire", run: [[{ key: "l", shift: true }, "addLink"]] },
  { keys: "⌘⌥P", label: "Présenter (présentation ouverte)", run: [[{ code: "KeyP", alt: true }, "present"]] },
  { keys: "⌘F / ⌘⌥F", label: "Rechercher / remplacer dans la note", run: [[{ code: "KeyF" }, "find"], [{ code: "KeyF", alt: true }, "replace"]] },
  { keys: "⌘⇧F", label: "Rechercher dans tout le vault", run: [[{ code: "KeyF", shift: true }, "vaultSearch"]] },
  { keys: "⌘⇧E", label: "Mode Markdown brut", run: [[{ key: "e", shift: true }, "raw"]] },
  { keys: "⌘⇧R", label: "Mode lecture", run: [[{ key: "r", shift: true }, "reading"]] },
  { keys: "⌘⇧M", label: "Mode focus", run: [[{ key: "m", shift: true }, "focus"]] },
  { keys: "⌘S", label: "Enregistrer maintenant", run: [[{ key: "s", shift: "any" }, "save"]] },
  { keys: "⌘,", label: "Réglages", run: [[{ key: ",", shift: "any" }, "settings"]] },
  { keys: "⌘\\", label: "Afficher ou masquer la barre latérale", run: [[{ key: "\\", shift: "any" }, "sidebar"]] },
  { keys: "⌘/", label: "Cette aide", run: [[{ key: "/", shift: "any" }, "help"]] },
  { keys: "/", label: "Menu des blocs" },
  { keys: "[[", label: "Lier une note" },
  { keys: "⌘B / ⌘I / ⌘E", label: "Gras / italique / code" },
  { keys: "⌘K", label: "Lien sur le texte sélectionné" },
  { keys: "⌘⇧S / ⌘⇧H", label: "Barré / surligné" },
  { keys: "⌘⌥1…3 / ⌘⌥0", label: "Titre 1 à 3 / texte" },
  { keys: "Tab / ⇧Tab", label: "Indenter / désindenter une liste" },
  { keys: "⌘↵", label: "Cocher une tâche, sortir d'un bloc de code" },
  { keys: "⌥↑ / ⌥↓", label: "Déplacer le bloc (aussi ⌘⇧↑ / ⌘⇧↓)" },
  { keys: "⌘D", label: "Dupliquer le bloc" },
  { keys: "⇧↵", label: "Retour à la ligne dans un bloc" },
  { keys: "⌘Z / ⌘⇧Z", label: "Annuler / rétablir" },
];

/** The keys of an action, as the help shows them (one side of « ⌘[ / ⌘] »), for the command palette. */
export function shortcutOf(action: GlobalAction): string | undefined {
  for (const shortcut of SHORTCUTS) {
    const index = shortcut.run?.findIndex(([, a]) => a === action) ?? -1;
    if (index < 0) continue;
    const parts = shortcut.keys.split(" / ");
    return parts.length === shortcut.run!.length ? parts[index] : parts[0];
  }
  return undefined;
}

type KeyEvent = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented">;

/** The global action of a key press, or null (not a global shortcut). */
export function globalAction(event: KeyEvent): GlobalAction | null {
  if (!(event.metaKey || event.ctrlKey)) return null;
  const key = event.key.toLowerCase();
  for (const shortcut of SHORTCUTS) {
    for (const [k, action] of shortcut.run ?? []) {
      if (k.code ? event.code !== k.code : key !== k.key) continue;
      if ((k.alt ?? false) !== event.altKey) continue;
      if (k.shift !== "any" && (k.shift ?? false) !== event.shiftKey) continue;
      if (k.unhandled && event.defaultPrevented) continue;
      return action;
    }
  }
  return null;
}
