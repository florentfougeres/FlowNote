import { dirname, renamePlan, rewriteLinks, sanitizeName, subpageFolder } from "./links";
import type { Vault } from "./vault";

/** Page operations spanning several files: rename (with link updates) and delete. */

export interface RenameResult {
  path: string;
  /** Notes whose links were updated. */
  updatedNotes: string[];
}

/**
 * Renames a note and its sub-pages folder, then updates every link to the moved
 * files across the vault (like Obsidian's "Automatically update internal links").
 */
export async function renamePage(vault: Vault, oldPath: string, title: string): Promise<RenameResult> {
  const name = sanitizeName(title);
  if (!name) throw new Error("Le titre ne peut pas être vide.");
  const folder = dirname(oldPath);
  // Drawings, mind maps and bases keep their extension (".excalidraw.md", ".mindmap.md", ".base").
  const extension = /\.(?:excalidraw|mindmap)\.md$|\.base$/i.exec(oldPath)?.[0] ?? ".md";
  const newPath = folder ? `${folder}/${name}${extension}` : `${name}${extension}`;
  if (newPath === oldPath) return { path: oldPath, updatedNotes: [] };

  const filesBefore = await vault.files();
  const caseOnly = newPath.toLowerCase() === oldPath.toLowerCase();
  if (!caseOnly && filesBefore.some((f) => f.toLowerCase() === newPath.toLowerCase())) throw new Error(`Une page « ${name} » existe déjà ici.`);
  const renames = renamePlan(oldPath, newPath, filesBefore);
  const filesAfter = filesBefore.map((f) => renames.get(f) ?? f);

  await vault.rename(oldPath, newPath);
  const oldFolder = subpageFolder(oldPath);
  if (filesBefore.some((f) => f.startsWith(`${oldFolder}/`))) await vault.rename(oldFolder, subpageFolder(newPath));

  return { path: newPath, updatedNotes: await updateLinks(vault, filesBefore, filesAfter, renames) };
}

/** Rewrites the links of every note after `renames`; returns the notes changed. */
async function updateLinks(vault: Vault, filesBefore: string[], filesAfter: string[], renames: Map<string, string>): Promise<string[]> {
  const updatedNotes: string[] = [];
  for (const before of filesBefore.filter((f) => f.endsWith(".md"))) {
    const after = renames.get(before) ?? before;
    const content = await vault.read(after);
    const next = rewriteLinks(content, { oldNotePath: before, newNotePath: after, filesBefore, filesAfter, renames });
    if (next === null) continue;
    await vault.write(after, next, content);
    updatedNotes.push(after);
  }
  return updatedNotes;
}

/**
 * Renames a folder, then updates every link to the files it holds, and the
 * folder filter of the bases whose rows are in it (`file.inFolder("…")`).
 */
export async function renameFolder(vault: Vault, folder: string, title: string): Promise<RenameResult> {
  const name = sanitizeName(title);
  if (!name) throw new Error("Le nom ne peut pas être vide.");
  const parent = dirname(folder);
  return relocateFolder(vault, folder, parent ? `${parent}/${name}` : name);
}

/** Moves a folder into `target` ("" is the vault root); links and base filters follow. */
export function moveFolder(vault: Vault, folder: string, target: string): Promise<RenameResult> {
  if (target === folder || target.startsWith(`${folder}/`)) return Promise.reject(new Error("Un dossier ne peut pas aller dans lui-même."));
  return relocateFolder(vault, folder, target ? `${target}/${basename(folder)}` : basename(folder));
}

