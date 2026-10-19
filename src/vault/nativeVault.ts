import { isUntracked, MergeConflictError, type ConflictVersions, type GitApi, type GitCommit, type GitStatus } from "./git";
import { ConflictError, encodeText, type Vault, type VaultEntry } from "./vault";

/**
 * The vault of the native macOS shell (native/): FlowNote's pages shown in a
 * WKWebView, the files served by Swift. The shell owns the vault folder: the
 * page only sends vault-relative paths, checked on the Swift side.
 */

interface NativeHandler {
  postMessage(message: unknown): Promise<unknown>;
}

declare global {
  interface Window {
    webkit?: { messageHandlers?: { flownote?: NativeHandler } };
  }
}

export function isNative(): boolean {
  return typeof window !== "undefined" && Boolean(window.webkit?.messageHandlers?.flownote);
}

/** Calls a command of the shell; its errors come back as rejected promises. */
export function callNative<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const handler = window.webkit?.messageHandlers?.flownote;
  if (!handler) return Promise.reject(new Error("FlowNote natif indisponible"));
  return handler.postMessage({ command, args }) as Promise<T>;
}

export const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export function nativeVault(name: string, git: boolean): Vault {
  return {
    name,
    git: git ? nativeGit() : undefined,
    tree: () => callNative<VaultEntry[]>("vault_tree"),
    read: (path) => callNative<string>("vault_read", { path }),
    write: async (path, content, expected) => {
      try {
        await callNative("vault_write", { path, content, expected });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith("CONFLICT:")) throw new ConflictError(message.slice("CONFLICT:".length));
        throw new Error(message);
      }
    },
    files: () => callNative<string[]>("vault_files"),
    readBinary: async (path) => fromBase64(await callNative<string>("vault_read_binary", { path })),
    create: (path, content) => callNative("vault_create", { path, base64: toBase64(typeof content === "string" ? encodeText(content) : content) }),
    createFolder: (path) => callNative("vault_create_dir", { path }),
    reveal: (path) => callNative("vault_reveal", { path }),
    obsidianConfig: () => callNative<string>("vault_config"),
    rename: (from, to) => callNative("vault_rename", { from, to }),
    remove: (path) => callNative("vault_trash", { path }),
    search: (query, caseSensitive, limit) => callNative("vault_search", { query, caseSensitive, limit }),
    readNotes: () => callNative<[string, string][]>("vault_read_notes"),
    stats: () => callNative<{ path: string; ctime: number; mtime: number }[]>("vault_stats"),
    bookmarks: () => callNative<string>("vault_bookmarks"),
  };
}

/** Git through the shell's Swift port of git.rs (same commands and arguments as Tauri's). */
function nativeGit(): GitApi {
  return {
    status: () => callNative<GitStatus>("git_status"),
    diff: (file, staged) => callNative<string>("git_diff", { path: file.path, staged, untracked: isUntracked(file) }),
    stage: (paths) => callNative("git_stage", { paths }),
    unstage: (paths) => callNative("git_unstage", { paths }),
    discard: (paths) => callNative("git_discard", { paths }),
    activity: (days) => callNative<[string, number][]>("git_activity", { days }),
    lastCommit: () => callNative<GitCommit | null>("git_last_commit"),
    commit: (message) => callNative<string>("git_commit", { message }),
    fetch: () => callNative("git_fetch"),
    pull: async () => {
      try {
        return await callNative<string>("git_pull");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith("CONFLICT:")) throw new MergeConflictError(message.slice("CONFLICT:".length));
        throw new Error(message);
      }
    },
    push: () => callNative<string>("git_push"),
    log: (path) => callNative<GitCommit[]>("git_log", { path, limit: 200 }),
    show: (hash, path) => callNative<string>("git_show", { hash, path }),
    conflict: (path) => callNative<ConflictVersions>("git_conflict", { path }),
    resolve: (path, content) => callNative("git_resolve", { path, content }),
    continueMerge: () => callNative<string>("git_merge_continue"),
    abortMerge: () => callNative("git_merge_abort"),
  };
}
