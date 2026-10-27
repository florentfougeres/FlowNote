import { useCallback, type MutableRefObject } from "react";
import { BASE_SUFFIX, isBasePath, newBaseFile } from "../base/baseFile";
import { moveRecentPage } from "../dashboard/recents";
import type { Choice, NameResult, PageKind, TemplateChoice } from "../Dialogs";
import { DRAWING_SUFFIX, newDrawingFile } from "../drawing/format";
import { MINDMAP_SUFFIX, newMindmapFile } from "../mindmap/format";
import { CANVAS_SUFFIX, newCanvasFile } from "../canvas/format";
import { DASHBOARD_SUFFIX, newDashboardFile } from "../dashboardPage/format";
import { newPresentationFile } from "../presentation/format";
import { NEW_KANBAN } from "../kanban/format";
import type { TaskConfig } from "../tasks/config";
import { newTaskFile, taskFileName } from "../tasks/task";
import { linkTextFor, newNoteFolder, noteTitle, sanitizeName, subpageFolder, uniquePath, type ObsidianConfig } from "../vault/links";
import { deletePage, moveFolder, movePage, renameFolder, renamePage, subpagesOf } from "../vault/pageOps";
import { ownAttachments, readPages } from "../vault/attachments";
import { isMergeable, mergePage } from "../vault/merge";
import { isTauri } from "../vault/tauriVault";
import type { Vault, VaultEntry } from "../vault/vault";
import { noteFromTemplate, templateName, type TemplatesConfig } from "../vault/templates";

/** The "new page" dialog's request: its answer is the name, kind and folder chosen. */
export interface NewPageRequest {
  title: string;
  initial: string;
  folders?: string[];
  folder?: string;
  kinds?: boolean;
  initialKind?: PageKind;
  templates?: TemplateChoice[];
}

export interface PageOpsContext {
  vault: Vault | null;
  tree: VaultEntry[];
  filesRef: MutableRefObject<string[]>;
  noteRef: { readonly current: { path: string } | null };
  config: ObsidianConfig;
  /** Obsidian's templates folder and its notes, when one is set. */
  templates: { config: TemplatesConfig; files: string[] } | null;
  /** The tasks' settings (TaskNotes): where a new task goes and how it is written. */
  tasks: TaskConfig;
  saveNow: () => Promise<void>;
  refresh: (vault: Vault) => Promise<void>;
  refreshGit: () => Promise<void>;
  select: (path: string) => Promise<void>;
  notify: (text: string) => void;
  setStatus: (text: string) => void;
  askName: (title: string, initial: string) => Promise<string | null>;
  askConfirm: (message: string, confirmLabel: string) => Promise<boolean>;
  /** Confirmation with a box to tick: null when cancelled, else whether it was ticked. */
  askConfirmOption: (message: string, confirmLabel: string, option: string) => Promise<boolean | null>;
  /** A file chosen in a list; null when closed. */
  askChoice: (choice: Choice) => Promise<string | null>;
  askNewPage: (request: NewPageRequest) => Promise<NameResult | null>;
  /** After files moved: tree, tabs, history and the open note follow (`moved` maps old paths to new ones). */
  followMoves: (moved: (path: string) => string, updatedNotes: string[]) => Promise<void>;
  /** After a deletion: tabs, history and the open note leave the removed pages; resolves to the files left. */
  forgetRemoved: (removed: (path: string) => boolean) => Promise<string[]>;
}

const linksUpdated = (count: number) => (count > 0 ? `liens mis à jour dans ${count} note${count > 1 ? "s" : ""}` : "");

/**
 * What the sidebar, the tabs and the page do to the vault's files: create,
 * rename, move, duplicate and delete pages and folders. Links across the vault
 * follow every move (pageOps.ts); the app's tabs and history follow through
 * `followMoves` and `forgetRemoved`.
 */
