import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { KernelEvent, KernelTransport } from "./runtime";

/** The notebook's kernel in the desktop app (see src-tauri/src/notebook.rs). */
export function tauriKernel(vault: string, notebook: string): KernelTransport {
  return {
    start: (deps) => invoke("kernel_start", { vault, notebook, deps }),
    send: (message) => invoke("kernel_send", { notebook, message }),
    interrupt: () => invoke("kernel_interrupt", { notebook }),
    stop: () => invoke("kernel_stop", { notebook }),
    listen: (onEvent) => {
      let stop: (() => void) | null = null;
      let cancelled = false;
      void listen<{ notebook: string; event: KernelEvent }>("notebook-kernel", (message) => {
        if (message.payload.notebook === notebook) onEvent(message.payload.event);
      }).then((unlisten) => (cancelled ? unlisten() : (stop = unlisten)));
      return () => {
        cancelled = true;
        stop?.();
      };
    },
  };
}

export const envStatus = (vault: string) => invoke<{ pyproject: boolean; venv: boolean }>("notebook_env_status", { vault });
export const envInit = (vault: string) => invoke("notebook_env_init", { vault });
export const envAdd = (vault: string, pkg: string) => invoke<string>("notebook_env_add", { vault, package: pkg });
export const openInMarimo = (vault: string, notebook: string) => invoke("notebook_open_marimo", { vault, notebook });
