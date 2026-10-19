import type { IconName } from "./Icon";
import type { MenuItem } from "./Sidebar";
import { isBasePath } from "./base/baseFile";

/**
 * The menus of the sidebar and of the tabs, written once: the sidebar and the
 * tab bar show them. Each takes the actions it runs.
 */

export interface PageMenuActions {
  onSelect: (path: string, newTab: boolean) => void;
  onOpenRight: (path: string) => void;
  onNewPage: (parent: string | null) => void;
  onCopyLink: (path: string) => void;
  onDuplicate: (path: string) => void;
  onReveal?: (path: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}

const reveal = (path: string, onReveal?: (path: string) => void): MenuItem[] =>
  onReveal ? [{ label: "Afficher dans le Finder", icon: "folder", run: () => onReveal(path) }] : [];

/** A page of the sidebar. Tickets are numbered and bases share their rows' folder: neither is duplicated. */
export function pageMenu(path: string, ticket: boolean, a: PageMenuActions): MenuItem[] {
  return [
    { label: "Ouvrir dans un nouvel onglet", icon: "open", run: () => a.onSelect(path, true) },
    { label: "Ouvrir à droite", icon: "split", run: () => a.onOpenRight(path) },
    { label: "Ajouter une sous-page", icon: "plus", run: () => a.onNewPage(path) },
    { label: "Copier le lien", icon: "link", run: () => a.onCopyLink(path) },
    ...(ticket || isBasePath(path) ? [] : [{ label: "Dupliquer", icon: "copy" as IconName, run: () => a.onDuplicate(path) }]),
    ...reveal(path, a.onReveal),
    { label: "Renommer", icon: "pencil", run: () => a.onRename(path) },
    { label: "Supprimer", icon: "trash", danger: true, run: () => a.onDelete(path) },
  ];
}

export interface FolderMenuActions {
  onNewPageInFolder: (folder: string) => void;
  onNewFolder: (parent: string) => void;
  onReveal?: (path: string) => void;
  onRenameFolder: (folder: string) => void;
  onDeleteFolder: (folder: string) => void;
}

/** A folder of the sidebar. */
export function folderMenu(folder: string, a: FolderMenuActions): MenuItem[] {
  return [
    { label: "Nouvelle page dans ce dossier", icon: "plus", run: () => a.onNewPageInFolder(folder) },
    { label: "Nouveau sous-dossier", icon: "folderAdd", run: () => a.onNewFolder(folder) },
    ...reveal(folder, a.onReveal),
    { label: "Renommer", icon: "pencil", run: () => a.onRenameFolder(folder) },
    { label: "Supprimer", icon: "trash", danger: true, run: () => a.onDeleteFolder(folder) },
  ];
}

/** The empty space of the tree: create at the vault's root. */
export function rootMenu(a: Pick<FolderMenuActions, "onNewPageInFolder" | "onNewFolder">): MenuItem[] {
  return [
    { label: "Nouvelle page", icon: "plus", run: () => a.onNewPageInFolder("") },
    { label: "Nouveau dossier", icon: "folderAdd", run: () => a.onNewFolder("") },
  ];
}

export interface TabMenuContext {
  /** The tab's page and the page on its right (split view). */
  path: string | null;
  split: string | null | undefined;
  isActive: boolean;
  /** Title of the active tab's page, for "Afficher à droite de…". */
  activeTitle: string;
  /** Another tab of the window shows a page (not a view). */
  otherPage: boolean;
  isView: (path: string) => boolean;
  swapSplit: () => void;
  separate: () => void;
  closeSplit: () => void;
  join: () => void;
  toggleSplit: () => void;
  close: () => void;
}

/** A tab: the split view's actions, then closing it. */
export function tabMenu(c: TabMenuContext): MenuItem[] {
  const page = c.path !== null && !c.isView(c.path);
  const items: MenuItem[] = [];
  if (c.split) {
    if (c.isActive) items.push({ label: "Échanger les côtés", icon: "replace", run: c.swapSplit });
    items.push({ label: "Séparer en deux onglets", icon: "split", run: c.separate });
    items.push({ label: "Fermer la page de droite", icon: "close", run: c.closeSplit });
  } else if (page && !c.isActive) {
    items.push({ label: `Afficher à droite de « ${c.activeTitle} »`, icon: "split", run: c.join });
  } else if (c.isActive && c.otherPage) {
    items.push({ label: "Diviser avec l'onglet suivant", icon: "split", run: c.toggleSplit });
  }
  items.push({ label: "Fermer l'onglet", icon: "close", run: c.close });
  return items;
}
