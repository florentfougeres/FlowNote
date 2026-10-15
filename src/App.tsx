import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keys } from "./keys";
import { NoteEditor } from "./editor/NoteEditor";
import { imageMime, type VaultBridge } from "./editor/bridge";
import { ConfirmDialog, NameDialog, type NameResult, type PageKind } from "./Dialogs";
import { DRAWING_SUFFIX, isDrawingPath, newDrawingFile } from "./drawing/format";
import { DrawingEditor, type DrawingControls } from "./drawing/DrawingEditor";
import { DRAWING_TOOLS } from "./drawing/tools";
import { isMindmapPath, MINDMAP_SUFFIX, newMindmapFile } from "./mindmap/format";
import { MindmapEditor, type MindmapControls } from "./mindmap/MindmapEditor";
import { BASE_SUFFIX, isBasePath, newBaseFile, parseBase, serializeBase, writeColumn, type SelectOption } from "./base/baseFile";
import { BaseView } from "./base/BaseView";
import { baseOfNote, baseProperties, RowProperties, type RowBase } from "./base/RowProperties";
import { columnInfo } from "./base/columns";
import { mountBase, type EmbedProps } from "./base/EmbeddedBase";
import { PageTitle } from "./PageTitle";
import { QuickSwitcher } from "./QuickSwitcher";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { applyTheme, loadSettings, saveSettings, SettingsPage, type Settings } from "./SettingsPage";
import { deletePage, moveFolder, movePage, renameFolder, renamePage, subpagesOf } from "./vault/pageOps";
import { PageIcon, Sidebar } from "./Sidebar";
import { Icon, type IconName } from "./Icon";
import { GraphPage } from "./graph/GraphPage";
import { ReadingView } from "./reading/ReadingView";
import { AddLinkDialog } from "./reading/AddLinkDialog";
import { addLink, newReadingList, parseReadingList, readingTagsOf } from "./reading/readingList";
import { noteIcon } from "./vault/icon";
import { setProperty } from "./markdown/frontmatter";
import type { FrontmatterControl } from "./editor/NoteEditor";
import { GitPanel } from "./GitPanel";
import { ToolButton, ToolGroup, Toolbar } from "./Toolbar";
import { Breadcrumbs } from "./Breadcrumbs";
import { OutlinePanel } from "./OutlinePanel";
import { RawEditor } from "./RawEditor";
import { FindBar, type FindRequest } from "./FindBar";
import { VaultSearch } from "./VaultSearch";
import { useSpellChecking } from "./editor/useSpellChecking";
import type { Editor } from "@tiptap/core";
import { HistoryPanel } from "./HistoryPanel";
import { browserVaultSupported, ConflictError, createMemoryVault, openBrowserVault, type Vault, type VaultEntry } from "./vault/vault";
import { DEFAULT_CONFIG, linkTextFor, newNoteFolder, noteTitle, parseObsidianConfig, sanitizeName, subpageFolder, uniquePath, type ObsidianConfig } from "./vault/links";
import { DEMO_FILES, DEMO_REMOTE } from "./demo";
import { GitDrawer, useGitDrawer } from "./GitDrawer";
import { usePersistentFlag } from "./hooks/usePersistentFlag";
import { useSystemDark } from "./hooks/useSystemDark";
import { hasConflictMarkers } from "./vault/conflicts";
import { forgetTauriVault, isTauri, lastTauriVault, openTauriVault, pickTauriVault, recentTauriVaults } from "./vault/tauriVault";
import { Welcome } from "./Welcome";
import { TabBar, type Tab } from "./TabBar";
import { Dashboard } from "./Dashboard";
import { TicketView } from "./ticket/TicketView";
import { TicketsView } from "./ticket/TicketsView";
import { isTicketMarkdown, newTicketFile, nextTicketId } from "./ticket/format";
import { isPresentationMarkdown, newPresentationFile } from "./presentation/format";
import { slideAt, useSlides } from "./presentation/useSlides";
import { SlidesPanel } from "./presentation/SlidesPanel";
import { Presenter } from "./presentation/Presenter";
import { ticketInfo } from "./ticket/agenda";
import { moveRecentPage, recordRecentPage } from "./dashboard/recents";
import { invoke } from "@tauri-apps/api/core";

interface OpenNote {
  path: string;
  /** Bumped when the note is reloaded from disk, so the editor starts over even if the text equals `loaded`. */
  reloads?: number;
  /** Content the editor was loaded from (unchanged by saves, so the editor is not reloaded). */
  loaded: string;
  /** Content on disk when the note was loaded or last saved. */
  disk: string;
  /** Current serialization of the editor content. */
  markdown: string;
}

/** Pseudo-path of the tickets list (a tab can show it like a page). */
const TICKETS_VIEW = "flownote:tickets";
/** Pseudo-path of the vault graph. */
const GRAPH_VIEW = "flownote:graph";
/** Pseudo-path of the reading list view. */
const READING_VIEW = "flownote:reading";
/** Pseudo-path of the settings page. */
const SETTINGS_VIEW = "flownote:settings";
/** Views shown in a tab instead of a page. */
const VIEWS: Record<string, { title: string; icon: IconName }> = {
  [TICKETS_VIEW]: { title: "Tickets", icon: "ticket" },
  [GRAPH_VIEW]: { title: "Graphe", icon: "graph" },
  [READING_VIEW]: { title: "Lectures", icon: "bookmark" },
  [SETTINGS_VIEW]: { title: "Réglages", icon: "sliders" },
};
const isView = (path: string | null) => path !== null && path in VIEWS;

let tabCounter = 0;
const newTabId = () => `tab-${Date.now().toString(36)}-${(tabCounter++).toString(36)}`;

interface Dialog {
  title: string;
  initial: string;
  folders?: string[];
  folder?: string;
  kinds?: boolean;
  initialKind?: PageKind;
  resolve: (result: NameResult | null) => void;
}

interface Confirm {
  message: string;
  confirmLabel: string;
  resolve: (confirmed: boolean) => void;
}

const AUTOSAVE_DELAY_MS = 700;

