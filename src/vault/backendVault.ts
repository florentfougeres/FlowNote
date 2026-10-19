import { backend, backendBytes } from "../platform";
import { backendGit } from "./git";
import { ConflictError, encodeText, type Vault, type VaultEntry } from "./vault";

/**
 * A vault served by the backend (src-tauri/core). `root` is its folder, sent
 * with every command (Tauri); null when the host adds it itself, so that the
 * page never names a folder (the native shell).
 */
export function backendVault(name: string, root: string | null, git: boolean): Vault {
  const at = root === null ? {} : { root };
  return {
    name,
    git: git ? backendGit(root) : undefined,
    tree: () => backend<VaultEntry[]>("vault_tree", at),
    read: (path) => backend<string>("vault_read", { ...at, path }),
    write: async (path, content, expected) => {
      try {
        await backend("vault_write", { ...at, path, content, expected });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith("CONFLICT:")) throw new ConflictError(message.slice("CONFLICT:".length));
        throw new Error(message);
      }
    },
    files: () => backend<string[]>("vault_files", at),
    readBinary: (path) => backendBytes({ ...at, path }),
    create: (path, content) => backend("vault_create", { ...at, path, content: Array.from(typeof content === "string" ? encodeText(content) : content) }),
    createFolder: (path) => backend("vault_create_dir", { ...at, path }),
    reveal: (path) => backend("vault_reveal", { ...at, path }),
    obsidianConfig: () => backend<string>("vault_config", at),
    rename: (from, to) => backend("vault_rename", { ...at, from, to }),
    remove: (path) => backend("vault_trash", { ...at, path }),
    search: (query, caseSensitive, limit) => backend("vault_search", { ...at, query, caseSensitive, limit }),
    readNotes: () => backend<[string, string][]>("vault_read_notes", at),
    stats: () => backend<{ path: string; ctime: number; mtime: number }[]>("vault_stats", at),
    bookmarks: () => backend<string>("vault_bookmarks", at),
  };
}
