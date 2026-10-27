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
  /** Emoji of the note's `icon` property. */
  icon?: string;
  /** The page's own title (first `# heading` of a note, `title` property otherwise), shown in place of the name on request. */
  title?: string;
  /** The note is a presentation (front matter with `marp: true`). */
  presentation?: boolean;
}

export interface Vault {
  name: string;
  /** Present when the vault is a Git repository manageable by the app. */
  git?: GitApi;
  tree(): Promise<VaultEntry[]>;
  read(path: string): Promise<string>;
  /**
   * Writes `content` only if the file still contains `expected` (what was
   * loaded); otherwise the file was changed elsewhere (Obsidian, git) and the
   * write is refused.
   */
  write(path: string, content: string, expected: string): Promise<void>;
  /** Every non-hidden file (notes and attachments), as vault-relative paths. */
  files(): Promise<string[]>;
  readBinary(path: string): Promise<Uint8Array>;
  /** Creates a new file; fails if the path already exists. */
  create(path: string, content: string | Uint8Array): Promise<void>;
  /** Creates an empty folder; fails if the path already exists. */
  createFolder(path: string): Promise<void>;
  /** Content of `.obsidian/app.json` (read only), "{}" when absent. */
  obsidianConfig(): Promise<string>;
  /** Renames a note or a folder; fails if the target exists. */
  rename(from: string, to: string): Promise<void>;
  /** Removes a note or a folder (to the system trash in the desktop app). */
  remove(path: string): Promise<void>;
  /** Every note with its content in one call (dashboard statistics); otherwise read one by one. */
  readNotes?(): Promise<[string, string][]>;
  /** Creation and modification times of the pages (notes, bases, canvases; ms), when the vault knows them. */
  stats?(): Promise<{ path: string; ctime: number; mtime: number }[]>;
  /** Obsidian's bookmarks (.obsidian/bookmarks.json, read only), "{}" when absent. */
  bookmarks?(): Promise<string>;
  /** Obsidian's templates settings (.obsidian/templates.json, read only), "{}" when absent. */
  templatesConfig?(): Promise<string>;
  /** The TaskNotes plugin's settings (`.obsidian/plugins/tasknotes/data.json`), read only; "{}" when absent. */
  tasksConfig?(): Promise<string>;
  /** Shows a note or folder in the Finder (desktop app only). */
  reveal?(path: string): Promise<void>;
  /** Fast full-text search done by the backend; otherwise notes are read one by one. */
  search?(query: string, caseSensitive: boolean, limit: number): Promise<{ path: string; lines: [number, string][] }[]>;
}

export const encodeText = (text: string) => new TextEncoder().encode(text);

export class ConflictError extends Error {}

import { memoryGit, type GitApi } from "./git";
import { noteIcon, pageTitle } from "./icon";
import { isDrawingPath } from "../drawing/format";
import { isMindmapPath } from "../mindmap/format";
import { isPresentationMarkdown } from "../presentation/format";

/** What the tree shows of a note besides its name, read from its beginning. */
function noteMeta(head: string, path: string): Pick<VaultEntry, "icon" | "presentation" | "title"> {
  const icon = noteIcon(head);
  const presentation = isPresentationMarkdown(head);
  const title = pageTitle(head, !presentation && !isDrawingPath(path) && !isMindmapPath(path));
  return { ...(presentation ? { presentation: true } : {}), ...(icon ? { icon } : {}), ...(title ? { title } : {}) };
}

