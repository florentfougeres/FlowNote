/**
 * Access to the vault folder. The browser implementation (File System Access
 * API, Chromium only) is used until the Tauri backend exists; both expose the
 * same interface.
 */

export interface VaultEntry {
  /** Path relative to the vault root, with `/` separators. */
  path: string;
  name: string;
  kind: "file" | "dir";
  children?: VaultEntry[];
}

export interface Vault {
  name: string;
  tree(): Promise<VaultEntry[]>;
  read(path: string): Promise<string>;
  /**
   * Writes `content` only if the file still contains `expected` (what was
   * loaded); otherwise the file was changed elsewhere (Obsidian, git) and the
   * write is refused.
   */
  write(path: string, content: string, expected: string): Promise<void>;
}

export class ConflictError extends Error {}

/** Folders never shown nor touched: Obsidian config, Git data, trash. */
export function isHiddenName(name: string): boolean {
  return name.startsWith(".") || name === "node_modules";
}

type DirectoryHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>;
};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}

export function browserVaultSupported(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export async function openBrowserVault(): Promise<Vault> {
  const root = (await window.showDirectoryPicker!({ mode: "readwrite" })) as DirectoryHandle;

  async function list(dir: DirectoryHandle, prefix: string): Promise<VaultEntry[]> {
    const entries: VaultEntry[] = [];
    for await (const handle of dir.values()) {
      if (isHiddenName(handle.name)) continue;
      const path = prefix ? `${prefix}/${handle.name}` : handle.name;
      if (handle.kind === "directory") {
        const children = await list(handle as DirectoryHandle, path);
        if (children.length > 0) entries.push({ path, name: handle.name, kind: "dir", children });
      } else if (handle.name.endsWith(".md")) {
        entries.push({ path, name: handle.name.slice(0, -3), kind: "file" });
      }
    }
    return entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "fr") : a.kind === "dir" ? -1 : 1));
  }

  async function fileHandle(path: string): Promise<FileSystemFileHandle> {
    const parts = path.split("/");
    let dir: FileSystemDirectoryHandle = root;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    return dir.getFileHandle(parts[parts.length - 1]);
  }

  return {
    name: root.name,
    tree: () => list(root, ""),
    read: async (path) => (await (await fileHandle(path)).getFile()).text(),
    write: async (path, content, expected) => {
      const handle = await fileHandle(path);
      const current = await (await handle.getFile()).text();
      if (current !== expected) throw new ConflictError(`${path} a été modifié en dehors de l'application.`);
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    },
  };
}

/** In-memory vault, for trying the editor without opening a folder. */
export function createMemoryVault(name: string, files: Record<string, string>): Vault {
  const contents = new Map(Object.entries(files));
  return {
    name,
    tree: async () =>
      [...contents.keys()].sort().map((path) => ({ path, name: path.replace(/\.md$/, ""), kind: "file" as const })),
    read: async (path) => contents.get(path) ?? "",
    write: async (path, content, expected) => {
      if (contents.get(path) !== expected) throw new ConflictError(`${path} a été modifié en dehors de l'application.`);
      contents.set(path, content);
    },
  };
}
