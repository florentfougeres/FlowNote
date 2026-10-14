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
  // A drawing keeps its ".excalidraw.md" extension.
  const extension = /\.excalidraw\.md$/i.test(oldPath) ? ".excalidraw.md" : ".md";
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

  const updatedNotes: string[] = [];
  for (const before of filesBefore.filter((f) => f.endsWith(".md"))) {
    const after = renames.get(before) ?? before;
    const content = await vault.read(after);
    const next = rewriteLinks(content, { oldNotePath: before, newNotePath: after, filesBefore, filesAfter, renames });
    if (next === null) continue;
    await vault.write(after, next, content);
    updatedNotes.push(after);
  }
  return { path: newPath, updatedNotes };
}

/** Sub-pages that would be deleted with a page. */
export function subpagesOf(path: string, files: string[]): string[] {
  const folder = `${subpageFolder(path)}/`;
  return files.filter((f) => f.startsWith(folder) && f.endsWith(".md"));
}

/** Removes a page and its sub-pages folder (to the system trash in the desktop app). */
export async function deletePage(vault: Vault, path: string, files: string[]): Promise<void> {
  await vault.remove(path);
  if (files.some((f) => f.startsWith(`${subpageFolder(path)}/`))) await vault.remove(subpageFolder(path));
}
