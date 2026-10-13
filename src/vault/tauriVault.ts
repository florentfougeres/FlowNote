import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ConflictError, type Vault, type VaultEntry } from "./vault";

const LAST_VAULT_KEY = "mon-notion:last-vault";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function tauriVault(root: string): Vault {
  return {
    name: root.split("/").filter(Boolean).pop() ?? root,
    tree: () => invoke<VaultEntry[]>("vault_tree", { root }),
    read: (path) => invoke<string>("vault_read", { root, path }),
    write: async (path, content, expected) => {
      try {
        await invoke("vault_write", { root, path, content, expected });
      } catch (error) {
        const message = String(error);
        if (message.startsWith("CONFLICT:")) throw new ConflictError(message.slice("CONFLICT:".length));
        throw new Error(message);
      }
    },
  };
}

/** Asks for a vault folder; resolves to null if the dialog is cancelled. */
export async function pickTauriVault(): Promise<Vault | null> {
  const root = await open({ directory: true, multiple: false, title: "Choisir un vault Obsidian" });
  if (typeof root !== "string") return null;
  localStorage.setItem(LAST_VAULT_KEY, root);
  return tauriVault(root);
}

export function lastTauriVault(): Vault | null {
  const root = localStorage.getItem(LAST_VAULT_KEY);
  return root ? tauriVault(root) : null;
}
