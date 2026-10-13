/**
 * Obsidian conventions for links, new notes and attachments, implemented from
 * Obsidian's documented behaviour and settings (`.obsidian/app.json`, read only).
 */

export interface ObsidianConfig {
  /** "/" (vault root, default), "./" (note folder), "./sub" (sub-folder of the note folder) or a vault folder. */
  attachmentFolderPath: string;
  /** "root" (default), "current" (note folder) or "folder" (newFileFolderPath). */
  newFileLocation: "root" | "current" | "folder";
  newFileFolderPath: string;
  /** Obsidian setting "Use [[Wikilinks]]" turned off. */
  useMarkdownLinks: boolean;
}

export const DEFAULT_CONFIG: ObsidianConfig = {
  attachmentFolderPath: "/",
  newFileLocation: "root",
  newFileFolderPath: "",
  useMarkdownLinks: false,
};

export function parseObsidianConfig(json: string): ObsidianConfig {
  try {
    const raw = JSON.parse(json) as Partial<ObsidianConfig>;
    return {
      attachmentFolderPath: typeof raw.attachmentFolderPath === "string" ? raw.attachmentFolderPath : DEFAULT_CONFIG.attachmentFolderPath,
      newFileLocation: raw.newFileLocation === "current" || raw.newFileLocation === "folder" ? raw.newFileLocation : "root",
      newFileFolderPath: typeof raw.newFileFolderPath === "string" ? raw.newFileFolderPath : "",
      useMarkdownLinks: raw.useMarkdownLinks === true,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);

export function extension(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

export function noteTitle(path: string): string {
  return basename(path).replace(/\.md$/i, "");
}

function join(folder: string, name: string): string {
  const clean = folder.replace(/^\/+|\/+$/g, "");
  return clean ? `${clean}/${name}` : name;
}

/** The part of a link target naming a file (`Note#Section|alias` -> `Note`). */
export function linkPath(target: string): string {
  return target.split(/[#^|]/)[0].trim();
}

/**
 * Resolves a link target to a vault file like Obsidian: exact path, then a file
 * with that name in the linking note's folder, then the shortest path among
 * files with that name. Targets without extension designate notes.
 */
export function resolveLink(target: string, files: string[], fromPath = ""): string | null {
  const wanted = linkPath(target).replace(/^\/+/, "");
  if (!wanted) return null;
  const candidates = extension(wanted) ? [wanted] : [`${wanted}.md`, wanted];
  for (const candidate of candidates) {
    if (files.includes(candidate)) return candidate;
    const local = join(dirname(fromPath), candidate);
    if (files.includes(local)) return local;
    const suffix = `/${candidate}`;
    const matches = files.filter((f) => f.endsWith(suffix));
    if (matches.length > 0) return matches.sort((a, b) => a.length - b.length)[0];
  }
  return null;
}

/** Shortest link text that Obsidian resolves to `path` ("shortest path when possible"). */
export function linkTextFor(path: string, files: string[]): string {
  const isNote = /\.md$/i.test(path);
  const name = isNote ? noteTitle(path) : basename(path);
  const sameName = files.filter((f) => basename(f) === basename(path));
  if (sameName.length <= 1) return name;
  return isNote ? path.replace(/\.md$/i, "") : path;
}

/** Folder receiving new attachments for the note at `notePath`. */
export function attachmentFolder(notePath: string, config: ObsidianConfig): string {
  const setting = config.attachmentFolderPath.trim();
  if (setting === "" || setting === "/") return "";
  if (setting === "./" || setting === ".") return dirname(notePath);
  if (setting.startsWith("./")) return join(dirname(notePath), setting.slice(2));
  return setting.replace(/^\/+|\/+$/g, "");
}

/** Folder receiving a new note created from the note at `notePath`. */
export function newNoteFolder(notePath: string, config: ObsidianConfig): string {
  if (config.newFileLocation === "current") return dirname(notePath);
  if (config.newFileLocation === "folder") return config.newFileFolderPath.replace(/^\/+|\/+$/g, "");
  return "";
}

/** Sub-pages live in a folder named after their parent note (folder-note convention). */
export function subpageFolder(parentPath: string): string {
  return join(dirname(parentPath), noteTitle(parentPath));
}

/** Characters Obsidian refuses in file names. */
export function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
}

/** `folder/name.ext`, suffixed with " 1", " 2"... when the path is taken. */
export function uniquePath(folder: string, name: string, files: string[]): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const taken = new Set(files.map((f) => f.toLowerCase()));
  let candidate = join(folder, name);
  for (let i = 1; taken.has(candidate.toLowerCase()); i++) candidate = join(folder, `${stem} ${i}${ext}`);
  return candidate;
}

/** Name Obsidian gives to pasted images: "Pasted image 20261013191500.png". */
export function pastedImageName(date: Date, ext: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `Pasted image ${stamp}.${ext}`;
}

/** Relative path from the folder of `fromPath` to `toPath`, for Markdown links. */
export function relativePath(fromPath: string, toPath: string): string {
  const from = dirname(fromPath).split("/").filter(Boolean);
  const to = toPath.split("/");
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  return [...from.slice(common).map(() => ".."), ...to.slice(common)].join("/");
}