/** Folders never shown nor touched: Obsidian config, Git data, trash. */
function isHiddenName(name: string): boolean {
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
        // An empty folder is shown (just created); one holding only attachments is not.
        if (children.length > 0 || (await isEmptyDir(handle as DirectoryHandle))) entries.push({ path, name: handle.name, kind: "dir", children });
      } else if (handle.name.endsWith(".base") || handle.name.endsWith(".canvas")) {
        entries.push({ path, name: handle.name.replace(/\.(base|canvas)$/, ""), kind: "file" });
      } else if (handle.name.endsWith(".md")) {
        // Only the beginning is read to recognise presentations and icons.
        const head = await (await (handle as FileSystemFileHandle).getFile()).slice(0, 4096).text();
        entries.push({ path, name: handle.name.slice(0, -3), kind: "file", ...noteMeta(head, path) });
      }
    }
    return entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "fr") : a.kind === "dir" ? -1 : 1));
  }

  async function isEmptyDir(dir: DirectoryHandle): Promise<boolean> {
    for await (const handle of dir.values()) if (!isHiddenName(handle.name)) return false;
    return true;
  }

  async function dirHandle(path: string, create = false): Promise<FileSystemDirectoryHandle> {
    let dir: FileSystemDirectoryHandle = root;
    for (const part of path.split("/")) dir = await dir.getDirectoryHandle(part, { create });
    return dir;
  }

  async function fileHandle(path: string, create = false): Promise<FileSystemFileHandle> {
    const parts = path.split("/");
    let dir: FileSystemDirectoryHandle = root;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create });
    return dir.getFileHandle(parts[parts.length - 1], { create });
  }

  async function removeEntry(path: string) {
    const parts = path.split("/");
    let dir: FileSystemDirectoryHandle = root;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    await dir.removeEntry(parts[parts.length - 1], { recursive: true });
  }

  async function allFiles(dir: DirectoryHandle, prefix: string, out: string[]) {
    for await (const handle of dir.values()) {
      if (isHiddenName(handle.name)) continue;
      const path = prefix ? `${prefix}/${handle.name}` : handle.name;
      if (handle.kind === "directory") await allFiles(handle as DirectoryHandle, path, out);
      else out.push(path);
    }
    return out;
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
    files: async () => (await allFiles(root, "", [])).sort(),
    readBinary: async (path) => new Uint8Array(await (await (await fileHandle(path)).getFile()).arrayBuffer()),
    create: async (path, content) => {
      const exists = await fileHandle(path).then(
        () => true,
        () => false,
      );
      if (exists) throw new Error(`${path} existe déjà.`);
      const writable = await (await fileHandle(path, true)).createWritable();
      await writable.write(typeof content === "string" ? content : new Blob([content as BlobPart]));
      await writable.close();
    },
    createFolder: async (path) => {
      const exists = await dirHandle(path).then(
        () => true,
        () => fileHandle(path).then(
          () => true,
          () => false,
        ),
      );
      if (exists) throw new Error(`${path} existe déjà.`);
      await dirHandle(path, true);
    },
    rename: async (from, to) => {
      const source = await fileHandle(from).catch(() => null);
      if (!source) throw new Error("Le renommage de dossiers n'est disponible que dans l'application de bureau.");
      if (await fileHandle(to).then(() => true, () => false)) throw new Error(`${to} existe déjà.`);
      const bytes = new Uint8Array(await (await source.getFile()).arrayBuffer());
      const writable = await (await fileHandle(to, true)).createWritable();
      await writable.write(new Blob([bytes as BlobPart]));
      await writable.close();
      await removeEntry(from);
    },
    remove: (path) => removeEntry(path),
    obsidianConfig: async () => {
      try {
        const dir = await root.getDirectoryHandle(".obsidian");
        return await (await (await dir.getFileHandle("app.json")).getFile()).text();
      } catch {
        return "{}";
      }
    },
  };
}

