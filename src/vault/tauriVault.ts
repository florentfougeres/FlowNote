import { invoke } from "@tauri-apps/api/core";
import type { Vault } from "./vault";
import { backendVault } from "./backendVault";

const LAST_VAULT_KEY = "flownote:last-vault";
const RECENT_VAULTS_KEY = "flownote:recent-vaults";

export { isTauri } from "../platform";

export function tauriVault(root: string): Vault {
  return backendVault(root.split("/").filter(Boolean).pop() ?? root, root, true);
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