export function App() {
  const [vault, setVault] = useState<Vault | null>(null);
  const [tree, setTree] = useState<VaultEntry[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [config, setConfig] = useState<ObsidianConfig>(DEFAULT_CONFIG);
  const [note, setNote] = useState<OpenNote | null>(null);
  const [rawMode, setRawMode] = useState(false);
  const rawModeRef = useRef(rawMode);
  rawModeRef.current = rawMode;
  /** Leaving raw mode: the rich editor reloads from the edited text. */
  const toggleRaw = () => {
    if (rawMode) setNote((n) => (n ? { ...n, loaded: n.markdown } : n));
    setRawMode(!rawMode);
  };
  const [status, setStatus] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [gitChanges, setGitChanges] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [modal, setModal] = useState<"switcher" | "help" | "search" | "addLink" | null>(null);
  /** Bumped when a link is added, so the reading list views read it again. */
  const [readingVersion, setReadingVersion] = useState(0);
  const [readingThemes, setReadingThemes] = useState<string[]>([]);
  const [readingTags, setReadingTags] = useState<string[]>([]);
  const [findRequest, setFindRequest] = useState<FindRequest | null>(null);
  /** Selected text (one line) used to prefill the find fields. */
  const selectedText = () => {
    const current = editorRef.current;
    if (!current || current.isDestroyed) return "";
    const { from, to } = current.state.selection;
    const text = current.state.doc.textBetween(from, to, "\n");
    return text.includes("\n") ? "" : text;
  };
  const openFind = (replace = false) =>
    setFindRequest((previous) => ({ query: selectedText() || previous?.query || "", replace, nonce: Date.now() }));
  const [settings, setSettings] = useState<Settings>(loadSettings);
  /** Toolbar switch: pauses the checker chosen in the settings without changing it. */
  const [spellingOn, toggleSpelling] = useSpellChecking(settings.spellChecker);
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [drawingControls, setDrawingControls] = useState<DrawingControls | null>(null);
  const [drawingTool, setDrawingTool] = useState("selection");
  const [mindmapControls, setMindmapControls] = useState<MindmapControls | null>(null);
  /** Light or dark, as displayed (the "system" setting follows macOS). */
  const systemDark = useSystemDark();
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;
  const [showOutline, setShowOutline] = usePersistentFlag("flownote:outline", false, ["shown", "hidden"]);
  const [showSlides, setShowSlides] = usePersistentFlag("flownote:slides", true, ["shown", "hidden"]);
  /** Presenting mode, from this slide. */
  const [presenting, setPresenting] = useState<number | null>(null);
  /** Outline set aside while the Git panel is open (the preference is kept). */
  const [outlineHidden, setOutlineHidden] = useState(false);
  // Git and the outline share the right edge: Git takes the place.
  const gitDrawer = useGitDrawer(() => setOutlineHidden(true));
  const { open: gitOpen, toggle: toggleGit } = gitDrawer;
  useEffect(() => {
    if (!gitOpen) setOutlineHidden(false);
  }, [gitOpen]);
  const toggleOutline = () => {
    if (outlineHidden || (showOutline && gitOpen)) {
      // Asking for the outline while Git covers it: Git closes.
      toggleGit(false);
      setOutlineHidden(false);
      if (!showOutline) setShowOutline(true);
      return;
    }
    if (!showOutline) toggleGit(false);
    setShowOutline((shown) => !shown);
  };
  const [sidebarOpen, setSidebarOpen] = usePersistentFlag("flownote:sidebar", true, ["shown", "hidden"]);
  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), [setSidebarOpen]);
  /** Hidden sidebar shown over the page while the pointer is near the left edge, like Notion. */
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<number>(undefined);
  const openPeek = () => {
    window.clearTimeout(peekTimer.current);
    setPeek(true);
  };
  const closePeekSoon = () => {
    window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => setPeek(false), 250);
  };
  const frontmatter = useRef<FrontmatterControl | null>(null);
  useEffect(() => applyTheme(settings.theme), [settings.theme]);
  // The desktop window is transparent so the sidebar can show the native macOS material.
  useEffect(() => {
    document.documentElement.classList.toggle("native-vibrancy", isTauri());
  }, []);

  // Visited pages of the active tab, for back/forward navigation.
  const back = useRef<string[]>([]);
  const forward = useRef<string[]>([]);

  // ---- Tabs: one page (or the dashboard) each; only the active tab has an editor. ----
  const [tabs, setTabs] = useState<Tab[]>(() => [{ id: newTabId(), path: null }]);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const [activeTab, setActiveTab] = useState(() => tabs[0].id);
  const activeRef = useRef(activeTab);
  /** Back/forward history and scroll position of the inactive tabs. */
  const tabState = useRef(new Map<string, { back: string[]; forward: string[]; scroll: number }>());
  const contentRef = useRef<HTMLElement>(null);
  const setTabPath = (id: string, path: string | null) => setTabs((list) => list.map((t) => (t.id === id ? { ...t, path } : t)));

  // Latest values for async callbacks.
  const noteRef = useRef(note);
  noteRef.current = note;
  const filesRef = useRef(files);
  filesRef.current = files;
  const images = useRef(new Map<string, string>());
  const saving = useRef<Promise<void>>(Promise.resolve());

  const dirty = note !== null && note.markdown !== note.disk;

  const refresh = useCallback(async (v: Vault) => {
    const [newTree, newFiles] = await Promise.all([v.tree(), v.files()]);
    setTree(newTree);
    setFiles(newFiles);
    filesRef.current = newFiles;
  }, []);

  const open = async (pending: Vault | null | Promise<Vault | null>) => {
    const opened = await pending;
    if (!opened) return;
    try {
      await refresh(opened);
      setConfig(parseObsidianConfig(await opened.obsidianConfig()));
      images.current.forEach((url) => URL.revokeObjectURL(url));
      images.current.clear();
      setVault(opened);
      setNote(null);
      // A vault opens on the dashboard, in a single tab (FLOWNOTE_OPEN opens a page, for debugging).
      const first = { id: newTabId(), path: null };
      tabState.current.clear();
      back.current = [];
      forward.current = [];
      activeRef.current = first.id;
      setTabs([first]);
      setActiveTab(first.id);
      const forced = isTauri() ? await invoke<string | null>("startup_note").catch(() => null) : null;
      if (forced) setPendingOpen(forced);
    } catch (error) {
      setStatus(`Impossible d'ouvrir le vault : ${String(error)}`);
    }
  };

  // In the desktop app, reopen the last vault on launch.
  useEffect(() => {
    if (isTauri()) void open(lastTauriVault());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshGit = useCallback(async () => {
    if (!vault?.git) return setGitChanges(null);
    try {
      const status = await vault.git.status();
      setGitChanges(status.isRepo ? status.files.length : null);
    } catch {
      setGitChanges(null);
    }
  }, [vault]);

  // The change counter follows edits made here and elsewhere (Obsidian, terminal).
  useEffect(() => {
    void refreshGit();
    const timer = window.setInterval(() => void refreshGit(), 10000);
    window.addEventListener("focus", refreshGit);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshGit);
    };
  }, [refreshGit]);

  /** Writes the open note if it changed. Saves are serialized. */
  const saveNow = useCallback(async () => {
    const run = async () => {
      const current = noteRef.current;
      if (!vault || !current || current.markdown === current.disk) return;
      try {
        await vault.write(current.path, current.markdown, current.disk);
        setNote((n) => (n && n.path === current.path ? { ...n, disk: current.markdown } : n));
        noteRef.current = { ...current, disk: current.markdown };
        setStatus("");
        void refreshGit();
        // The page tree shows icons read from the files: re-read it when the icon changed.
        if (noteIcon(current.markdown) !== noteIcon(current.disk) || isPresentationMarkdown(current.markdown) !== isPresentationMarkdown(current.disk)) void refresh(vault);
      } catch (error) {
        setStatus(error instanceof ConflictError ? `Conflit : ${error.message} Rechargez la note.` : String(error));
        throw error;
      }
    };
    saving.current = saving.current.then(run, run);
    return saving.current;
  }, [vault, refreshGit, refresh]);

  // Autosave, like Notion and Obsidian (can be turned off in the settings).
  useEffect(() => {
    if (!dirty || !settings.autosave) return;
    const timer = window.setTimeout(() => void saveNow().catch(() => {}), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [note?.markdown, dirty, saveNow, settings.autosave]);

  /** Shows a page (or the dashboard) in the active tab, without touching its history. */
  const load = useCallback(
    async (path: string | null): Promise<boolean> => {
      if (!vault) return false;
      if (path === null || isView(path)) {
        setNote(null);
        setTabPath(activeRef.current, path);
        setStatus("");
        return true;
      }
      let disk: string;
      try {
        disk = await vault.read(path);
      } catch (error) {
        setStatus(`Impossible d'ouvrir ${path} : ${String(error)}`);
        return false;
      }
      setNote({ path, loaded: disk, disk, markdown: disk });
      setTabPath(activeRef.current, path);
      setStatus("");
      recordRecentPage(vault.name, path);
      return true;
    },
    [vault],
  );

  /** Makes another tab active: its page is read again, its scroll position restored. */
  const activate = useCallback(
    async (id: string) => {
      const target = tabsRef.current.find((t) => t.id === id);
      if (!target) return;
      tabState.current.set(activeRef.current, { back: back.current, forward: forward.current, scroll: contentRef.current?.scrollTop ?? 0 });
      const saved = tabState.current.get(id) ?? { back: [], forward: [], scroll: 0 };
      back.current = saved.back;
      forward.current = saved.forward;
      activeRef.current = id;
      setActiveTab(id);
      await load(target.path);
      requestAnimationFrame(() => requestAnimationFrame(() => contentRef.current && (contentRef.current.scrollTop = saved.scroll)));
    },
    [load],
  );

  const switchTab = useCallback(
    async (id: string) => {
      if (id === activeRef.current) return;
      try {
        await saveNow();
      } catch {
        return; // keep the note open so the conflict can be resolved
      }
      await activate(id);
    },
    [saveNow, activate],
  );

  /** A new tab after the active one, with a page or the dashboard. */
  const newTab = useCallback(
    async (path: string | null = null) => {
      try {
        await saveNow();
      } catch {
        return;
      }
      const tab = { id: newTabId(), path };
      setTabs((list) => {
        const index = list.findIndex((t) => t.id === activeRef.current);
        return [...list.slice(0, index + 1), tab, ...list.slice(index + 1)];
      });
      tabsRef.current = [...tabsRef.current, tab];
      await activate(tab.id);
    },
    [saveNow, activate],
  );

  const closeTab = useCallback(
    async (id: string) => {
      const list = tabsRef.current;
      const index = list.findIndex((t) => t.id === id);
      if (index < 0) return;
      const closingActive = id === activeRef.current;
      if (closingActive) {
        try {
          await saveNow();
        } catch {
          return;
        }
      }
      tabState.current.delete(id);
      let remaining = list.filter((t) => t.id !== id);
      if (remaining.length === 0) remaining = [{ id: newTabId(), path: null }];
      tabsRef.current = remaining;
      setTabs(remaining);
      if (closingActive) {
        // The tab being closed keeps no state: the next one starts from its own.
        activeRef.current = id;
        await activate(remaining[Math.min(index, remaining.length - 1)].id);
      }
    },
    [saveNow, activate],
  );

  const reorderTab = (id: string, before: string | null) =>
    setTabs((list) => {
      const moved = list.find((t) => t.id === id);
      if (!moved) return list;
      const rest = list.filter((t) => t.id !== id);
      const index = before === null ? rest.length : rest.findIndex((t) => t.id === before);
      return [...rest.slice(0, index), moved, ...rest.slice(index)];
    });

  /** Opens a page: in the active tab (with history), in a new tab, or in the tab already showing it. */
  const select = useCallback(
    async (path: string, navigation: "push" | "history" = "push", newTabRequested = false) => {
      if (!vault) return;
      if (newTabRequested) return newTab(path);
      const elsewhere = tabsRef.current.find((t) => t.path === path && t.id !== activeRef.current);
      if (elsewhere && navigation === "push") return switchTab(elsewhere.id);
      try {
        await saveNow();
      } catch {
        return; // keep the note open so the conflict can be resolved
      }
      const previous = tabsRef.current.find((t) => t.id === activeRef.current)?.path ?? noteRef.current?.path;
      if (!(await load(path))) return;
      if (navigation === "push" && previous && previous !== path) {
        back.current.push(previous);
        forward.current = [];
      }
    },
    [vault, saveNow, load, newTab, switchTab],
  );

  useEffect(() => {
    if (!pendingOpen || !vault) return;
    setPendingOpen(null);
    void select(pendingOpen, "history");
  }, [pendingOpen, vault, select]);

  const goBack = useCallback(() => {
    const path = back.current.pop();
    if (!path) return;
    if (noteRef.current) forward.current.push(noteRef.current.path);
    void select(path, "history");
  }, [select]);

  const goForward = useCallback(() => {
    const path = forward.current.pop();
    if (!path) return;
    if (noteRef.current) back.current.push(noteRef.current.path);
    void select(path, "history");
  }, [select]);

  const cycleTab = (step: number) => {
    const list = tabsRef.current;
    const index = list.findIndex((t) => t.id === activeRef.current);
    const next = list[(index + step + list.length) % list.length];
    if (next) void switchTab(next.id);
  };

  // Application shortcuts (editor shortcuts live in the editor extensions).
  const shortcuts = useRef<(event: KeyboardEvent) => void>(() => {});
  shortcuts.current = (event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.code === "KeyF" && vault) {
      event.preventDefault();
      if (event.shiftKey) setModal("search");
      else if (noteRef.current && !rawModeRef.current) openFind(event.altKey);
      return;
    }
    if (event.altKey) return;
    const key = event.key.toLowerCase();
    const run = (action: () => void) => {
      event.preventDefault();
      action();
    };
    if (key === "s") run(() => void saveNow().catch(() => {}));
    else if (!vault) return;
    else if (key === "p" && event.shiftKey && presentationPageRef.current) run(() => present());
    else if (key === "p" || key === "k" || key === "o") run(() => setModal("switcher"));
    else if (key === "n" && !event.shiftKey) run(() => void newPage(null));
    else if (event.code === "BracketLeft" && event.shiftKey) run(() => cycleTab(-1));
    else if (event.code === "BracketRight" && event.shiftKey) run(() => cycleTab(1));
    else if (key === "[") run(goBack);
    else if (key === "]") run(goForward);
    else if (key === "t" && !event.shiftKey) run(() => void newTab(null));
    else if (key === "w" && !event.shiftKey) run(() => void closeTab(activeRef.current));
    else if (/^[1-9]$/.test(key) && !event.shiftKey) run(() => {
      const list = tabsRef.current;
      const target = key === "9" ? list[list.length - 1] : list[Number(key) - 1];
      if (target) void switchTab(target.id);
    });
    else if (key === "g" && event.shiftKey) run(() => toggleGit());
    else if (key === "l" && event.shiftKey) run(() => void openAddLink());
    else if (key === "/") run(() => setModal("help"));
    else if (key === ",") run(() => void select(SETTINGS_VIEW, "push"));
    else if (key === "\\") run(toggleSidebar);
    else if (key === "e" && event.shiftKey && noteRef.current) run(toggleRaw);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => shortcuts.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Re-reads the open note after a change on disk (pull, restore, Obsidian).
   * Unsaved edits are never overwritten: the difference is reported instead.
   */
  const reloadFromDisk = useCallback(async (force = false) => {
    const current = noteRef.current;
    if (!vault || !current) return;
    let disk: string;
    try {
      disk = await vault.read(current.path);
    } catch {
      return setStatus(`${current.path} n'existe plus sur le disque.`);
    }
    // `force`: the user asked for the disk version (changes discarded in the Git panel).
    if (disk === current.disk && (!force || disk === current.markdown)) return;
    if (!force && current.markdown !== current.disk) return setStatus("La note a changé sur le disque pendant que vous l'éditiez.");
    const reloaded = { path: current.path, loaded: disk, disk, markdown: disk, reloads: (current.reloads ?? 0) + 1 };
    noteRef.current = reloaded;
    setNote(reloaded);
  }, [vault]);

  // Back to the window: pick up changes made in Obsidian or by git (note content and page tree).
  useEffect(() => {
    const onFocus = () => {
      void reloadFromDisk();
      if (vault) void refresh(vault);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reloadFromDisk, vault, refresh]);

  const restoreVersion = async (content: string) => {
    const current = noteRef.current;
    if (!vault || !current) return;
    try {
      await saveNow();
      await vault.write(current.path, content, noteRef.current?.disk ?? current.disk);
      await reloadFromDisk();
      void refreshGit();
      setStatus("Version restaurée : elle apparaît comme une modification à commiter.");
    } catch (error) {
      setStatus(String(error));
    }
  };

  const askName = useCallback(
    (title: string, initial: string) => new Promise<string | null>((resolve) => setDialog({ title, initial, resolve: (r) => resolve(r?.name ?? null) })),
    [],
  );

  /** Every folder of the vault, for the "new page" dialog ("" is the root). */
  const folderChoices = () => {
    const folders = new Set<string>([""]);
    for (const file of filesRef.current) {
      const parts = file.split("/").slice(0, -1);
      parts.forEach((_, i) => folders.add(parts.slice(0, i + 1).join("/")));
    }
    // Empty folders are only in the tree.
    const walk = (entries: VaultEntry[]) => entries.forEach((e) => e.kind === "dir" && (folders.add(e.path), walk(e.children ?? [])));
    walk(tree);
    return [...folders].sort((a, b) => a.localeCompare(b, "fr"));
  };
  const askConfirm = (message: string, confirmLabel: string) => new Promise<boolean>((resolve) => setConfirm({ message, confirmLabel, resolve }));

  /**
   * Renames a page (and its sub-pages folder); links across the vault follow.
   * Tabs, history and the open note follow the new paths.
   */
  const renamePath = async (path: string, title: string): Promise<boolean> => {
    if (!vault) return false;
    try {
      await saveNow();
      const result = await renamePage(vault, path, title);
      // A base follows its rows' folder, renamed with it.
      if (isBasePath(path) && result.path !== path) {
        const text = await vault.read(result.path);
        const next = text.split(`file.inFolder(${JSON.stringify(subpageFolder(path))})`).join(`file.inFolder(${JSON.stringify(subpageFolder(result.path))})`);
        if (next !== text) await vault.write(result.path, next, text);
      }
      const oldFolder = `${subpageFolder(path)}/`;
      await followMoves((p) => (p === path ? result.path : p.startsWith(oldFolder) ? `${subpageFolder(result.path)}/${p.slice(oldFolder.length)}` : p), result.updatedNotes);
      moveRecentPage(vault.name, path, result.path);
      const others = result.updatedNotes.filter((p) => p !== result.path).length;
      setStatus(others > 0 ? `Page renommée ; liens mis à jour dans ${others} note${others > 1 ? "s" : ""}.` : "Page renommée.");
      void refreshGit();
      return true;
    } catch (error) {
      setStatus(String(error));
      return false;
    }
  };
  /**
   * After files moved (`moved` maps old paths to new ones): the tree, tabs,
   * history and the open note follow, and the open note is read again if its
   * links were rewritten.
   */
  const followMoves = async (moved: (path: string) => string, updatedNotes: string[]) => {
    if (!vault) return;
    await refresh(vault);
    back.current = back.current.map(moved);
    forward.current = forward.current.map(moved);
    setTabs((list) => list.map((t) => (t.path && !isView(t.path) ? { ...t, path: moved(t.path) } : t)));
    const current = noteRef.current;
    if (current && (moved(current.path) !== current.path || updatedNotes.includes(moved(current.path)))) {
      const openPath = moved(current.path);
      const disk = await vault.read(openPath);
      const reloaded = { path: openPath, loaded: disk, disk, markdown: disk, reloads: (current.reloads ?? 0) + 1 };
      noteRef.current = reloaded;
      setNote(reloaded);
    }
  };

  /** "Nouveau dossier": an empty folder in `parent` ("" is the vault root). */
  const newFolder = async (parent: string) => {
    if (!vault) return;
    const name = sanitizeName((await askName(parent ? "Nouveau sous-dossier" : "Nouveau dossier", "Sans titre")) ?? "");
    if (!name) return;
    try {
      await vault.createFolder(parent ? `${parent}/${name}` : name);
      await refresh(vault);
      setStatus("");
    } catch (error) {
      setStatus(String(error));
    }
  };

  /** Renames a folder; links to its pages and bases' folder filters follow. */
  const renameFolderPath = async (folder: string) => {
    if (!vault) return;
    const title = await askName("Renommer le dossier", folder.slice(folder.lastIndexOf("/") + 1));
    if (!title) return;
    try {
      await saveNow();
      const result = await renameFolder(vault, folder, title);
      if (result.path === folder) return;
      await followMoves((p) => (p.startsWith(`${folder}/`) ? result.path + p.slice(folder.length) : p), result.updatedNotes);
      moveRecentPage(vault.name, folder, result.path);
      const others = result.updatedNotes.filter((p) => !p.startsWith(`${result.path}/`)).length;
      setStatus(others > 0 ? `Dossier renommé ; liens mis à jour dans ${others} note${others > 1 ? "s" : ""}.` : "Dossier renommé.");
      void refreshGit();
    } catch (error) {
      setStatus(String(error));
    }
  };

  /** Drag and drop in the tree: a page (with its sub-pages) or a folder goes into `target` ("" is the root). */
  const moveItem = async (item: { path: string; folder: boolean }, target: string) => {
    if (!vault) return;
    try {
      await saveNow();
      const result = item.folder ? await moveFolder(vault, item.path, target) : await movePage(vault, item.path, target);
      if (result.path === item.path) return;
      const from = item.folder ? item.path : subpageFolder(item.path);
      const to = item.folder ? result.path : subpageFolder(result.path);
      await followMoves((p) => (p === item.path ? result.path : p.startsWith(`${from}/`) ? to + p.slice(from.length) : p), result.updatedNotes);
      moveRecentPage(vault.name, item.path, result.path);
      const where = target ? `« ${target.slice(target.lastIndexOf("/") + 1)} »` : "la racine";
      const others = result.updatedNotes.filter((p) => p !== result.path && !p.startsWith(`${to}/`)).length;
      setStatus(`${item.folder ? "Dossier déplacé" : "Page déplacée"} dans ${where}${others > 0 ? ` ; liens mis à jour dans ${others} note${others > 1 ? "s" : ""}` : ""}.`);
      void refreshGit();
    } catch (error) {
      setStatus(String(error));
    }
  };

  /** Removes a folder and everything in it, after confirmation. */
  const removeFolder = async (folder: string) => {
    if (!vault) return;
    const pages = filesRef.current.filter((f) => f.startsWith(`${folder}/`) && (f.endsWith(".md") || f.endsWith(".base"))).length;
    const others = filesRef.current.filter((f) => f.startsWith(`${folder}/`)).length - pages;
    const content = [pages ? `${pages} page${pages > 1 ? "s" : ""}` : "", others ? `${others} autre${others > 1 ? "s" : ""} fichier${others > 1 ? "s" : ""}` : ""].filter(Boolean).join(" et ");
    const where = isTauri() ? "Il ira dans la corbeille." : "Cette suppression est définitive.";
    const message = `Supprimer le dossier « ${folder.slice(folder.lastIndexOf("/") + 1)} »${content ? ` et son contenu (${content})` : ""} ? ${where}`;
    if (!(await askConfirm(message, "Supprimer"))) return;
    if (noteRef.current?.path.startsWith(`${folder}/`)) await saveNow().catch(() => {});
    try {
      await vault.remove(folder);
      setStatus("");
    } catch (error) {
      setStatus(String(error));
    }
    await forgetRemoved((p) => p.startsWith(`${folder}/`));
    moveRecentPage(vault.name, folder, null);
  };

  /** Renames the open page from its title. */
  const renameCurrent = (title: string) => (noteRef.current ? renamePath(noteRef.current.path, title) : Promise.resolve(false));

  const removePage = async (path: string) => {
    if (!vault) return;
    const children = subpagesOf(path, filesRef.current).length;
    const where = isTauri() ? "Elle ira dans la corbeille." : "Cette suppression est définitive.";
    const withChildren = children === 0 ? "" : children === 1 ? " et sa sous-page" : ` et ses ${children} sous-pages`;
    const message = `Supprimer « ${noteTitle(path)} »${withChildren} ? ${where}`;
    if (!(await askConfirm(message, "Supprimer"))) return;
    let failure: unknown = null;
    try {
      if (noteRef.current?.path === path) await saveNow().catch(() => {});
      await deletePage(vault, path, filesRef.current);
    } catch (error) {
      failure = error;
    }
    // Even after a partial failure: show what is left on disk, and leave the pages that are gone.
    const files = await forgetRemoved((p) => p === path || p.startsWith(`${subpageFolder(path)}/`));
    if (!files.includes(path)) moveRecentPage(vault.name, path, null);
    setStatus(failure ? String(failure) : "");
  };

  /**
   * After a deletion: the tree is read again, and tabs, history and the open
   * note leave the pages matching `removed` that are no longer on disk.
   */
  const forgetRemoved = async (removed: (path: string) => boolean): Promise<string[]> => {
    if (!vault) return [];
    const files = await vault.files().catch(() => filesRef.current);
    await refresh(vault);
    const gone = (p: string | null) => p !== null && !isView(p) && removed(p) && !files.includes(p);
    back.current = back.current.filter((p) => !gone(p));
    forward.current = forward.current.filter((p) => !gone(p));
    setTabs((list) => list.map((t) => (gone(t.path) ? { ...t, path: null } : t)));
    if (noteRef.current && gone(noteRef.current.path)) {
      noteRef.current = null;
      setNote(null);
    }
    void refreshGit();
    return files;
  };

  const createFile = useCallback(
    async (path: string, content: string | Uint8Array) => {
      if (!vault) return;
      await vault.create(path, content);
      filesRef.current = [...filesRef.current, path].sort();
      await refresh(vault);
    },
    [vault, refresh],
  );

  /**
   * "+ Nouvelle page" (asks for a name and a folder), "+" on a page (sub-page,
   * linked from its parent) or "+" on a folder (page inside it).
   */
  const newPage = async (parent: string | null, presetName?: string, inFolder?: string, initialKind?: PageKind) => {
    if (!vault) return;
    let name = presetName ?? null;
    let kind: PageKind = "note";
    let folder = parent ? subpageFolder(parent) : (inFolder ?? newNoteFolder("", config));
    if (!name) {
      const chooseFolder = !parent && inFolder === undefined;
      const result = await new Promise<NameResult | null>((resolve) =>
        setDialog({
          title: parent ? "Nom de la sous-page" : "Nouvelle page",
          initial: "Sans titre",
          folders: chooseFolder ? folderChoices() : undefined,
          folder,
          kinds: true,
          initialKind,
          resolve,
        }),
      );
      if (!result) return;
      name = result.name;
      kind = result.kind;
      if (chooseFolder) folder = result.folder;
    }
    const title = sanitizeName(name) || "Sans titre";
    // Tickets go to their folder, numbered: "Tickets/12 - Titre.md".
    const usedIds =
      kind === "ticket" ? await Promise.all([...ticketPaths].map((p) => vault.read(p).then((text) => ticketInfo(p, text).id ?? 0, () => 0))) : [];
    const ticketId = kind === "ticket" ? nextTicketId(filesRef.current, settings.ticketsFolder, usedIds) : 0;
    const path =
      kind === "ticket"
        ? uniquePath(settings.ticketsFolder, `${ticketId} - ${title}.md`, filesRef.current)
        : uniquePath(folder, `${title}${kind === "drawing" ? DRAWING_SUFFIX : kind === "mindmap" ? MINDMAP_SUFFIX : kind === "base" ? BASE_SUFFIX : ".md"}`, filesRef.current);
    try {
      await saveNow();
      // A base's rows are the notes of the folder named after it, next to it (like sub-pages).
      await createFile(path, kind === "base" ? newBaseFile(subpageFolder(path)) : kind === "drawing" ? newDrawingFile() : kind === "mindmap" ? newMindmapFile(title) : kind === "ticket" ? newTicketFile(ticketId) : kind === "presentation" ? newPresentationFile(title) : "");
      if (parent) {
        const content = await vault.read(parent);
        const separator = content === "" ? "" : content.endsWith("\n") ? "\n" : "\n\n";
        await vault.write(parent, `${content}${separator}[[${linkTextFor(path, filesRef.current)}]]\n`, content);
      }
      await select(path);
    } catch (error) {
      setStatus(String(error));
    }
  };

  const loadImage = useCallback(
    async (path: string) => {
      const cached = images.current.get(path);
      if (cached || !vault) return cached ?? "";
      const bytes = await vault.readBinary(path);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: imageMime(path) }));
      images.current.set(path, url);
      return url;
    },
    [vault],
  );

  const bridge: VaultBridge = {
    notePath: note?.path ?? "",
    // Read through a ref: callbacks may run between renders, after a file was created.
    get files() {
      return filesRef.current;
    },
    config,
    loadImage,
    openPath: (path, newTabRequested) => void select(path, "push", newTabRequested),
    askName,
    createFile,
    mountBase: (dom, path) => {
      if (!embedProps.current) return () => {};
      const mounted = mountBase(dom, path, embedProps.current);
      embeds.current.add(mounted);
      return () => {
        embeds.current.delete(mounted);
        mounted.unmount();
      };
    },
  };

  const onMarkdown = useCallback((markdown: string) => setNote((current) => (current ? { ...current, markdown } : current)), []);

  /** The open page is a drawing (Name.excalidraw.md). */
  const drawing = note !== null && isDrawingPath(note.path);
  /** The open page is a ticket (front matter type: ticket), read from the loaded text. */
  /** The open page is a mind map (Name.mindmap.md). */
  const mindmap = note !== null && isMindmapPath(note.path);
  /** The open page is a base (Name.base, Obsidian's format). */
  const basePage = note !== null && isBasePath(note.path);
  const ticketPage = note !== null && !drawing && !mindmap && !basePage && isTicketMarkdown(note.loaded);
  /** The open page is a presentation (`marp: true`), read from the current text so a conversion shows at once. */
  const presentationPage = note !== null && !drawing && !mindmap && !basePage && !ticketPage && isPresentationMarkdown(note.markdown);
  const slides = useSlides(presentationPage ? note.markdown : "", note?.path ?? "", files, loadImage, presentationPage);
  /** Bases embedded in the open note (`![[X.base]]`), rendered with the app's current files. */
  const embeds = useRef(new Set<ReturnType<typeof mountBase>>());
  const embedProps = useRef<EmbedProps | null>(null);
  embedProps.current = vault
    ? {
        vault,
        files,
        editable: note !== null && !hasConflictMarkers(note.disk),
        onOpen: (path, newTabRequested) => void select(path, "push", newTabRequested),
        onRenameRow: renamePath,
        onChanged: () => {
          void refresh(vault);
          void refreshGit();
        },
        loadImage,
      }
    : null;
  useEffect(() => {
    const props = embedProps.current;
    if (props) for (const embed of embeds.current) embed.update(props);
  }, [files, vault]);
  /** The vault's bases, to show a row's properties like a database page. */
  const [bases, setBases] = useState<RowBase[]>([]);
  const baseFiles = useMemo(() => files.filter(isBasePath).join("\n"), [files]);
  useEffect(() => {
    if (!vault || !baseFiles) return setBases([]);
    let live = true;
    void Promise.all(baseFiles.split("\n").map(async (path) => ({ path, model: parseBase(await vault.read(path)).model })))
      .then((list) => live && setBases(list))
      .catch(() => live && setBases([]));
    return () => {
      live = false;
    };
  }, [vault, baseFiles, note?.path]);
  const rowBase = note !== null && !drawing && !mindmap && !basePage && !ticketPage ? baseOfNote(note.path, bases) : null;
  /** Saves a select's options in the base file of the open row. */
  const setRowOptions = async (property: string, options: SelectOption[]) => {
    if (!vault || !rowBase) return;
    try {
      const text = await vault.read(rowBase.path);
      const file = parseBase(text);
      writeColumn(file, property, { ...columnInfo(file.model, property, []).meta, options });
      await vault.write(rowBase.path, serializeBase(file), text);
      setBases((list) => list.map((b) => (b.path === rowBase.path ? { ...b, model: parseBase(serializeBase(file)).model } : b)));
    } catch (error) {
      setStatus(String(error));
    }
  };
  const activePath = tabs.find((t) => t.id === activeTab)?.path ?? null;
  const ticketPaths = useMemo(() => {
    const found = new Set<string>();
    const walk = (entries: VaultEntry[]) => entries.forEach((e) => (e.ticket ? found.add(e.path) : e.children && walk(e.children)));
    walk(tree);
    return found;
  }, [tree]);

  const readingPath = settings.readingList || "Lectures.md";
  /** "Ajouter un lien": the dialog lists the themes and tags of the reading list. */
  const openAddLink = async () => {
    if (!vault) return;
    const text = await vault.read(readingPath).catch(() => "");
    const sections = parseReadingList(text);
    setReadingThemes(sections.flatMap((s) => (s.title ? [s.title] : [])));
    setReadingTags(readingTagsOf(sections));
    setModal("addLink");
  };
  /** Adds a link to the reading list note (created with its first link). */
  const addReading = async (theme: string | null, title: string, url: string, tags: string[]) => {
    if (!vault) return;
    const open = noteRef.current?.path === readingPath;
    if (open) await saveNow();
    // Created with its first link (a missing file may read as "" in some vaults).
    if (!filesRef.current.includes(readingPath)) await createFile(readingPath, newReadingList(theme, title, url, tags));
    else {
      const text = await vault.read(readingPath);
      await vault.write(readingPath, addLink(text, theme, title, url, tags), text);
    }
    if (open) await reloadFromDisk();
    setReadingVersion((v) => v + 1);
    void refreshGit();
  };

  /** Back to the welcome screen: recent vaults, or another folder. */
  const changeVault = () => {
    setModal(null);
    void saveNow()
      .catch(() => {})
      .then(() => {
        setVault(null);
        setNote(null);
        setStatus("");
      });
  };

  /** Shows the dashboard in the active tab; Back returns to the page. */
  const showHome = async () => {
    try {
      await saveNow();
    } catch {
      return;
    }
    const previous = tabsRef.current.find((t) => t.id === activeRef.current)?.path ?? null;
    if ((await load(null)) && previous && !isView(previous)) {
      back.current.push(previous);
      forward.current = [];
    }
  };

  /** Icon of the open page, live from its text (the tree is read from disk). */
  const liveIcon = note ? noteIcon(note.markdown) : null;
  const treeIcons = useMemo(() => {
    const found = new Map<string, string>();
    const walk = (entries: VaultEntry[]) => entries.forEach((e) => (e.icon && found.set(e.path, e.icon), e.children && walk(e.children)));
    walk(tree);
    return found;
  }, [tree]);
  const iconOf = (path: string) => (note?.path === path ? liveIcon : (treeIcons.get(path) ?? null));
  /** Presentations, from the tree (from the text for the open page: a conversion shows at once). */
  const presentationPaths = useMemo(() => {
    const found = new Set<string>();
    const walk = (entries: VaultEntry[]) => entries.forEach((e) => (e.presentation ? found.add(e.path) : e.children && walk(e.children)));
    walk(tree);
    return found;
  }, [tree]);
  const isPresentation = (path: string) => (note?.path === path ? presentationPage : presentationPaths.has(path));
  const pageIconFor = (path: string) => <PageIcon path={path} icon={iconOf(path)} ticket={ticketPaths.has(path)} presentation={isPresentation(path)} />;
  /** Presents from the slide under the cursor. */
  const present = () => {
    const current = editorRef.current;
    setPresenting(current && !current.isDestroyed ? slideAt(current.state.doc, current.state.selection.from) : 0);
  };
  const presentationPageRef = useRef(false);
  presentationPageRef.current = presentationPage;
  /** "Transformer en présentation": the note gets `marp: true`, its rules become slide breaks. */
  const convertToPresentation = () => {
    const control = frontmatter.current;
    if (control) control.set(setProperty(control.get(), "marp", true));
  };
  /** "Exporter en image": the whole map as a PNG. */
  const exportMindmap = async () => {
    const current = noteRef.current;
    if (!mindmapControls || !current) return;
    try {
      const blob = await mindmapControls.exportPng();
      if (!blob) return setStatus("Export impossible : image vide.");
      const { saveExport } = await import("./presentation/exportHtml");
      const where = await saveExport(blob, `${noteTitle(current.path)}.png`, "Image PNG", "png");
      if (where) setStatus(`Mind map exportée : ${where}`);
    } catch (error) {
      setStatus(`Export impossible : ${String(error)}`);
    }
  };
  const exportCurrent = async () => {
    const current = noteRef.current;
    if (!vault || !current) return;
    try {
      const { exportPresentation } = await import("./presentation/exportHtml");
      const where = await exportPresentation(current.markdown, noteTitle(current.path), current.path, filesRef.current, (path) => vault.readBinary(path));
      if (where) setStatus(`Présentation exportée : ${where}`);
    } catch (error) {
      setStatus(`Export impossible : ${String(error)}`);
    }
  };
  /** Sets or removes the page icon (the `icon` property of the open note). */
  const setPageIcon = (icon: string | null) => {
    const control = frontmatter.current;
    if (control) control.set(setProperty(control.get(), "icon", icon ?? undefined));
  };

  const saveState = <span className={dirty ? "save-state dirty" : "save-state"}>{dirty ? (settings.autosave ? "Enregistrement…" : keys("Non enregistré · ⌘S")) : "Enregistré"}</span>;

  if (!vault) {
    return (
      <Welcome
        recent={isTauri() ? recentTauriVaults() : []}
        onOpenVault={isTauri() ? () => void open(pickTauriVault()) : browserVaultSupported() ? () => void open(openBrowserVault()) : null}
        onOpenRecent={(root) => void open(openTauriVault(root))}
        onForgetRecent={forgetTauriVault}
        onTryDemo={() => void open(createMemoryVault("Démo", DEMO_FILES, DEMO_REMOTE))}
        status={status}
      />
    );
  }

  const sidebar = (
    <Sidebar
      vaultName={vault.name}
      tree={tree}
      ticketsFolder={settings.ticketsFolder}
      selected={note?.path}
      view={activePath === null ? "home" : activePath === TICKETS_VIEW ? "tickets" : activePath === GRAPH_VIEW ? "graph" : activePath === READING_VIEW ? "reading" : activePath === SETTINGS_VIEW ? "settings" : null}
      liveIcon={note ? { path: note.path, icon: liveIcon } : undefined}
      gitChanges={vault.git ? gitChanges : null}
      gitOpen={gitOpen}
      onSelect={(path, newTabRequested) => void select(path, "push", newTabRequested)}
      onNewPage={(parent) => void newPage(parent)}
      onNewPageInFolder={(folder) => void newPage(null, undefined, folder)}
      onDelete={(path) => void removePage(path)}
      onNewFolder={(parent) => void newFolder(parent)}
      onRenameFolder={(folder) => void renameFolderPath(folder)}
      onDeleteFolder={(folder) => void removeFolder(folder)}
      onMove={(item, target) => void moveItem(item, target)}
      onRename={(path) => void askName("Renommer la page", noteTitle(path)).then((name) => (name ? renamePath(path, name) : false))}
      onSearch={() => setModal("switcher")}
      onVaultSearch={() => setModal("search")}
      onHome={(newTabRequested) => void (newTabRequested ? newTab(null) : showHome())}
      onTickets={(newTabRequested) => void select(TICKETS_VIEW, "push", newTabRequested)}
      onGraph={(newTabRequested) => void select(GRAPH_VIEW, "push", newTabRequested)}
      onReading={(newTabRequested) => void select(READING_VIEW, "push", newTabRequested)}
      onGit={() => toggleGit()}
      onSettings={(newTabRequested) => void select(SETTINGS_VIEW, "push", newTabRequested)}
      onHelp={() => setModal("help")}
      onChangeVault={changeVault}
    />
  );

  return (
    <div className={`layout${sidebarOpen ? "" : " no-sidebar"}`}>
      <header className="titlebar" data-tauri-drag-region>
        <div className="titlebar-controls">
          <button
            className="titlebar-button"
            onClick={() => {
              setPeek(false);
              toggleSidebar();
            }}
            onMouseEnter={() => !sidebarOpen && openPeek()}
            onMouseLeave={() => !sidebarOpen && closePeekSoon()}
            aria-label={sidebarOpen ? "Masquer la barre latérale" : "Afficher la barre latérale"}
            title={keys(sidebarOpen ? "Masquer la barre latérale (⌘\\)" : "Afficher la barre latérale (⌘\\)")}
          >
            <Icon name="sidebar" size={16} />
          </button>
          <button className="titlebar-button" onClick={goBack} disabled={back.current.length === 0} aria-label="Page précédente" title={keys("Page précédente (⌘[)")}>
            <Icon name="chevronLeft" size={16} />
          </button>
          <button className="titlebar-button" onClick={goForward} disabled={forward.current.length === 0} aria-label="Page suivante" title={keys("Page suivante (⌘])")}>
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
        <TabBar
          tabs={tabs}
          active={activeTab}
          dirty={dirty}
          titleOf={(tab) => (tab.path === null ? "Accueil" : (VIEWS[tab.path]?.title ?? noteTitle(tab.path)))}
          iconOf={(tab) =>
            tab.path === null ? <Icon name="home" size={13} /> : isView(tab.path) ? <Icon name={VIEWS[tab.path].icon} size={13} /> : <PageIcon path={tab.path} icon={iconOf(tab.path)} ticket={ticketPaths.has(tab.path)} presentation={isPresentation(tab.path)} size={13} />
          }
          onSelect={(id) => void switchTab(id)}
          onClose={(id) => void closeTab(id)}
          onNew={() => void newTab(null)}
          onReorder={reorderTab}
        />
      </header>
      <div className="workspace">
        {sidebarOpen ? (
          <div className="sidebar-dock">{sidebar}</div>
        ) : (
          <>
            <div className="sidebar-hotzone" onMouseEnter={openPeek} onMouseLeave={closePeekSoon} />
            {peek && (
              <div className="sidebar-dock floating" onMouseEnter={openPeek} onMouseLeave={closePeekSoon}>
                {sidebar}
              </div>
            )}
          </>
        )}
        <main className="content" ref={contentRef}>
          <Toolbar
            left={
              note ? (
                <>
                  <Breadcrumbs vaultName={vault.name} path={note.path} files={files} onOpen={(path) => void select(path)} onRename={renameCurrent} />
                  {saveState}
                  {status && <span className="status warning">{status}</span>}
                </>
              ) : (
                <span className="toolbar-location">{activePath === null ? "Accueil" : (VIEWS[activePath]?.title ?? "")}</span>
              )
            }
            center={
              drawing && !rawMode ? (
                <ToolGroup>
                  {DRAWING_TOOLS.map(([tool, icon, label]) => (
                    <ToolButton key={tool} icon={icon} label={label} active={drawingTool === tool} disabled={!drawingControls} onClick={() => drawingControls?.setTool(tool)} />
                  ))}
                </ToolGroup>
              ) : null
            }
            right={
              note && (
                <div className="page-actions">
                  {mindmap && !rawMode && (
                    <>
                      <ToolButton icon="center" label="Ajuster la carte à la fenêtre" onClick={() => mindmapControls?.fit()} disabled={!mindmapControls} />
                      <ToolButton icon="export" label="Exporter en image (PNG)" onClick={() => void exportMindmap()} disabled={!mindmapControls} />
                    </>
                  )}
                  {!drawing && !mindmap && !basePage && <ToolButton icon="outline" label="Plan de la note" onClick={toggleOutline} active={showOutline && !outlineHidden} />}
                  {!drawing && !mindmap && !basePage && settings.spellChecker !== "off" && (
                    <ToolButton icon="spelling" label={spellingOn ? "Désactiver la correction orthographique" : "Activer la correction orthographique"} onClick={toggleSpelling} active={spellingOn} />
                  )}
                  {presentationPage && (
                  <>
                    <ToolButton icon="slides" label="Miniatures des diapos" onClick={() => setShowSlides(!showSlides)} active={showSlides} />
                    <ToolButton icon="play" label="Présenter (⌘⇧P)" onClick={() => present()} disabled={!slides} />
                    <ToolButton icon="export" label="Exporter en HTML" onClick={() => void exportCurrent()} />
                  </>
                )}
                {!drawing && !mindmap && !basePage && !ticketPage && !presentationPage && <ToolButton icon="slides" label="Transformer en présentation" onClick={convertToPresentation} />}
                {vault.git && gitChanges !== null && <ToolButton icon="clock" label="Historique de la note" onClick={() => setShowHistory(!showHistory)} active={showHistory} />}
                  <ToolButton icon="raw" label={drawing ? "Voir le fichier brut, JSON du dessin (⌘⇧E)" : mindmap ? "Voir le fichier brut de la mind map (⌘⇧E)" : basePage ? "Voir le fichier .base (⌘⇧E)" : "Mode Markdown brut (⌘⇧E)"} onClick={toggleRaw} active={rawMode} />
                </div>
              )
            }
          />
          {note ? (
            <>
              {findRequest && !rawMode && !drawing && !mindmap && !basePage && <FindBar editor={editor} request={findRequest} onClose={() => setFindRequest(null)} />}
              <div className="panes">
                {drawing && !rawMode ? (
                  <div className="drawing-pane">
                    <DrawingEditor
                      key={`${note.path}#${note.reloads ?? 0}`}
                      source={note.loaded}
                      onMarkdown={onMarkdown}
                      bridge={bridge}
                      theme={settings.theme === "dark" || (settings.theme === "system" && systemDark) ? "dark" : "light"}
                      editable={!hasConflictMarkers(note.disk)}
                      onControls={setDrawingControls}
                      onToolChange={setDrawingTool}
                    />
                  </div>
                ) : basePage && !rawMode ? (
                  <BaseView
                    key={`${note.path}#${note.reloads ?? 0}`}
                    vault={vault}
                    files={files}
                    path={note.path}
                    source={note.markdown}
                    editable={!hasConflictMarkers(note.disk)}
                    onSource={onMarkdown}
                    onOpen={(path, newTabRequested) => void select(path, "push", newTabRequested)}
                    onRenameRow={renamePath}
                    loadImage={loadImage}
                    onChanged={() => {
                      void refresh(vault);
                      void refreshGit();
                    }}
                  />
                ) : mindmap && !rawMode ? (
                  <div className="drawing-pane">
                    <MindmapEditor
                      key={`${note.path}#${note.reloads ?? 0}`}
                      source={note.loaded}
                      onMarkdown={onMarkdown}
                      title={noteTitle(note.path)}
                      theme={settings.theme === "dark" || (settings.theme === "system" && systemDark) ? "dark" : "light"}
                      editable={!hasConflictMarkers(note.disk)}
                      onControls={setMindmapControls}
                    />
                  </div>
                ) : (
                <div className={presentationPage ? "page presentation-page" : "page"}>
                  {hasConflictMarkers(note.disk) && (
                    <div className="conflict-note-banner">
                      <span>Cette note contient un conflit de fusion : elle est en lecture seule jusqu'à sa résolution.</span>
                      {vault.git && <button onClick={() => toggleGit(true)}>Résoudre</button>}
                    </div>
                  )}
                  {!rawMode && !ticketPage && (
                    <PageTitle
                      title={noteTitle(note.path)}
                      onRename={renameCurrent}
                      readOnly={hasConflictMarkers(note.disk)}
                      icon={drawing ? undefined : liveIcon}
                      onIcon={drawing ? undefined : setPageIcon}
                    />
                  )}
                  {ticketPage && !rawMode ? (
                    <TicketView
                      key={`${note.path}#${note.reloads ?? 0}`}
                      path={note.path}
                      source={note.loaded}
                      markdown={note.markdown}
                      onMarkdown={onMarkdown}
                      bridge={bridge}
                      editable={!hasConflictMarkers(note.disk)}
                      onEditor={setEditor}
                      columns={settings.ticketColumns}
                    />
                  ) : rawMode ? (
                    <RawEditor key={`${note.path}#${note.reloads ?? 0}`} value={note.markdown} onChange={onMarkdown} readOnly={hasConflictMarkers(note.disk)} />
                  ) : (
                    <NoteEditor
                      key={`${note.path}#${note.reloads ?? 0}`}
                      source={note.loaded}
                      onMarkdown={onMarkdown}
                      bridge={bridge}
                      editable={!hasConflictMarkers(note.disk)}
                      onEditor={setEditor}
                      frontmatterControl={frontmatter}
                      hiddenProperties={rowBase ? ["icon", ...baseProperties(rowBase.model)] : ["icon"]}
                      header={
                        rowBase
                          ? (raw, set) => (
                              <RowProperties
                                base={rowBase}
                                path={note.path}
                                raw={raw}
                                editable={!hasConflictMarkers(note.disk)}
                                onChange={set}
                                onOptions={(property, options) => void setRowOptions(property, options)}
                                onOpen={(path, newTabRequested) => void select(path, "push", newTabRequested)}
                              />
                            )
                          : undefined
                      }
                    />
                  )}
                </div>
                )}
                {showOutline && !outlineHidden && !rawMode && !drawing && !mindmap && !basePage && <OutlinePanel editor={editor} onClose={toggleOutline} />}
              {presentationPage && showSlides && !rawMode && <SlidesPanel editor={editor} rendered={slides} onPresent={(index) => setPresenting(index)} onClose={() => setShowSlides(false)} />}
                {showHistory && vault.git && (
                  <HistoryPanel git={vault.git} path={note.path} current={note.disk} onRestore={restoreVersion} onClose={() => setShowHistory(false)} />
                )}
              </div>
            </>
          ) : (
            activePath === SETTINGS_VIEW ? (
              <SettingsPage
                key={activeTab}
                settings={settings}
                vaultName={vault.name}
                grammarAvailable={isTauri()}
                onChange={(next) => {
                  setSettings(next);
                  saveSettings(next);
                }}
                onChangeVault={changeVault}
              />
            ) : activePath === READING_VIEW ? (
              <ReadingView
                key={activeTab}
                vault={vault}
                path={readingPath}
                version={readingVersion}
                onAdd={() => void openAddLink()}
                onOpenNote={(path, newTabRequested) => void select(path, "push", newTabRequested)}
                onChanged={() => void refreshGit()}
              />
            ) : activePath === GRAPH_VIEW ? (
              <GraphPage key={activeTab} vault={vault} files={files} onOpen={(path, newTabRequested) => void select(path, "push", newTabRequested)} />
            ) : activePath === TICKETS_VIEW ? (
              <TicketsView
                key={activeTab}
                vault={vault}
                files={files}
                columns={settings.ticketColumns}
                onChanged={() => {
                  void refreshGit();
                  void refresh(vault);
                }}
                onOpen={(path, newTabRequested) => void select(path, "push", newTabRequested)}
                onCreate={() => void newPage(null, undefined, undefined, "ticket")}
              />
            ) : (
            <Dashboard
              key={activeTab}
              vault={vault}
              files={files}
              iconOf={pageIconFor}
              onOpen={(path, newTabRequested) => void select(path, "push", newTabRequested)}
              onCreate={(kind) => void newPage(null, undefined, undefined, kind)}
              onOpenGit={() => toggleGit(true)}
              onSearch={() => setModal("switcher")}
              onOpenTickets={(newTabRequested) => void select(TICKETS_VIEW, "push", newTabRequested)}
              onOpenGraph={(newTabRequested) => void select(GRAPH_VIEW, "push", newTabRequested)}
              readingList={readingPath}
              readingVersion={readingVersion}
              onOpenReading={(newTabRequested) => void select(READING_VIEW, "push", newTabRequested)}
              onAddLink={() => void openAddLink()}
            />
            )
          )}
        </main>
        {vault.git && (
          <GitDrawer drawer={gitDrawer}>
            <GitPanel
              git={vault.git}
              beforeCommit={saveNow}
              onOpenNote={(path) => void select(path)}
              onChanged={() => {
                void refreshGit();
                void refresh(vault);
              }}
              onPulled={() => {
                void refresh(vault);
                void reloadFromDisk();
              }}
              onDiscarded={(paths) => {
                void refresh(vault);
                const current = noteRef.current;
                if (!current || !paths.includes(current.path)) return;
                // A new note sent to the trash is closed; a modified one shows its restored version.
                void vault.read(current.path).then(
                  () => reloadFromDisk(true),
                  () => setNote(null),
                );
              }}
            />
          </GitDrawer>
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onDone={(ok) => {
            confirm.resolve(ok);
            setConfirm(null);
          }}
        />
      )}
      {modal === "switcher" && (
        <QuickSwitcher files={files} iconOf={pageIconFor} onOpen={(path) => void select(path)} onCreate={(name) => void newPage(null, name)} onClose={() => setModal(null)} />
      )}
      {modal === "search" && (
        <VaultSearch
          vault={vault}
          initialQuery={findRequest?.query ?? selectedText()}
          onOpen={(hit, occurrence, query) => {
            setRawMode(false);
            void select(hit.path).then(() => setFindRequest({ query, occurrence, nonce: Date.now() }));
          }}
          onClose={() => setModal(null)}
        />
      )}
      {presenting !== null && slides && presentationPage && <Presenter rendered={slides} start={presenting} onClose={() => setPresenting(null)} />}
      {modal === "help" && <ShortcutsHelp onClose={() => setModal(null)} />}
      {modal === "addLink" && <AddLinkDialog themes={readingThemes} tags={readingTags} fetchTitles={settings.fetchTitles} onAdd={addReading} onClose={() => setModal(null)} />}
      {dialog && (
        <NameDialog
          title={dialog.title}
          initial={dialog.initial}
          folders={dialog.folders}
          folder={dialog.folder}
          kinds={dialog.kinds}
          initialKind={dialog.initialKind}
          onDone={(result) => {
            dialog.resolve(result);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
