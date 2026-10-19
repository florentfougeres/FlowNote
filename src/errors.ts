import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./vault/tauriVault";
import { callNative, isNative } from "./vault/nativeVault";

/** Sends an error to the console and, in the desktop app, to the terminal running it. */
export function reportError(error: unknown) {
  const text = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  console.error(error);
  if (isTauri()) void invoke("log_frontend", { message: text }).catch(() => {});
  else if (isNative()) void callNative("log_frontend", { message: text }).catch(() => {});
}

export function installErrorReporting() {
  window.addEventListener("error", (event) => reportError(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => reportError(event.reason));
}
