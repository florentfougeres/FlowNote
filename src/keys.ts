/** macOS (and iOS): shortcuts are shown with ⌘ ⌥ ⇧; elsewhere Ctrl, Alt, Shift. */
const IS_MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || globalThis.navigator?.userAgent || "");

/**
 * Shortcut text for this platform. Labels are written the Mac way
 * ("Fermer (⌘⇧G)"); on Linux and Windows this gives "Fermer (Ctrl+Shift+G)".
 * The handlers already accept Ctrl wherever ⌘ is used.
 */
export function keys(text: string, mac = IS_MAC): string {
  if (mac) return text;
  return text
    .replace(/⌘-/g, "Ctrl-")
    .replace(/⌘/g, "Ctrl+")
    .replace(/⌥/g, "Alt+")
    .replace(/⇧/g, "Shift+");
}
