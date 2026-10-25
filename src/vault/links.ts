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

/** File name without ".md": what links and sub-page folders are named after ("Schéma.excalidraw" for a drawing). */
const fileStem = (path: string) => basename(path).replace(/\.md$/i, "");

/** Title shown for a page: file name without ".md" (drawings and mind maps: without ".excalidraw.md", ".mindmap.md"). */
export function noteTitle(path: string): string {
  return basename(path).replace(/\.(?:excalidraw|mindmap|dashboard)\.md$/i, "").replace(/\.(?:md|base|canvas)$/i, "");
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
  // "Schéma.excalidraw" names a drawing note, Schéma.excalidraw.md (as in Obsidian).
  const candidates = /\.md$/i.test(wanted) ? [wanted] : extension(wanted) ? [wanted, `${wanted}.md`] : [`${wanted}.md`, wanted];
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
  const name = isNote ? fileStem(path) : basename(path);
  const sameName = files.filter((f) => basename(f) === basename(path));
  if (sameName.length <= 1) return name;
  return isNote ? path.replace(/\.md$/i, "") : path;
}

/**
 * Folder receiving new attachments for the note at `notePath`. Obsidian's
 * default (the vault root) would pile every image there: FlowNote uses an
 * `attachments` folder next to the note instead.
 */
export function attachmentFolder(notePath: string, config: ObsidianConfig): string {
  const setting = config.attachmentFolderPath.trim();
  if (setting === "" || setting === "/") return join(dirname(notePath), "attachments");
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
  // A base's rows live in the folder named after it ("Projets.base" → "Projets/").
  return join(dirname(parentPath), basename(parentPath).replace(/\.(md|base)$/i, ""));
}

/** Characters Obsidian refuses in file names. */
export function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
}

/** `folder/name.ext`, suffixed with " 1", " 2"... when the path is taken (before `.excalidraw.md` or `.mindmap.md` as a whole). */
export function uniquePath(folder: string, name: string, files: string[]): string {
  const compound = /\.(excalidraw|mindmap|dashboard)\.md$/i.exec(name);
  const dot = compound ? compound.index : name.lastIndexOf(".");
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

const WIKILINK = /(!?)\[\[([^[\]\n|#^]*)([#^][^[\]\n|]*)?(\|[^[\]\n]*)?\]\]/g;
const MARKDOWN_LINK = /(!?\[[^\]\n]*\]\()([^)\s]+)((?:\s+"[^"\n]*")?\))/g;

function decode(href: string): string {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}

/** Joins a note folder and a relative path, resolving "." and "..". */
function resolveRelative(folder: string, href: string): string {
  const parts: string[] = [];
  for (const part of `${folder}/${href}`.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export interface LinkRewrite {
  /** Path of the note before and after the rename (it moves when its folder is renamed). */
  oldNotePath: string;
  newNotePath: string;
  filesBefore: string[];
  filesAfter: string[];
  /** Old path -> new path, for every moved file. */
  renames: Map<string, string>;
}

/**
 * Updates the links of one note after files were renamed, like Obsidian's
 * "Automatically update internal links". Wikilinks keep their #section and
 * |alias; relative Markdown links are recomputed. Code blocks and code spans
 * are left alone. Returns null when nothing changed.
 */
export function rewriteLinks(content: string, change: LinkRewrite): string | null {
  const { oldNotePath, newNotePath, filesBefore, filesAfter, renames } = change;
  let inFence: string | null = null;
  let changed = false;

  const rewriteLine = (line: string) => {
    // Keep code spans intact by splitting them out.
    return line
      .split(/(`+[^`]*`+)/)
      .map((piece, i) => {
        if (i % 2 === 1) return piece;
        let out = piece.replace(WIKILINK, (whole, bang: string, target: string, section = "", alias = "") => {
          const resolved = resolveLink(target, filesBefore, oldNotePath);
          const moved = resolved && renames.get(resolved);
          if (!moved) return whole;
          const next = `${bang}[[${linkTextFor(moved, filesAfter)}${section}${alias}]]`;
          if (next !== whole) changed = true;
          return next;
        });
        out = out.replace(MARKDOWN_LINK, (whole, open: string, href: string, close: string) => {
          if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) return whole;
          const [pathPart, fragment = ""] = href.split(/(?=#)/);
          const before = resolveRelative(dirname(oldNotePath), decode(pathPart));
          const target = renames.get(before) ?? (filesBefore.includes(before) ? before : null);
          if (!target || (target === before && oldNotePath === newNotePath)) return whole;
          const next = encodeURI(relativePath(newNotePath, target)) + fragment;
          if (next === href) return whole;
          changed = true;
          return `${open}${next}${close}`;
        });
        return out;
      })
      .join("");
  };

  const lines = content.split(/(?<=\n)/).map((line) => {
    const fence = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (inFence === null) inFence = fence[1][0];
      else if (fence[1][0] === inFence) inFence = null;
      return line;
    }
    return inFence ? line : rewriteLine(line);
  });
  return changed ? lines.join("") : null;
}

/** Files moved by renaming a note: the note itself and its sub-pages folder. */
export function renamePlan(oldPath: string, newPath: string, files: string[]): Map<string, string> {
  const renames = new Map([[oldPath, newPath]]);
  const oldFolder = `${subpageFolder(oldPath)}/`;
  const newFolder = `${subpageFolder(newPath)}/`;
  for (const file of files) if (file.startsWith(oldFolder)) renames.set(file, newFolder + file.slice(oldFolder.length));
  return renames;
}
