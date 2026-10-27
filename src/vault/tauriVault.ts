import { invoke } from "@tauri-apps/api/core";
import { backend } from "../platform";
import { backendGit } from "./git";
import { ConflictError, encodeText, type Vault, type VaultEntry } from "./vault";

const LAST_VAULT_KEY = "flownote:last-vault";
const RECENT_VAULTS_KEY = "flownote:recent-vaults";

export { isTauri } from "../platform";

/** A vault folder served by the backend (src-tauri/core), which receives `root` with every command. */
function tauriVault(root: string): Vault {
  return {
    name: root.split("/").filter(Boolean).pop() ?? root,
    git: backendGit(root),
    tree: () => backend<VaultEntry[]>("vault_tree", { root }),
    read: (path) => backend<string>("vault_read", { root, path }),
    write: async (path, content, expected) => {
      try {
        await backend("vault_write", { root, path, content, expected });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith("CONFLICT:")) throw new ConflictError(message.slice("CONFLICT:".length));
        throw new Error(message);
      }
    },
    files: () => backend<string[]>("vault_files", { root }),
    // Bytes come raw from their own Tauri command, without JSON.
    readBinary: async (path) => new Uint8Array(await invoke<ArrayBuffer>("vault_read_binary", { root, path })),
    create: (path, content) => backend("vault_create", { root, path, content: Array.from(typeof content === "string" ? encodeText(content) : content) }),
    createFolder: (path) => backend("vault_create_dir", { root, path }),
    reveal: (path) => backend("vault_reveal", { root, path }),
    obsidianConfig: () => backend<string>("vault_config", { root }),
    rename: (from, to) => backend("vault_rename", { root, from, to }),
    remove: (path) => backend("vault_trash", { root, path }),
    search: (query, caseSensitive, limit) => backend("vault_search", { root, query, caseSensitive, limit }),
    readNotes: () => backend<[string, string][]>("vault_read_notes", { root }),
    stats: () => backend<{ path: string; ctime: number; mtime: number }[]>("vault_stats", { root }),
    bookmarks: () => backend<string>("vault_bookmarks", { root }),
    templatesConfig: () => backend<string>("vault_templates_config", { root }),
    tasksConfig: () => backend<string>("vault_tasknotes_config", { root }),
  };
}

/** Asks for a vault folder; resolves to null if the dialog is cancelled. */
export async function pickTauriVault(): Promise<Vault | null> {
  // Picked by the app's backend, which then trusts the folder (a new vault has no .obsidian yet).
  const root = await invoke<string | null>("vault_pick");
  if (!root) return null;
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

/** Folder of the vault opened last (the open one). */
export function currentTauriVault(): string | null {
  try {
    return localStorage.getItem(LAST_VAULT_KEY);
  } catch {
    return null;
  }
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
