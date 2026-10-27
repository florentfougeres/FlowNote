import { invoke } from "@tauri-apps/api/core";

/**
 * Where the app runs, and its one way to the backend (src-tauri/core): the
 * files, Git, Grammalecte and the web requests. Command names and arguments
 * are those of `backend::dispatch` in Rust (src-tauri/core/src/backend.rs);
 * platform.test.ts checks that every command called here exists there.
 */

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** A command of the shared backend. Errors come back as rejected promises (their message). */
export function backend<T = void>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isTauri()) return invoke<T>("backend", { command, args });
  return Promise.reject(new Error(`${command} : pas de backend dans le navigateur`));
}

/**
 * The clipboard's text, read on demand (a menu item, a key handled by the
 * app): through Tauri's clipboard plugin in the app, where WebKit would ask
 * before each read; through the browser's API elsewhere.
 */
export async function readClipboardText(): Promise<string> {
  if (isTauri()) {
    const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
    return readText();
  }
  return navigator.clipboard.readText();
}

/** Text put on the clipboard outside a copy event (cards of a canvas), the same way. */
export async function writeClipboardText(text: string): Promise<void> {
  if (isTauri()) {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    return writeText(text);
  }
  return navigator.clipboard.writeText(text);
}