/** In-memory vault, for trying the editor without opening a folder. */
/** `remote`: content of the simulated remote branch, merged by "pull" (demo of conflicts). */
export function createMemoryVault(name: string, files: Record<string, string | Uint8Array>, remote: Record<string, string> = {}): Vault {
  const contents = new Map<string, string | Uint8Array>(Object.entries(files));
  /** Folders created empty (a folder exists otherwise through its files). */
  const folders = new Set<string>();
  const inside = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);
  /** Under a hidden folder (".obsidian"): Obsidian's configuration, never listed. */
  const hidden = (path: string) => path.split("/").some(isHiddenName);
  const text = (path: string) => {
    const value = contents.get(path) ?? "";
    return typeof value === "string" ? value : new TextDecoder().decode(value);
  };
  /** Modification times: the opening of the vault until a file is written. */
  const opened = Date.now();
  const times = new Map<string, number>();
  return {
    name,
    git: memoryGit(contents, remote),
    tree: async () => {
      const notes = [...contents.keys()].filter((p) => !hidden(p) && (p.endsWith(".md") || p.endsWith(".base") || p.endsWith(".canvas")));
      const text = (v: string | Uint8Array | undefined) => (typeof v === "string" ? v : v ? new TextDecoder().decode(v) : "");
      return buildTree(notes, (p) => (p.endsWith(".md") ? noteMeta(text(contents.get(p)), p) : {}), [...folders]);
    },
    readNotes: async () => [...contents.entries()].filter(([p]) => !hidden(p) && p.endsWith(".md")).map(([p, v]): [string, string] => [p, typeof v === "string" ? v : new TextDecoder().decode(v)]),
    read: async (path) => text(path),
    write: async (path, content, expected) => {
      if (text(path) !== expected) throw new ConflictError(`${path} a été modifié en dehors de l'application.`);
      contents.set(path, content);
      times.set(path, Date.now());
    },
    stats: async () => [...contents.keys()].filter((p) => !hidden(p) && /\.(?:md|base|canvas)$/.test(p)).map((path) => ({ path, ctime: opened, mtime: times.get(path) ?? opened })),
    files: async () => [...contents.keys()].filter((p) => !hidden(p)).sort(),
    readBinary: async (path) => {
      const value = contents.get(path);
      return typeof value === "string" ? encodeText(value) : (value ?? new Uint8Array());
    },
    create: async (path, content) => {
      if (contents.has(path)) throw new Error(`${path} existe déjà.`);
      contents.set(path, content);
      times.set(path, Date.now());
    },
    createFolder: async (path) => {
      if ([...contents.keys(), ...folders].some((k) => inside(k, path))) throw new Error(`${path} existe déjà.`);
      folders.add(path);
    },
    obsidianConfig: async () => text(".obsidian/app.json") || "{}",
    bookmarks: async () => text(".obsidian/bookmarks.json") || "{}",
    templatesConfig: async () => text(".obsidian/templates.json") || "{}",
    tasksConfig: async () => text(".obsidian/plugins/tasknotes/data.json") || "{}",
    rename: async (from, to) => {
      const moved = [...contents.keys()].filter((k) => inside(k, from));
      const movedFolders = [...folders].filter((f) => inside(f, from));
      if (moved.length === 0 && movedFolders.length === 0) throw new Error(`${from} n'existe pas.`);
      // Case-insensitive like macOS, except to change only the case.
      const taken = (k: string) => inside(k.toLowerCase(), to.toLowerCase()) && !inside(k, from);
      if ([...contents.keys(), ...folders].some(taken)) throw new Error(`${to} existe déjà.`);
      for (const key of moved) {
        contents.set(to + key.slice(from.length), contents.get(key)!);
        contents.delete(key);
        const time = times.get(key);
        if (time !== undefined) times.set(to + key.slice(from.length), time);
        times.delete(key);
      }
      for (const folder of movedFolders) {
        folders.delete(folder);
        folders.add(to + folder.slice(from.length));
      }
    },
    remove: async (path) => {
      // Deleting entries while iterating a Map is well defined.
      for (const key of contents.keys()) if (inside(key, path)) contents.delete(key);
      for (const folder of folders) if (inside(folder, path)) folders.delete(folder);
    },
  };
}

/** Builds the sidebar tree from a flat list of note paths, plus `folders` shown even when empty. */
function buildTree(paths: string[], metaOf: (path: string) => Pick<VaultEntry, "icon" | "presentation" | "title"> = () => ({}), folders: string[] = []): VaultEntry[] {
  const root: VaultEntry[] = [];
  // A folder is walked like the path of a note inside it, without the note.
  for (const path of [...paths, ...folders.map((f) => `${f}/`)]) {
    const parts = path.split("/");
    let level = root;
    parts.forEach((part, i) => {
      const sub = parts.slice(0, i + 1).join("/");
      if (i === parts.length - 1) {
        if (part === "") return;
        level.push({ path: sub, name: part.replace(/\.(md|base|canvas)$/, ""), kind: "file", ...metaOf(sub) });
        return;
      }
      let dir = level.find((e) => e.kind === "dir" && e.path === sub);
      if (!dir) {
        dir = { path: sub, name: part, kind: "dir", children: [] };
        level.push(dir);
      }
      level = dir.children!;
    });
  }
  const sort = (entries: VaultEntry[]): VaultEntry[] =>
    entries
      .map((e) => (e.children ? { ...e, children: sort(e.children) } : e))
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "fr") : a.kind === "dir" ? -1 : 1));
  return sort(root);
}

/** The text of every note of the vault (in one call when the vault supports it). */
export async function readAllNotes(vault: Vault, files: string[]): Promise<[string, string][]> {
  if (vault.readNotes) return vault.readNotes();
  return Promise.all(files.filter((f) => f.endsWith(".md")).map(async (f): Promise<[string, string]> => [f, await vault.read(f).catch(() => "")]));
}
