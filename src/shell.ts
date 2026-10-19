/**
 * The contract between the app and the native shell (FlowNote Swift, native/).
 * The shell calls the app through `window.flownoteShell.call(name, …args)`
 * (ShellCalls), and the app tells it its state through `shell_update`
 * (ShellState). shell.test.ts checks every name the Swift code uses against
 * this file, the backend and the web sidebar.
 */

/** The menus the shell shows, written once in menus.ts. */
export type ShellMenuKind = "page" | "folder" | "root" | "tab";

export interface ShellMenuEntry {
  label: string;
  danger: boolean;
}

export interface ShellCalls {
  /** Opens a page or a view (null: the home page), here or in a new tab. */
  select(path: string | null, newTab?: boolean): void;
  switchTab(id: string): void;
  reorderTab(id: string, before: string | null): void;
  closeTab(id: string): void;
  newTab(): void;
  back(): void;
  forward(): void;
  /** Split view (menu bar). */
  swapSplit(): void;
  separateTab(id: string): void;
  toggleSplit(): void;
  /** A handler of the web sidebar (Sidebar.tsx's props): the same dialogs, the same rules. */
  sidebar(name: string, args: unknown[]): void;
  /** A menu of menus.ts, for the shell to show natively; `runMenu` runs the chosen entry. */
  menu(kind: ShellMenuKind, target: string | null): ShellMenuEntry[];
  runMenu(index: number): void;
  newPage(): void;
  search(): void;
  vaultSearch(): void;
  addLink(): void;
  find(replace: boolean): void;
  help(): void;
  git(): void;
  settings(): void;
  focus(): void;
  /** Files changed on disk (Obsidian, git, iCloud, another window). */
  refresh(): void;
}

/** Every call, for the contract test (the compiler keeps the list complete). */
export const SHELL_CALL_NAMES = [
  "select", "switchTab", "reorderTab", "closeTab", "newTab", "back", "forward", "swapSplit", "separateTab", "toggleSplit",
  "sidebar", "menu", "runMenu", "newPage", "search", "vaultSearch", "addLink", "find", "help", "git", "settings", "focus", "refresh",
] as const satisfies readonly (keyof ShellCalls)[];
type Missing = Exclude<keyof ShellCalls, (typeof SHELL_CALL_NAMES)[number]>;
export const shellCallsComplete: [Missing] extends [never] ? true : Missing = true;

/** A tab, as the shell draws it. */
export interface ShellTab {
  id: string;
  title: string;
  /** null: the home page. */
  path: string | null;
  icon: string | null;
  ticket: boolean;
  presentation: boolean;
  /** The page on the right (split view). */
  split: string | null;
  splitTitle: string | null;
  splitIcon: string | null;
}

/** What the shell is told after every change (`shell_update`). */
export interface ShellState {
  tabs: ShellTab[];
  active: string;
  dirty: boolean;
  canBack: boolean;
  canForward: boolean;
  gitOpen: boolean;
  /** Changed files; null outside a git repository. */
  gitChanges: number | null;
  focus: boolean;
  view: string | null;
  favorites: string[];
  showTitles: boolean;
  titles: Record<string, string>;
  /** The open page's icon and title as typed. */
  live: { path: string; icon: string | null; title: string | null } | null;
  ticketsFolder: string;
}

/** What the shell gives the app at launch (`shell_state`). */
export interface ShellLaunch {
  vaultName: string;
  git: boolean;
  recent: string[];
  /** A page to open (FLOWNOTE_OPEN, for debugging). */
  open: string | null;
}
