import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { ownAttachments, readPages } from "./attachments";
import { attachmentFolder, dirname, renamePlan, rewriteHeadingLinks, rewriteLinks, sanitizeName, subpageFolder, uniquePath, type ObsidianConfig } from "./links";
import { readAllNotes, type Vault } from "./vault";

/** Page operations spanning several files: rename (with link updates) and delete. */

export interface RenameResult {
  path: string;
  /** Notes whose links were updated. */
  updatedNotes: string[];
}

/**
 * Renames a note and its sub-pages folder, then updates every link to the moved
 * files across the vault, so that they keep working in Obsidian.
 */
export async function renamePage(vault: Vault, oldPath: string, title: string): Promise<RenameResult> {
  const name = sanitizeName(title);
  if (!name) throw new Error("Le titre ne peut pas être vide.");
  const folder = dirname(oldPath);
  // Drawings, mind maps, bases and canvases keep their extension (".excalidraw.md", ".mindmap.md", ".base", ".canvas").
  const extension = /\.(?:excalidraw|mindmap|dashboard)\.md$|\.base$|\.canvas$/i.exec(oldPath)?.[0] ?? ".md";
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

  const updatedNotes = await updateLinks(vault, filesBefore, filesAfter, renames);
  updatedNotes.push(...(await retargetRowOrders(vault, filesAfter, renames)));
  return { path: newPath, updatedNotes: [...new Set(updatedNotes)] };
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
 * After a heading of `target` was renamed from `from` to `to`, updates the
 * links to it in the other notes of the vault, like Obsidian. The notes open
 * in an editor (`open`, `target` among them) are left alone: their editor
 * would no longer match the file. Returns the notes changed.
 */
export async function renameHeadingLinks(vault: Vault, files: string[], target: string, from: string, to: string, open: string[]): Promise<string[]> {
  const updatedNotes: string[] = [];
  for (const [path, content] of await readAllNotes(vault, files)) {
    if (path === target || open.includes(path) || !content.includes("#")) continue;
    const next = rewriteHeadingLinks(content, path, files, target, from, to);
    if (next === null) continue;
    await vault.write(path, next, content);
    updatedNotes.push(path);
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
  updatedNotes.push(...(await retargetRowOrders(vault, filesAfter, renames)));
  return { path: newFolder, updatedNotes: [...new Set(updatedNotes)] };
}

/**
 * Moves a page and its sub-pages folder into `target` ("" is the vault
 * root); links follow, and so do the folder of a base's rows and the
 * attachments that belong to the note (in its new attachment folder).
 */
export async function movePage(vault: Vault, path: string, target: string, config: ObsidianConfig): Promise<RenameResult> {
  const newPath = target ? `${target}/${basename(path)}` : basename(path);
  if (newPath === path) return { path, updatedNotes: [] };
  const filesBefore = await vault.files();
  const oldFolder = subpageFolder(path);
  const hasSubpages = filesBefore.some((f) => f.startsWith(`${oldFolder}/`));
  const lower = (f: string) => f.toLowerCase();
  if (filesBefore.some((f) => lower(f) === lower(newPath) || (hasSubpages && lower(f).startsWith(`${lower(subpageFolder(newPath))}/`))))
    throw new Error(`Une page « ${basename(subpageFolder(path))} » existe déjà ici.`);
  const renames = renamePlan(path, newPath, filesBefore);
  const attachments = path.endsWith(".md") ? ownAttachments(path, await readPages(vault, filesBefore), filesBefore, config) : [];
  const folder = attachmentFolder(newPath, config);
  if (folder !== attachmentFolder(path, config)) {
    const taken = filesBefore.filter((f) => !attachments.includes(f));
    for (const file of attachments) {
      const moved = uniquePath(folder, file.slice(file.lastIndexOf("/") + 1), taken);
      renames.set(file, moved);
      taken.push(moved);
    }
  }
  const filesAfter = filesBefore.map((f) => renames.get(f) ?? f);

  await vault.rename(path, newPath);
  if (hasSubpages) await vault.rename(oldFolder, subpageFolder(newPath));
  const moved = attachments.filter((file) => renames.has(file));
  for (const file of moved) await vault.rename(file, renames.get(file) ?? file);
  if (moved.length) await removeIfEmpty(vault, attachmentFolder(path, config), path, filesAfter);
  const updatedNotes = await updateLinks(vault, filesBefore, filesAfter, renames);
  updatedNotes.push(...(await retargetBases(vault, filesAfter, oldFolder, subpageFolder(newPath))));
  updatedNotes.push(...(await retargetRowOrders(vault, filesAfter, renames)));
  return { path: newPath, updatedNotes: [...new Set(updatedNotes)] };
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

/**
 * A base's manual row order (`rowOrder` of its views, a list of note paths)
 * after `renames`; edited through the YAML document, so keys and comments
 * FlowNote does not know are kept.
 */
export function retargetRowOrder(content: string, renames: Map<string, string>): string {
  if (!content.includes("rowOrder")) return content;
  const doc = parseDocument(content);
  const views = doc.get("views");
  if (!isSeq(views)) return content;
  let changed = false;
  for (const view of views.items) {
    const order = isMap(view) ? view.get("rowOrder") : null;
    if (!isSeq(order)) continue;
    order.items.forEach((item, i) => {
      const value = isScalar(item) ? item.value : item;
      const moved = typeof value === "string" ? renames.get(value) : undefined;
      if (moved === undefined) return;
      order.set(i, moved);
      changed = true;
    });
  }
  return changed ? doc.toString() : content;
}

/** Bases whose manual row order named moved notes, rewritten; returns them. */
async function retargetRowOrders(vault: Vault, files: string[], renames: Map<string, string>): Promise<string[]> {
  const changed: string[] = [];
  for (const base of files.filter((f) => f.endsWith(".base"))) {
    const content = await vault.read(base);
    const next = retargetRowOrder(content, renames);
    if (next === content) continue;
    await vault.write(base, next, content);
    changed.push(base);
  }
  return changed;
}

/**
 * A note's own attachment folder (`attachments` next to it) left with
 * nothing after its files went elsewhere is removed; the note's folder itself
 * never is.
 */
export async function removeIfEmpty(vault: Vault, folder: string, notePath: string, files: string[]): Promise<void> {
  if (!folder || folder === dirname(notePath) || files.some((f) => f.startsWith(`${folder}/`))) return;
  await vault.remove(folder).catch(() => {});
}

/** Sub-pages that would be deleted with a page. */
export function subpagesOf(path: string, files: string[]): string[] {
  const folder = `${subpageFolder(path)}/`;
  return files.filter((f) => f.startsWith(folder) && f.endsWith(".md"));
}

/**
 * Removes a page and its sub-pages folder (to the system trash in the desktop
 * app), with the `attachments` given (its own, ownAttachments). All are
 * attempted even if one fails, and what is already gone is not an error:
 * deleting again finishes a deletion left halfway.
 */
export async function deletePage(vault: Vault, path: string, files: string[], attachments: string[] = [], config?: ObsidianConfig): Promise<void> {
  const targets = [path, ...attachments];
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
  if (attachments.length && config) await removeIfEmpty(vault, attachmentFolder(path, config), path, await vault.files());
}

/**
 * Where a folder setting (the tickets folder) points after `from` moved to
 * `to` (null: deleted, back to `fallback`); unchanged when `from` is neither
 * the folder nor one of its parents.
 */
export function followFolder(setting: string, from: string, to: string | null, fallback: string): string {
  if (!setting || !(setting === from || setting.startsWith(`${from}/`))) return setting;
  return to === null ? fallback : to + setting.slice(from.length);
}