export function usePageOps(ctx: PageOpsContext) {
  const { vault, filesRef, noteRef, refresh } = ctx;

  const createFile = useCallback(
    async (path: string, content: string | Uint8Array) => {
      if (!vault) return;
      await vault.create(path, content);
      filesRef.current = [...filesRef.current, path].sort();
      await refresh(vault);
    },
    [vault, refresh, filesRef],
  );

  /** Renames a page (and its sub-pages folder); links across the vault follow. */
  const renamePath = async (path: string, title: string): Promise<boolean> => {
    if (!vault) return false;
    try {
      await ctx.saveNow();
      const result = await renamePage(vault, path, title);
      // A base follows its rows' folder, renamed with it.
      if (isBasePath(path) && result.path !== path) {
        const text = await vault.read(result.path);
        const next = text.split(`file.inFolder(${JSON.stringify(subpageFolder(path))})`).join(`file.inFolder(${JSON.stringify(subpageFolder(result.path))})`);
        if (next !== text) await vault.write(result.path, next, text);
      }
      const oldFolder = `${subpageFolder(path)}/`;
      await ctx.followMoves((p) => (p === path ? result.path : p.startsWith(oldFolder) ? `${subpageFolder(result.path)}/${p.slice(oldFolder.length)}` : p), result.updatedNotes);
      moveRecentPage(vault.name, path, result.path);
      const others = linksUpdated(result.updatedNotes.filter((p) => p !== result.path).length);
      ctx.notify(others ? `Page renommée ; ${others}.` : "Page renommée.");
      void ctx.refreshGit();
      return true;
    } catch (error) {
      ctx.setStatus(String(error));
      return false;
    }
  };

  /** Renames the open page from its title. */
  const renameCurrent = (title: string) => (noteRef.current ? renamePath(noteRef.current.path, title) : Promise.resolve(false));

  /** "Nouveau dossier": an empty folder in `parent` ("" is the vault root). */
  const newFolder = async (parent: string) => {
    if (!vault) return;
    const name = sanitizeName((await ctx.askName(parent ? "Nouveau sous-dossier" : "Nouveau dossier", "Sans titre")) ?? "");
    if (!name) return;
    try {
      await vault.createFolder(parent ? `${parent}/${name}` : name);
      await refresh(vault);
      ctx.setStatus("");
    } catch (error) {
      ctx.setStatus(String(error));
    }
  };

  /** Renames a folder; links to its pages and bases' folder filters follow. */
  const renameFolderPath = async (folder: string) => {
    if (!vault) return;
    const title = await ctx.askName("Renommer le dossier", folder.slice(folder.lastIndexOf("/") + 1));
    if (!title) return;
    try {
      await ctx.saveNow();
      const result = await renameFolder(vault, folder, title);
      if (result.path === folder) return;
      await ctx.followMoves((p) => (p.startsWith(`${folder}/`) ? result.path + p.slice(folder.length) : p), result.updatedNotes);
      moveRecentPage(vault.name, folder, result.path);
      const others = linksUpdated(result.updatedNotes.filter((p) => !p.startsWith(`${result.path}/`)).length);
      ctx.notify(others ? `Dossier renommé ; ${others}.` : "Dossier renommé.");
      void ctx.refreshGit();
    } catch (error) {
      ctx.setStatus(String(error));
    }
  };

  /** Drag and drop in the tree: a page (with its sub-pages) or a folder goes into `target` ("" is the root). */
  const moveItem = async (item: { path: string; folder: boolean }, target: string) => {
    if (!vault) return;
    try {
      await ctx.saveNow();
      const result = item.folder ? await moveFolder(vault, item.path, target) : await movePage(vault, item.path, target, ctx.config);
      if (result.path === item.path) return;
      const from = item.folder ? item.path : subpageFolder(item.path);
      const to = item.folder ? result.path : subpageFolder(result.path);
      await ctx.followMoves((p) => (p === item.path ? result.path : p.startsWith(`${from}/`) ? to + p.slice(from.length) : p), result.updatedNotes);
      moveRecentPage(vault.name, item.path, result.path);
      const where = target ? `« ${target.slice(target.lastIndexOf("/") + 1)} »` : "la racine";
      const others = linksUpdated(result.updatedNotes.filter((p) => p !== result.path && !p.startsWith(`${to}/`)).length);
      ctx.notify(`${item.folder ? "Dossier déplacé" : "Page déplacée"} dans ${where}${others ? ` ; ${others}` : ""}.`);
      void ctx.refreshGit();
    } catch (error) {
      ctx.setStatus(String(error));
    }
  };

  /** A copy of a page next to it ("Nom 1"), opened; its sub-pages are not copied. */
  const duplicatePage = async (path: string) => {
    if (!vault) return;
    try {
      await ctx.saveNow();
      const extension = /\.(?:excalidraw|mindmap|dashboard)\.md$|\.base$|\.canvas$|\.md$/i.exec(path)?.[0] ?? "";
      const stem = path.slice(0, path.length - extension.length);
      let copy = "";
      for (let i = 1; !copy || filesRef.current.some((f) => f.toLowerCase() === copy.toLowerCase()); i++) copy = `${stem} ${i}${extension}`;
      await createFile(copy, await vault.read(path));
      await ctx.select(copy);
    } catch (error) {
      ctx.setStatus(String(error));
    }
  };

  /** Copies a `[[link]]` to the page, as Obsidian would write it. */
  const copyLink = async (path: string) => {
    const link = `[[${linkTextFor(path, filesRef.current)}]]`;
    try {
      await navigator.clipboard.writeText(link);
      ctx.notify(`Lien copié : ${link}`);
    } catch (error) {
      ctx.setStatus(`Copie impossible : ${String(error)}`);
    }
  };

  /** Removes a folder and everything in it, after confirmation. */
  const removeFolder = async (folder: string) => {
    if (!vault) return;
    const pages = filesRef.current.filter((f) => f.startsWith(`${folder}/`) && (f.endsWith(".md") || f.endsWith(".base") || f.endsWith(".canvas"))).length;
    const others = filesRef.current.filter((f) => f.startsWith(`${folder}/`)).length - pages;
    const content = [pages ? `${pages} page${pages > 1 ? "s" : ""}` : "", others ? `${others} autre${others > 1 ? "s" : ""} fichier${others > 1 ? "s" : ""}` : ""].filter(Boolean).join(" et ");
    const where = isTauri() ? "Il ira dans la corbeille." : "Cette suppression est définitive.";
    const message = `Supprimer le dossier « ${folder.slice(folder.lastIndexOf("/") + 1)} »${content ? ` et son contenu (${content})` : ""} ? ${where}`;
    if (!(await ctx.askConfirm(message, "Supprimer"))) return;
    if (noteRef.current?.path.startsWith(`${folder}/`)) await ctx.saveNow().catch(() => {});
    try {
      await vault.remove(folder);
      ctx.setStatus("");
    } catch (error) {
      ctx.setStatus(String(error));
    }
    await ctx.forgetRemoved((p) => p.startsWith(`${folder}/`));
    moveRecentPage(vault.name, folder, null);
  };

  /** Removes a page and its sub-pages, after confirmation; its own attachments too, if the box is left ticked. */
  const removePage = async (path: string) => {
    if (!vault) return;
    const children = subpagesOf(path, filesRef.current).length;
    const where = isTauri() ? "Elle ira dans la corbeille." : "Cette suppression est définitive.";
    const withChildren = children === 0 ? "" : children === 1 ? " et sa sous-page" : ` et ses ${children} sous-pages`;
    const message = `Supprimer « ${noteTitle(path)} »${withChildren} ? ${where}`;
    if (noteRef.current?.path === path) await ctx.saveNow().catch(() => {});
    const attachments = path.endsWith(".md") ? ownAttachments(path, await readPages(vault, filesRef.current), filesRef.current, ctx.config) : [];
    const names = attachments.map((f) => f.slice(f.lastIndexOf("/") + 1));
    const option = names.length === 1 ? `Supprimer aussi sa pièce jointe (${names[0]})` : `Supprimer aussi ses ${names.length} pièces jointes (${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""})`;
    let withAttachments = false;
    if (attachments.length) {
      const ticked = await ctx.askConfirmOption(message, "Supprimer", option);
      if (ticked === null) return;
      withAttachments = ticked;
    } else if (!(await ctx.askConfirm(message, "Supprimer"))) return;
    let failure: unknown = null;
    try {
      await deletePage(vault, path, filesRef.current, withAttachments ? attachments : [], ctx.config);
    } catch (error) {
      failure = error;
    }
    // Even after a partial failure: show what is left on disk, and leave the pages that are gone.
    const files = await ctx.forgetRemoved((p) => p === path || p.startsWith(`${subpageFolder(path)}/`));
    if (!files.includes(path)) moveRecentPage(vault.name, path, null);
    ctx.setStatus(failure ? String(failure) : "");
  };

  /** Merges a note into another chosen in a list, after confirmation; the tabs showing it show the other. */
  const mergeInto = async (path: string) => {
    if (!vault) return;
    const choices = filesRef.current.filter((f) => f !== path && isMergeable(f)).map((f) => ({ path: f, name: f.replace(/\.md$/i, "") }));
    const target = await ctx.askChoice({ title: `Fusionner « ${noteTitle(path)} » dans…`, placeholder: "Chercher une note…", empty: "Aucune note", icon: "doc", choices });
    if (!target) return;
    const where = isTauri() ? "Elle ira ensuite dans la corbeille" : "Elle sera ensuite supprimée";
    const message = `Ajouter le texte et les propriétés de « ${noteTitle(path)} » à la fin de « ${noteTitle(target)} » ? ${where}, et les liens vers elle mèneront à « ${noteTitle(target)} ».`;
    if (!(await ctx.askConfirm(message, "Fusionner"))) return;
    try {
      await ctx.saveNow();
      const result = await mergePage(vault, path, target);
      await ctx.followMoves((p) => (p === path ? target : p), result.updatedNotes);
      moveRecentPage(vault.name, path, target);
      const others = linksUpdated(result.updatedNotes.filter((p) => p !== target).length);
      ctx.notify(`« ${noteTitle(path)} » fusionnée dans « ${noteTitle(target)} »${others ? ` ; ${others}` : ""}.`);
      await ctx.select(target);
      void ctx.refreshGit();
    } catch (error) {
      ctx.setStatus(String(error));
    }
  };

  /** Every folder of the vault, for the "new page" dialog ("" is the root). */
  const folderChoices = () => {
    const folders = new Set<string>([""]);
    for (const file of filesRef.current) {
      const parts = file.split("/").slice(0, -1);
      parts.forEach((_, i) => folders.add(parts.slice(0, i + 1).join("/")));
    }
    // Empty folders are only in the tree.
    const walk = (entries: VaultEntry[]) => entries.forEach((e) => e.kind === "dir" && (folders.add(e.path), walk(e.children ?? [])));
    walk(ctx.tree);
    return [...folders].sort((a, b) => a.localeCompare(b, "fr"));
  };

  /**
   * "+ Nouvelle page" (asks for a name and a folder), "+" on a page (sub-page,
   * linked from its parent) or "+" on a folder (page inside it).
   */
  const newPage = async (parent: string | null, presetName?: string, inFolder?: string, initialKind?: PageKind) => {
    if (!vault) return;
    let name = presetName ?? null;
    let kind: PageKind = "note";
    let template: string | undefined;
    let folder = parent ? subpageFolder(parent) : (inFolder ?? newNoteFolder("", ctx.config));
    if (!name) {
      const chooseFolder = !parent && inFolder === undefined;
      const result = await ctx.askNewPage({
        title: parent ? "Nom de la sous-page" : "Nouvelle page",
        initial: "Sans titre",
        folders: chooseFolder ? folderChoices() : undefined,
        folder,
        kinds: true,
        initialKind,
        templates: ctx.templates?.files.map((path) => ({ path, name: templateName(ctx.templates!.config, path) })),
      });
      if (!result) return;
      name = result.name;
      kind = result.kind;
      template = result.template;
      if (chooseFolder) folder = result.folder;
    }
    const title = sanitizeName(name) || "Sans titre";
    if (kind === "task") return createTask(name);
    const path = uniquePath(folder, `${title}${kind === "drawing" ? DRAWING_SUFFIX : kind === "mindmap" ? MINDMAP_SUFFIX : kind === "canvas" ? CANVAS_SUFFIX : kind === "dashboard" ? DASHBOARD_SUFFIX : kind === "base" ? BASE_SUFFIX : ".md"}`, filesRef.current);
    try {
      await ctx.saveNow();
      // A note from a template: the template filled in, under its title.
      const fromTemplate = template && ctx.templates ? noteFromTemplate(await vault.read(template), title, new Date(), ctx.templates.config) : null;
      // A base's rows are the notes of the folder named after it, next to it (like sub-pages).
      await createFile(path, fromTemplate ?? (kind === "base" ? newBaseFile(subpageFolder(path)) : kind === "drawing" ? newDrawingFile() : kind === "mindmap" ? newMindmapFile(title) : kind === "canvas" ? newCanvasFile() : kind === "dashboard" ? newDashboardFile() : kind === "presentation" ? newPresentationFile(title) : kind === "kanban" ? NEW_KANBAN : `# ${title}\n`));
      if (parent) {
        const content = await vault.read(parent);
        const separator = content === "" ? "" : content.endsWith("\n") ? "\n" : "\n\n";
        await vault.write(parent, `${content}${separator}[[${linkTextFor(path, filesRef.current)}]]\n`, content);
      }
      await ctx.select(path);
    } catch (error) {
      ctx.setStatus(String(error));
    }
  };

  /** A task in TaskNotes' folder, named by its title (or an id, as TaskNotes is set), in the status of a board column. */
  const createTask = async (title: string, status?: string) => {
    if (!vault) return;
    const now = new Date();
    const path = uniquePath(ctx.tasks.folder, `${taskFileName(title, ctx.tasks, now)}.md`, filesRef.current);
    try {
      await ctx.saveNow();
      await createFile(path, newTaskFile(title, ctx.tasks, now, { status }));
      await ctx.select(path);
    } catch (error) {
      ctx.setStatus(String(error));
    }
  };
  const newTask = async (status?: string) => {
    const title = await ctx.askName("Nouvelle tâche", "");
    if (title?.trim()) await createTask(title.trim(), status);
  };

  return { createFile, renamePath, renameCurrent, newFolder, renameFolderPath, moveItem, duplicatePage, copyLink, removeFolder, removePage, mergeInto, newPage, newTask };
}
