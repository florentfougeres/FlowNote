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

/** Bytes of a vault file: Tauri sends them raw (no JSON), the other hosts as base64. */
export async function backendBytes(args: Record<string, unknown>): Promise<Uint8Array> {
  if (isTauri()) return new Uint8Array(await invoke<ArrayBuffer>("vault_read_binary", args));
  return Uint8Array.from(atob(await backend<string>("vault_read_binary", args)), (c) => c.charCodeAt(0));
}

/** A command of the shared backend. Errors come back as rejected promises (their message). */
export function backend<T = void>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isTauri()) return invoke<T>("backend", { command, args });
  return Promise.reject(new Error(`${command} : pas de backend dans le navigateur`));
}
