import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ConflictError, encodeText, type Vault, type VaultEntry } from "./vault";
import { tauriGit } from "./git";

const LAST_VAULT_KEY = "flownote:last-vault";
const RECENT_VAULTS_KEY = "flownote:recent-vaults";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function tauriVault(root: string): Vault {
  return {
    name: root.split("/").filter(Boolean).pop() ?? root,
    git: tauriGit(root),
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
    files: () => invoke<string[]>("vault_files", { root }),
    readBinary: async (path) => new Uint8Array(await invoke<ArrayBuffer>("vault_read_binary", { root, path })),
    create: (path, content) =>
      invoke("vault_create", { root, path, content: Array.from(typeof content === "string" ? encodeText(content) : content) }),
    createFolder: (path) => invoke("vault_create_dir", { root, path }),
    obsidianConfig: () => invoke<string>("vault_config", { root }),
    rename: (from, to) => invoke("vault_rename", { root, from, to }),
    remove: (path) => invoke("vault_trash", { root, path }),
    search: (query, caseSensitive, limit) => invoke("vault_search", { root, query, caseSensitive, limit }),
    readNotes: () => invoke<[string, string][]>("vault_read_notes", { root }),
    stats: () => invoke<{ path: string; ctime: number; mtime: number }[]>("vault_stats", { root }),
    bookmarks: () => invoke<string>("vault_bookmarks", { root }),
  };
}

/** Asks for a vault folder; resolves to null if the dialog is cancelled. */
export async function pickTauriVault(): Promise<Vault | null> {
  const root = await open({ directory: true, multiple: false, title: "Choisir un vault Obsidian" });
  if (typeof root !== "string") return null;
  return openTauriVault(root);
}

/** Opens a vault folder and remembers it (last opened, recent list). */
export function openTauriVault(root: string): Vault {
  try {
    localStorage.setItem(LAST_VAULT_KEY, root);
    localStorage.setItem(RECENT_VAULTS_KEY, JSON.stringify([root, ...recentTauriVaults().filter((r) => r !== root)].slice(0, 6)));
  } catch {
    // not remembered
  }
  return tauriVault(root);
}

/** Folders of the vaults opened recently, most recent first. */
export function recentTauriVaults(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_VAULTS_KEY) ?? "[]") as unknown;
    const recent = Array.isArray(list) ? list.filter((r): r is string => typeof r === "string") : [];
    // Vaults opened before the recent list existed.
    const last = localStorage.getItem(LAST_VAULT_KEY);
    return last && !recent.includes(last) ? [last, ...recent] : recent;
  } catch {
    return [];
  }
}

export function forgetTauriVault(root: string) {
  try {
    localStorage.setItem(RECENT_VAULTS_KEY, JSON.stringify(recentTauriVaults().filter((r) => r !== root)));
    if (localStorage.getItem(LAST_VAULT_KEY) === root) localStorage.removeItem(LAST_VAULT_KEY);
  } catch {
    // nothing remembered
  }
}

export function lastTauriVault(): Vault | null {
  const root = localStorage.getItem(LAST_VAULT_KEY);
  return root ? tauriVault(root) : null;
}