async function relocateFolder(vault: Vault, folder: string, newFolder: string): Promise<RenameResult> {
  if (newFolder === folder) return { path: folder, updatedNotes: [] };
  const filesBefore = await vault.files();
  const taken = (f: string) => f.toLowerCase() === newFolder.toLowerCase() || f.toLowerCase().startsWith(`${newFolder.toLowerCase()}/`);
  if (newFolder.toLowerCase() !== folder.toLowerCase() && filesBefore.some(taken)) throw new Error(`« ${basename(newFolder)} » existe déjà ici.`);
  const renames = new Map(filesBefore.filter((f) => f.startsWith(`${folder}/`)).map((f) => [f, newFolder + f.slice(folder.length)]));
  const filesAfter = filesBefore.map((f) => renames.get(f) ?? f);

  await vault.rename(folder, newFolder);
  const updatedNotes = await updateLinks(vault, filesBefore, filesAfter, renames);
  updatedNotes.push(...(await retargetBases(vault, filesAfter, folder, newFolder)));
  return { path: newFolder, updatedNotes };
}

/**
 * Moves a page and its sub-pages folder into `target` ("" is the vault
 * root); links follow, and so does the folder of a base's rows.
 */
export async function movePage(vault: Vault, path: string, target: string): Promise<RenameResult> {
  const newPath = target ? `${target}/${basename(path)}` : basename(path);
  if (newPath === path) return { path, updatedNotes: [] };
  const filesBefore = await vault.files();
  const oldFolder = subpageFolder(path);
  const hasSubpages = filesBefore.some((f) => f.startsWith(`${oldFolder}/`));
  const lower = (f: string) => f.toLowerCase();
  if (filesBefore.some((f) => lower(f) === lower(newPath) || (hasSubpages && lower(f).startsWith(`${lower(subpageFolder(newPath))}/`))))
    throw new Error(`Une page « ${basename(subpageFolder(path))} » existe déjà ici.`);
  const renames = renamePlan(path, newPath, filesBefore);
  const filesAfter = filesBefore.map((f) => renames.get(f) ?? f);

  await vault.rename(path, newPath);
  if (hasSubpages) await vault.rename(oldFolder, subpageFolder(newPath));
  const updatedNotes = await updateLinks(vault, filesBefore, filesAfter, renames);
  updatedNotes.push(...(await retargetBases(vault, filesAfter, oldFolder, subpageFolder(newPath))));
  return { path: newPath, updatedNotes };
}

/** Bases whose folder filter pointed into `folder`, pointed to `newFolder`; returns them. */
async function retargetBases(vault: Vault, files: string[], folder: string, newFolder: string): Promise<string[]> {
  const changed: string[] = [];
  for (const base of files.filter((f) => f.endsWith(".base"))) {
    const content = await vault.read(base);
    const next = retargetBaseFolders(content, folder, newFolder);
    if (next === content) continue;
    await vault.write(base, next, content);
    changed.push(base);
  }
  return changed;
}

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** A base's `file.inFolder("…")` filters, moved from `folder` (and its sub-folders) to `newFolder`. */
export function retargetBaseFolders(content: string, folder: string, newFolder: string): string {
  const quoted = (f: string) => JSON.stringify(f).slice(0, -1);
  return content
    .split(`file.inFolder(${quoted(folder)}"`)
    .join(`file.inFolder(${quoted(newFolder)}"`)
    .split(`file.inFolder(${quoted(folder)}/`)
    .join(`file.inFolder(${quoted(newFolder)}/`);
}

/** Sub-pages that would be deleted with a page. */
export function subpagesOf(path: string, files: string[]): string[] {
  const folder = `${subpageFolder(path)}/`;
  return files.filter((f) => f.startsWith(folder) && f.endsWith(".md"));
}

/**
 * Removes a page and its sub-pages folder (to the system trash in the desktop
 * app). Both are attempted even if one fails, and what is already gone is not
 * an error: deleting again finishes a deletion left halfway.
 */
export async function deletePage(vault: Vault, path: string, files: string[]): Promise<void> {
  const targets = [path];
  if (files.some((f) => f.startsWith(`${subpageFolder(path)}/`))) targets.push(subpageFolder(path));
  const errors: string[] = [];
  for (const target of targets) {
    try {
      await vault.remove(target);
    } catch (error) {
      errors.push(`${target} : ${String(error)}`);
    }
  }
  if (errors.length) throw new Error(`Suppression incomplète. ${errors.join(" ; ")}`);
}
