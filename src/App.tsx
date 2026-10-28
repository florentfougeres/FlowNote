import { pageBarMenu, rawLabel, tabMenu as tabMenuOf } from "./menus";
import type { FileTimes, PageSort } from "./pageSort";
import { isMergeable } from "./vault/merge";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keys } from "./keys";
import { NoteEditor } from "./editor/NoteEditor";
import { imageMime, NULL_BRIDGE, type VaultBridge } from "./editor/bridge";
import { DocsPage } from "./docs/DocsPage";
import { ChoiceDialog, ConfirmDialog, NameDialog, type Choice, type NameResult, type PageKind, type TemplateChoice } from "./Dialogs";
import { isDrawingPath } from "./drawing/format";
import { DrawingEditor, type DrawingControls } from "./drawing/DrawingEditor";
import { DRAWING_TOOLS } from "./drawing/tools";
import { isMindmapPath } from "./mindmap/format";
import { isCanvasPath } from "./canvas/format";
import { isDashboardPath } from "./dashboardPage/format";
import { DashboardBoard } from "./dashboardPage/DashboardBoard";
import { KanbanPage } from "./kanban/KanbanPage";
import { isKanbanMarkdown } from "./kanban/format";
import { CanvasEditor } from "./canvas/CanvasEditor";
import { MindmapEditor, type MindmapControls } from "./mindmap/MindmapEditor";
import { isBasePath, parseBase, serializeBase, writeColumn, type SelectOption } from "./base/baseFile";
import { BaseView } from "./base/BaseView";
import { baseOfNote, baseProperties, RowProperties, type RowBase } from "./base/RowProperties";
import { columnInfo } from "./base/columns";
import { mountBase, type EmbedProps } from "./base/EmbeddedBase";
import { PageTitle } from "./PageTitle";
import { setTitleHeading, titleHeadingOf } from "./editor/titleHeading";
import { QuickSwitcher } from "./QuickSwitcher";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { Titlebar } from "./Titlebar";
import { usePageOps } from "./hooks/usePageOps";
import { useGitBase } from "./hooks/useGitBase";
import { globalAction, shortcutOf, type GlobalAction } from "./shortcuts";
import { CommandPalette, type Command } from "./CommandPalette";
import { NEW_PAGE_KINDS } from "./pageKinds";
import { applyLook, applyTheme, applyScale, loadSettings, saveSettings, SettingsPage, type Settings } from "./SettingsPage";
import { PageIcon, PopoverMenu, Sidebar } from "./Sidebar";
import { Icon, type IconName } from "./Icon";
import { GraphPage } from "./graph/GraphPage";
import { ReadingView } from "./reading/ReadingView";
import { AddLinkDialog } from "./reading/AddLinkDialog";
import { addLink, newReadingList, parseReadingList, readingTagsOf } from "./reading/readingList";
import { noteIcon, pageTitle } from "./vault/icon";
import { setProperty } from "./markdown/frontmatter";
import { headingRename, newBlockId, noteBlocks } from "./markdown/sections";
import { renameHeadingLinks } from "./vault/pageOps";
import type { FrontmatterControl } from "./editor/NoteEditor";
import { GitPanel } from "./GitPanel";
import { ToolButton, ToolGroup, Toolbar } from "./Toolbar";
import { Backlinks } from "./Backlinks";
import { withNoteCache, type CachedVault } from "./vault/noteCache";
import { exportNoteHtml } from "./editor/copyHtml";
import { Breadcrumbs } from "./Breadcrumbs";
import { OutlinePanel } from "./OutlinePanel";
import { RawEditor } from "./RawEditor";
import { FindBar, type FindRequest } from "./FindBar";
import { VaultSearch } from "./VaultSearch";
import { useSpellChecking } from "./editor/useSpellChecking";
import type { Editor } from "@tiptap/core";
import { HistoryPanel } from "./HistoryPanel";
import { browserVaultSupported, ConflictError, createMemoryVault, openBrowserVault, readAllNotes, type Vault, type VaultEntry } from "./vault/vault";
import { setTaskDone } from "./query/pages";
import { DEFAULT_CONFIG, dirname, noteTitle, parseObsidianConfig, type ObsidianConfig } from "./vault/links";
import { readTemplatesConfig, templateBody, templateFiles, templateName, type TemplatesConfig } from "./vault/templates";
import { DEMO_FILES, DEMO_REMOTE } from "./demo";
import { GitDrawer, useGitDrawer } from "./GitDrawer";
import { usePersistentFlag } from "./hooks/usePersistentFlag";
import { useWidePages } from "./hooks/useWidePages";
import { useHandlers } from "./hooks/useHandlers";
import { useSplitWidth } from "./hooks/useSplitWidth";
import { useSidebarPeek } from "./hooks/useSidebarPeek";
import { exportMindmapPng, exportPdf, exportSlidesHtml, type ExportedPage } from "./pageExport";
import { useSystemDark } from "./hooks/useSystemDark";
import { hasConflictMarkers } from "./vault/conflicts";
import { currentTauriVault, forgetTauriVault, isTauri, lastTauriVault, openTauriVault, pickTauriVault, recentTauriVaults } from "./vault/tauriVault";
import { Welcome } from "./Welcome";
import { TabBar } from "./TabBar";
import { joinTab as joinTabs, newTabId, nextPageTab, separateTab as separateTabs, swapReading, withReading } from "./tabs";
import { useTabs } from "./hooks/useTabs";
import { Dashboard } from "./Dashboard";
import { TaskView } from "./tasks/TaskView";
import { readTaskConfig, taskViewTitle, type TaskConfig } from "./tasks/config";
import { isTaskMarkdown, tasksOf } from "./tasks/task";
import { defaultViewFile } from "./tasks/views";
import { isPresentationMarkdown } from "./presentation/format";
import { slideAt, useSlides } from "./presentation/useSlides";
import { SlidesPanel } from "./presentation/SlidesPanel";
import { Presenter } from "./presentation/Presenter";
import { SplitPane } from "./SplitPane";
import { recordRecentPage } from "./dashboard/recents";
import { countWords, readingMinutes } from "./markdown/wordCount";
import { bookmarkedFiles, noteAliases, noteTags, tagTree, type TagNode } from "./dashboard/stats";
import type { SearchFilter } from "./vault/searchFilters";
import { invoke } from "@tauri-apps/api/core";
import { isoDay } from "./dates";

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

/** Pseudo-path of the vault graph. */
const GRAPH_VIEW = "flownote:graph";
/** Pseudo-path of the reading list view. */
const READING_VIEW = "flownote:reading";
/** Pseudo-path of the settings page. */
const SETTINGS_VIEW = "flownote:settings";
/** Pseudo-path of the documentation (a read-only note shipped with the app). */
const DOCS_VIEW = "flownote:docs";
/** Views shown in a tab instead of a page. */
const VIEWS: Record<string, { title: string; icon: IconName }> = {
  [GRAPH_VIEW]: { title: "Graphe", icon: "graph" },
  [READING_VIEW]: { title: "Liens", icon: "bookmark" },
  [SETTINGS_VIEW]: { title: "Réglages", icon: "sliders" },
  [DOCS_VIEW]: { title: "Documentation", icon: "book" },
};
const isView = (path: string | null) => path !== null && path in VIEWS;

interface Dialog {
  title: string;
  initial: string;
  folders?: string[];
  folder?: string;
  kinds?: boolean;
  initialKind?: PageKind;
  templates?: TemplateChoice[];
  resolve: (result: NameResult | null) => void;
}

interface Confirm {
  message: string;
  confirmLabel: string;
  /** A box to tick in the dialog (ticked at first). */
  option?: string;
  resolve: (confirmed: boolean, option: boolean) => void;
}

const AUTOSAVE_DELAY_MS = 700;

export function App() {
  const [vault, setVault] = useState<Vault | null>(null);
  const [tree, setTree] = useState<VaultEntry[]>([]);
  /** Obsidian's bookmarked files (.obsidian/bookmarks.json), shown as favorites. */
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  /** Obsidian's templates settings (.obsidian/templates.json), null when no folder is set: templates are then hidden. */
  const [templatesConfig, setTemplatesConfig] = useState<TemplatesConfig | null>(null);
  /** The TaskNotes plugin's settings (its data.json, "{}" without the plugin): how tasks are written. */
  const [tasksJson, setTasksJson] = useState("{}");
  const taskConfig = useMemo(() => readTaskConfig(tasksJson), [tasksJson]);
  /** The notes that are tasks, for their icon. */
  const [taskPaths, setTaskPaths] = useState<Set<string>>(new Set());
  /** `/modèle`: the template list shown, until one is chosen. */
  /** A file to choose in a list (a template, the note to merge into). */
  const [choicePick, setChoicePick] = useState<(Choice & { resolve: (path: string | null) => void }) | null>(null);
  const askChoice = (choice: Choice) => new Promise<string | null>((resolve) => setChoicePick({ ...choice, resolve }));
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
  /** A passing message ("Lien copié"…), shown a few seconds in the status pill; errors stay in `status`. */
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const notify = useCallback((text: string) => {
    setStatus("");
    setNotice({ text, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  /** Typing: the status pill fades until the pointer moves. */
  const [typing, setTyping] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [gitChanges, setGitChanges] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [modal, setModalState] = useState<"switcher" | "palette" | "help" | "search" | "addLink" | null>(null);
  /** The text carried from one search to the other ("Titres | Contenu"); dropped when a dialog opens on its own. */
  const [scopeQuery, setScopeQuery] = useState<string | undefined>(undefined);
  const setModal = useCallback((next: "switcher" | "palette" | "help" | "search" | "addLink" | null) => {
    setScopeQuery(undefined);
    setModalState(next);
  }, []);
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
  const gitBase = useGitBase(vault?.git, note?.path, settings.gitGutter && !rawMode, gitChanges);
  /** Toolbar switch: pauses the checker chosen in the settings without changing it. */
  const [spellingOn, toggleSpelling] = useSpellChecking(settings.spellChecker);
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  /** Words and characters of the text selected in the note, for the status pill. */
  const [selectionCount, setSelectionCount] = useState<{ words: number; chars: number } | null>(null);
  useEffect(() => {
    setSelectionCount(null);
    if (!editor) return;
    const update = () => {
      const { from, to, empty } = editor.state.selection;
      const text = empty ? "" : editor.state.doc.textBetween(from, to, "\n", " ");
      setSelectionCount(text.trim() ? { words: countWords(text), chars: [...text.replace(/\n/g, "")].length } : null);
    };
    editor.on("selectionUpdate", update);
    return () => {
      editor.off("selectionUpdate", update);
    };
  }, [editor]);
  const [drawingControls, setDrawingControls] = useState<DrawingControls | null>(null);
  const [drawingTool, setDrawingTool] = useState("selection");
  const [mindmapControls, setMindmapControls] = useState<MindmapControls | null>(null);
  /** Light or dark, as displayed (the "system" setting follows macOS). */
  const systemDark = useSystemDark();
  const dark = settings.theme === "dark" || (settings.theme === "system" && systemDark);
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
  /** Focus mode: no sidebar, tabs and page bar faded until the pointer comes back. */
  const [focusMode, setFocusMode] = useState(false);
  const toggleFocus = useCallback(() => setFocusMode((on) => !on), []);
  // Escape leaves focus mode, unless it is closing something (a menu, a dialog, a suggestion list).
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector(".modal-backdrop, .block-menu, .sidebar-menu, .slash-menu, .grammar-popover, .find-bar, .name-dialog")) return;
      setFocusMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);
  const [widePages, toggleWide, followWide] = useWidePages();
  /** Hidden sidebar shown over the page while the pointer is near the left edge. */
  const { peek, setPeek, openPeek, closePeekSoon } = useSidebarPeek();
  const frontmatter = useRef<FrontmatterControl | null>(null);
  useEffect(() => applyTheme(settings.theme, isTauri()), [settings.theme]);
  useEffect(() => applyScale(settings.uiScale, isTauri()), [settings.uiScale]);
  useEffect(() => applyLook(settings.font, settings.noteFont, settings.blockMenu), [settings.font, settings.noteFont, settings.blockMenu]);
  // The macOS window is transparent so the sidebar can show the native material
  // (on Linux the window is opaque, with the system title bar).
  useEffect(() => {
    document.documentElement.classList.toggle("native-vibrancy", isTauri() && navigator.userAgent.includes("Mac"));
  }, []);

  /** Writes the right side's pending changes. */
  const splitSaver = useRef<(() => Promise<void>) | null>(null);
  // ---- Tabs: one page (or the dashboard) each; only the active tab has an editor. ----
  const {
    tabs,
    activeTab,
    tabsRef,
    activeRef,
    contentRef,
    canBack,
    canForward,
    splitOf,
    replaceTabs,
    setTabSplit,
    restore: restoreTabs,
    select,
    switchTab,
    newTab,
    closeTab,
    closeTabs,
    forgetTab,
    reorderTab,
    goBack,
    goForward,
    cycleTab,
    openView,
    followMoves: tabsFollowMoves,
    forgetPages,
  } = useTabs({
    vault,
    show: (path) => showPage(path),
    saveNow: () => saveNow(),
    splitSaver,
    openPath: () => noteRef.current?.path ?? null,
    isView,
  });
  const [tabMenu, setTabMenu] = useState<{ id: string; anchor: DOMRect } | null>(null);
  const [splitWidth, startSplitResize] = useSplitWidth();

  // Latest values for async callbacks.
  const noteRef = useRef(note);
  noteRef.current = note;
  const filesRef = useRef(files);
  filesRef.current = files;
  const images = useRef(new Map<string, string>());
  const saving = useRef<Promise<void>>(Promise.resolve());

  const dirty = note !== null && note.markdown !== note.disk;

  /** Creation and modification times of the pages, for sorting the sidebar's tree. */
  const [fileTimes, setFileTimes] = useState<FileTimes>(new Map());
  /** The vault's tags, nested, for the sidebar's "Tags" section. */
  const [tags, setTags] = useState<TagNode[]>([]);
  const refreshTags = useCallback(async (v: Vault) => setTags(tagTree(await readAllNotes(v, filesRef.current))), []);
  /** Filters the vault search opens with (a tag clicked in the sidebar). */
  const [searchFilters, setSearchFilters] = useState<SearchFilter[]>([]);

  const refresh = useCallback(async (v: Vault) => {
    const [newTree, newFiles, bookmarksJson, templatesJson, tasksSettings, stats] = await Promise.all([
      v.tree(),
      v.files(),
      v.bookmarks?.().catch(() => "{}") ?? "{}",
      v.templatesConfig?.().catch(() => "{}") ?? "{}",
      v.tasksConfig?.().catch(() => "{}") ?? "{}",
      v.stats?.().catch(() => []) ?? [],
    ]);
    setFileTimes(new Map(stats.map((s) => [s.path, s])));
    setTemplatesConfig(readTemplatesConfig(templatesJson));
    setTasksJson(tasksSettings);
    setTree(newTree);
    setFiles(newFiles);
    filesRef.current = newFiles;
    setBookmarks(bookmarkedFiles(bookmarksJson).filter((p) => newFiles.includes(p)));
    void refreshTags(v);
  }, [refreshTags]);

  const open = async (pending: Vault | null | Promise<Vault | null>) => {
    const picked = await pending;
    if (!picked) return;
    // The views reading every note (dashboard, graph, tasks, bases, backlinks) share one copy of them.
    const opened = withNoteCache(picked);
    try {
      await refresh(opened);
      setConfig(parseObsidianConfig(await opened.obsidianConfig()));
      images.current.forEach((url) => URL.revokeObjectURL(url));
      images.current.clear();
      setVault(opened);
      setNote(null);
      // A vault opens on the tabs it had when it was left, or on the dashboard (FLOWNOTE_OPEN opens a page, for debugging).
      const active = restoreTabs(opened.name, (path) => isView(path) || filesRef.current.includes(path));
      const forced = isTauri() ? await invoke<string | null>("startup_note").catch(() => null) : null;
      if (forced ?? active.path) setPendingOpen(forced ?? active.path);
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

  /** A heading renamed in a saved note: the links to it in the other notes follow, like in Obsidian. */
  const followHeadingRename = useCallback(
    (path: string, before: string, after: string) => {
      const renamed = headingRename(before, after);
      if (!vault || !renamed) return;
      const open = [noteRef.current?.path, tabsRef.current.find((t) => t.id === activeRef.current)?.split].filter((p): p is string => !!p);
      renameHeadingLinks(vault, filesRef.current, path, renamed.from, renamed.to, open)
        .then((updated) => updated.length > 0 && notify(`Liens vers « ${renamed.to} » mis à jour dans ${updated.length} note${updated.length > 1 ? "s" : ""}`))
        .catch((error: unknown) => setStatus(`Liens vers « ${renamed.to} » : ${String(error)}`));
    },
    [vault, notify, tabsRef, activeRef],
  );

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
        followHeadingRename(current.path, current.disk, current.markdown);
        if (noteTags(current.markdown).join() !== noteTags(current.disk).join()) void refreshTags(vault);
        // The page tree shows icons read from the files: re-read it when the icon changed.
        if (noteIcon(current.markdown) !== noteIcon(current.disk) || isPresentationMarkdown(current.markdown) !== isPresentationMarkdown(current.disk)) void refresh(vault);
      } catch (error) {
        setStatus(error instanceof ConflictError ? `Conflit : ${error.message} Rechargez la note.` : String(error));
        throw error;
      }
    };
    saving.current = saving.current.then(run, run);
    return saving.current;
  }, [vault, refreshGit, refresh, followHeadingRename, refreshTags]);

  // Autosave (can be turned off in the settings).
  useEffect(() => {
    if (!dirty || !settings.autosave) return;
    const timer = window.setTimeout(() => void saveNow().catch(() => {}), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [note?.markdown, dirty, saveNow, settings.autosave]);

  /** Shows a page (or a view, or the dashboard) in the editor area; the tabs say where. */
  const showPage = async (path: string | null): Promise<boolean> => {
    if (!vault) return false;
    if (path === null || isView(path)) {
      setNote(null);
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
    setStatus("");
    recordRecentPage(vault.name, path);
    return true;
  };

  useEffect(() => {
    if (!pendingOpen || !vault) return;
    setPendingOpen(null);
    void select(pendingOpen, "history");
  }, [pendingOpen, vault, select]);

  // Application shortcuts (editor shortcuts live in the editor extensions).
  const shortcuts = useRef<(event: KeyboardEvent) => void>(() => {});
  shortcuts.current = (event: KeyboardEvent) => {
    const action = globalAction(event);
    // Without a vault, only ⌘S does something.
    if (!action || (!vault && action !== "save")) return;
    const findable = noteRef.current !== null && !rawModeRef.current;
    /** What each shortcut runs (shortcuts.ts); false: nothing to do here, the key goes on. */
    const actions: Record<GlobalAction, () => boolean | void> = {
      switcher: () => setModal("switcher"),
      palette: () => setModal("palette"),
      present: () => (presentationPageRef.current ? present() : setModal("switcher")),
      newPage: () => void newPage(null),
      back: goBack,
      forward: goForward,
      newTab: () => void newTab(null),
      closeTab: () => void closeTab(activeRef.current),
      previousTab: () => cycleTab(-1),
      nextTab: () => cycleTab(1),
      goToTab: () => {
        const list = tabsRef.current;
        const target = event.key === "9" ? list[list.length - 1] : list[Number(event.key) - 1];
        if (target) void switchTab(target.id);
      },
      split: () => toggleSplit(),
      git: () => toggleGit(),
      addLink: () => void openAddLink(),
      find: () => void (findable && openFind(false)),
      replace: () => void (findable && openFind(true)),
      vaultSearch: () => {
        setSearchFilters([]);
        setModal("search");
      },
      raw: () => (noteRef.current ? toggleRaw() : false),
      reading: () => (readable ? toggleReading() : false),
      focus: toggleFocus,
      save: () => void saveNow().catch(() => {}),
      settings: () => void select(SETTINGS_VIEW, "push"),
      help: () => setModal("help"),
      sidebar: toggleSidebar,
    };
    if (actions[action]() !== false) event.preventDefault();
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
      // Files may have changed in Obsidian or through git: the notes are read again when needed.
      (vault as CachedVault | null)?.clearNoteCache?.();
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
      notify("Version restaurée : elle apparaît comme une modification à commiter.");
    } catch (error) {
      setStatus(String(error));
    }
  };

  const askName = useCallback(
    (title: string, initial: string) => new Promise<string | null>((resolve) => setDialog({ title, initial, resolve: (r) => resolve(r?.name ?? null) })),
    [],
  );

  const askConfirm = (message: string, confirmLabel: string) => new Promise<boolean>((resolve) => setConfirm({ message, confirmLabel, resolve }));
  /** Confirmation with a box to tick: null when cancelled, else whether the box was ticked. */
  const askConfirmOption = (message: string, confirmLabel: string, option: string) =>
    new Promise<boolean | null>((resolve) => setConfirm({ message, confirmLabel, option, resolve: (confirmed, ticked) => resolve(confirmed ? ticked : null) }));

  // The tasks are told by their front matter (TaskNotes' tag), read again with the tree.
  useEffect(() => {
    if (!vault) return;
    let cancelled = false;
    void readAllNotes(vault, filesRef.current)
      .then((notes) => {
        if (cancelled) return;
        const found = new Set(tasksOf(notes, taskConfig).map((t) => t.path));
        setTaskPaths((current) => (current.size === found.size && [...found].every((p) => current.has(p)) ? current : found));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vault, tree, taskConfig]);

  /**
   * After files moved (`moved` maps old paths to new ones): the tree, tabs,
   * history and the open note follow, and the open note is read again if its
   * links were rewritten.
   */
  const followMoves = async (moved: (path: string) => string, updatedNotes: string[]) => {
    if (!vault) return;
    await refresh(vault);
    tabsFollowMoves(moved);
    followWide(moved);
    const current = noteRef.current;
    if (current && (moved(current.path) !== current.path || updatedNotes.includes(moved(current.path)))) {
      const openPath = moved(current.path);
      const disk = await vault.read(openPath);
      const reloaded = { path: openPath, loaded: disk, disk, markdown: disk, reloads: (current.reloads ?? 0) + 1 };
      noteRef.current = reloaded;
      setNote(reloaded);
    }
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
    forgetPages(gone);
    if (noteRef.current && gone(noteRef.current.path)) {
      noteRef.current = null;
      setNote(null);
    }
    void refreshGit();
    return files;
  };

  const changeSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };
  const templateList = useMemo(() => templateFiles(templatesConfig, files), [templatesConfig, files]);
  const templates = useMemo(() => (templatesConfig && templateList.length > 0 ? { config: templatesConfig, files: templateList } : null), [templatesConfig, templateList]);

  const { createFile, renamePath, renameCurrent, newFolder, renameFolderPath, moveItem, duplicatePage, copyLink, removeFolder, removePage, mergeInto, newPage, newTask } = usePageOps({
    vault,
    tree,
    filesRef,
    noteRef,
    config,
    templates,
    tasks: taskConfig,
    saveNow,
    refresh,
    refreshGit,
    select: (path) => select(path),
    notify,
    setStatus,
    askName,
    askConfirm,
    askConfirmOption,
    askChoice,
    askNewPage: (request) => new Promise<NameResult | null>((resolve) => setDialog({ ...request, resolve })),
    followMoves,
    forgetRemoved,
  });

  /** Opens a TaskNotes view (`TaskNotes/Views/*.base`), created as the plugin writes it when missing. */
  const openTasks = async (view: keyof TaskConfig["views"], newTabRequested: boolean) => {
    const path = taskConfig.views[view];
    if (!vault) return;
    if (!filesRef.current.includes(path)) {
      try {
        await createFile(path, defaultViewFile(view));
      } catch (error) {
        setStatus(String(error));
        return;
      }
    }
    await select(path, "push", newTabRequested);
  };
  /** TaskNotes' views in a base: its settings, and a new task in a board column's status. */
  const taskActions = useRef({ newTask, openTasks, openRight: (_path: string) => {} });
  const baseTasks = useMemo(
    () => ({
      config: taskConfig,
      onNew: (status?: string) => void taskActions.current.newTask(status),
      openView: (view: keyof TaskConfig["views"]) => void taskActions.current.openTasks(view, false),
      openBeside: (path: string) => taskActions.current.openRight(path),
    }),
    [taskConfig],
  );

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
    readNote: (path) => (vault ? vault.read(path) : Promise.reject(new Error("Aucun vault ouvert."))),
    // `/modèle`, offered only when Obsidian has a templates folder with notes in it.
    ...(templates && vault
      ? {
          pickTemplate: async (title: string) => {
            const choices = templates.files.map((file) => ({ path: file, name: templateName(templates.config, file) }));
            const path = await askChoice({ title: "Insérer un modèle", placeholder: "Chercher un modèle…", empty: "Aucun modèle", icon: "copy", choices });
            return path ? templateBody(await vault.read(path), title, new Date(), templates.config) : null;
          },
        }
      : {}),
    queryVault: async () => {
      if (!vault) return { notes: [], stats: [] };
      const [notes, stats] = await Promise.all([readAllNotes(vault, filesRef.current), vault.stats?.().catch(() => []) ?? Promise.resolve([])]);
      return { notes, stats };
    },
    noteAliases: async () => {
      if (!vault) return new Map();
      const notes = await readAllNotes(vault, filesRef.current);
      return new Map(notes.flatMap(([path, text]) => (text.includes("alias") ? [[path, noteAliases(text)] as const] : [])));
    },
    addBlockId: async (path, line) => {
      if (!vault) throw new Error("Aucun vault ouvert.");
      // Only the block's line changes; the write is refused if the note changed meanwhile.
      const text = await vault.read(path);
      const block = noteBlocks(text).find((b) => b.line === line);
      if (!block) throw new Error(`${noteTitle(path)} a changé : le bloc n'est plus à cette ligne.`);
      if (block.id) return block.id;
      const id = newBlockId(noteBlocks(text).flatMap((b) => (b.id ? [b.id] : [])));
      const lines = text.split("\n");
      const eol = lines[line].endsWith("\r") ? "\r" : "";
      lines[line] = `${lines[line].replace(/\r$/, "").trimEnd()} ^${id}${eol}`;
      await vault.write(path, lines.join("\n"), text);
      return id;
    },
    notify,
    toggleTask: async (path, line, done) => {
      if (!vault) return;
      // Only the task's line changes; the write is refused if the note changed meanwhile.
      const text = await vault.read(path);
      const lines = text.split("\n");
      const eol = lines[line]?.endsWith("\r") ? "\r" : "";
      const changed = lines[line] === undefined ? null : setTaskDone(lines[line].replace(/\r$/, ""), done, isoDay(new Date()));
      if (changed === null) throw new Error(`${noteTitle(path)} a changé : la tâche n'est plus à cette ligne.`);
      lines[line] = changed + eol;
      await vault.write(path, lines.join("\n"), text);
      void refreshGit();
    },
  };

  /** The page on the right of the split view (only pages are shown there). */
  const splitPath = tabs.find((t) => t.id === activeTab)?.split ?? null;
  /** The right side's bridge: a stable object reading the latest values, so the memoized pane is not drawn again. */
  const splitBridgeLatest = useRef<VaultBridge>(NULL_BRIDGE);
  splitBridgeLatest.current = {
    ...bridge,
    notePath: splitPath ?? "",
    get files() {
      return filesRef.current;
    },
    // Links followed on the right stay on the right (⌘-click: a new tab).
    openPath: (path, newTabRequested) => (newTabRequested ? void newTab(path) : isView(path) ? void select(path) : setTabSplit(activeRef.current, path)),
  };
  const splitBridge = useMemo<VaultBridge>(
    () => ({
      get notePath() {
        return splitBridgeLatest.current.notePath;
      },
      get files() {
        return splitBridgeLatest.current.files;
      },
      get config() {
        return splitBridgeLatest.current.config;
      },
      loadImage: (path) => splitBridgeLatest.current.loadImage(path),
      openPath: (path, newTabRequested) => splitBridgeLatest.current.openPath(path, newTabRequested),
      askName: (title, initial) => splitBridgeLatest.current.askName(title, initial),
      createFile: (path, content) => splitBridgeLatest.current.createFile(path, content),
      mountBase: (dom, path) => splitBridgeLatest.current.mountBase?.(dom, path) ?? (() => {}),
      readNote: (path) => splitBridgeLatest.current.readNote!(path),
      queryVault: () => splitBridgeLatest.current.queryVault!(),
      toggleTask: (path, line, done) => splitBridgeLatest.current.toggleTask!(path, line, done),
      noteAliases: () => splitBridgeLatest.current.noteAliases!(),
      addBlockId: (path, line) => splitBridgeLatest.current.addBlockId!(path, line),
      notify: (text) => splitBridgeLatest.current.notify?.(text),
      get pickTemplate() {
        return splitBridgeLatest.current.pickTemplate;
      },
    }),
    [],
  );

  const onMarkdown = useCallback((markdown: string) => setNote((current) => (current ? { ...current, markdown } : current)), []);

  /** The open page is a drawing (Name.excalidraw.md). */
  const drawing = note !== null && isDrawingPath(note.path);
  /** The open page is a mind map (Name.mindmap.md). */
  const mindmap = note !== null && isMindmapPath(note.path);
  /** The open page is a canvas (Name.canvas). */
  const canvasPage = note !== null && isCanvasPath(note.path);
  /** The open page is a dashboard (Name.dashboard.md). */
  const dashboardPage = note !== null && isDashboardPath(note.path);
  /** The open page is a base (Name.base, Obsidian's format). */
  const basePage = note !== null && isBasePath(note.path);
  /** The open page is a board of Obsidian's Kanban plugin (`kanban-plugin: board`). */
  const kanbanPage = note !== null && !drawing && !mindmap && !canvasPage && !dashboardPage && !basePage && isKanbanMarkdown(note.loaded);
  /** The open page is a task (TaskNotes' tag in its front matter), read from the loaded text. */
  const taskPage = note !== null && !drawing && !mindmap && !canvasPage && !dashboardPage && !kanbanPage && !basePage && isTaskMarkdown(note.loaded, taskConfig);
  /** Reading mode (per tab, ⌘⇧R): notes, tasks and presentations, nothing editable. */
  const readable = note !== null && !drawing && !mindmap && !canvasPage && !dashboardPage && !kanbanPage && !basePage;
  const readingOn = Boolean(tabs.find((t) => t.id === activeTab)?.reading);
  const reading = readable && readingOn && !rawMode;
  const toggleReading = () => replaceTabs(withReading(tabsRef.current, activeTab, "page", !readingOn));
  /** The open page is a presentation (`marp: true`), read from the current text so a conversion shows at once. */
  const presentationPage = note !== null && !drawing && !mindmap && !canvasPage && !dashboardPage && !kanbanPage && !basePage && !taskPage && isPresentationMarkdown(note.markdown);
  /**
   * A note's title is its first `# heading` (the file name without one): editing the
   * title writes that heading, never renames the file (titleHeading.ts).
   */
  const titledNote = readable && !taskPage && !presentationPage && !rawMode;
  /** Pages whose title is their own, the file name shown under it. */
  const titledPage = titledNote || presentationPage;
  const headingTitle = titledNote && editor && !editor.isDestroyed ? titleHeadingOf(editor.state.doc) : null;
  const retitle = async (title: string) => {
    // A presentation's title is its `title` property (the first # is a slide's).
    if (presentationPage) {
      if (frontmatter.current && title.trim()) frontmatter.current.set(setProperty(frontmatter.current.get(), "title", title.trim()));
      return true;
    }
    const tr = editor && !editor.isDestroyed ? setTitleHeading(editor.state, title) : null;
    if (tr) editor!.view.dispatch(tr);
    return true;
  };
  const outlineShown = showOutline && !outlineHidden && !rawMode && !drawing && !mindmap && !canvasPage && !dashboardPage && !kanbanPage && !basePage;
  const historyShown = showHistory && Boolean(vault?.git);
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
        onDeleteRow: removePage,
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
  const rowBase = note !== null && !drawing && !mindmap && !canvasPage && !dashboardPage && !kanbanPage && !basePage && !taskPage ? baseOfNote(note.path, bases) : null;
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
  /** A view of the tasks (TaskNotes/Views/…): shown as "Tâches", not as a file of the tree. */
  const tasksView = activePath !== null && Object.values(taskConfig.views).includes(activePath);

  /** The links' note: the one set, else "Liens.md" ("Lectures.md" in a vault that already has one, from before the rename). */
  const readingPath = settings.readingList || (files.includes("Lectures.md") && !files.includes("Liens.md") ? "Lectures.md" : "Liens.md");
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

  /** Shows a page on the right of the active tab (replacing the one there). */
  const openRight = (path: string) => {
    if (!isView(path)) setTabSplit(activeRef.current, path);
  };
  taskActions.current = { newTask, openTasks, openRight };

  /**
   * Puts the page of another tab on the right of the active one: the two make
   * one tab. A page already on the right goes back to a tab of its own, in
   * place of the one joined.
   */
  const joinTab = (id: string) => {
    const next = joinTabs(tabsRef.current, activeRef.current, id, newTabId(), (path) => !isView(path));
    if (!next) return;
    forgetTab(id);
    replaceTabs(next);
  };

  /** The page on the right of a tab goes to a tab of its own, after it. */
  const separateTab = async (id: string) => {
    if (!splitOf(id)) return;
    if (id === activeRef.current) await splitSaver.current?.();
    const next = separateTabs(tabsRef.current, id, newTabId());
    if (next) replaceTabs(next);
  };

  /** ⌘⌥\: closes the right side, or joins the next tab holding a page. */
  const toggleSplit = () => {
    if (splitOf(activeRef.current)) return setTabSplit(activeRef.current, null);
    const other = nextPageTab(tabsRef.current, activeRef.current, (path) => !isView(path));
    if (other) joinTab(other.id);
    else notify("⌥-clic sur une page de la barre latérale pour l'ouvrir à droite");
  };

  /** Swaps the two sides of the active tab. */
  const swapSplit = async () => {
    const right = splitOf(activeRef.current);
    const left = noteRef.current?.path ?? null;
    if (!right || !left) return;
    try {
      await saveNow();
      await splitSaver.current?.();
    } catch {
      return;
    }
    setTabSplit(activeRef.current, left);
    replaceTabs(swapReading(tabsRef.current, activeRef.current));
    await select(right, "history");
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
  /** Titles of the pages (vault.ts), live from the text for the open page. */
  const liveTitle = note && !basePage ? pageTitle(note.markdown, readable && !taskPage && !presentationPage) : null;
  const treeTitles = useMemo(() => {
    const found = new Map<string, string>();
    const walk = (entries: VaultEntry[]) => entries.forEach((e) => (e.title && found.set(e.path, e.title), e.children && walk(e.children)));
    walk(tree);
    return found;
  }, [tree]);
  /** The titles found by ⌘P besides the file names (the open page's from its text). */
  const openPath = note?.path;
  const switcherTitles = useMemo(() => {
    const found = new Map([...treeTitles].map(([path, title]) => [path, [title]]));
    if (openPath && liveTitle) found.set(openPath, [liveTitle]);
    return found;
  }, [treeTitles, openPath, liveTitle]);
  /** How a page is named in the tabs: its title, or its file name (setting of the sidebar). */
  const shownName = (path: string) =>
    taskViewTitle(taskConfig, path) ?? (settings.showTitles ? ((note?.path === path ? liveTitle : treeTitles.get(path)) ?? noteTitle(path)) : noteTitle(path));
  /** Presentations, from the tree (from the text for the open page: a conversion shows at once). */
  const presentationPaths = useMemo(() => {
    const found = new Set<string>();
    const walk = (entries: VaultEntry[]) => entries.forEach((e) => (e.presentation ? found.add(e.path) : e.children && walk(e.children)));
    walk(tree);
    return found;
  }, [tree]);
  const isPresentation = (path: string) => (note?.path === path ? presentationPage : presentationPaths.has(path));
  /** A note of the folder next to a base (`X/` and `X.base`) is one of its rows. */
  const isBaseRow = (path: string) => path.endsWith(".md") && path.includes("/") && files.includes(`${dirname(path)}.base`);
  const pageIconFor = (path: string) => <PageIcon path={path} icon={iconOf(path)} task={taskPaths.has(path)} presentation={isPresentation(path)} row={isBaseRow(path)} />;
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
  /** The open page, for the exports of its toolbar (see pageExport.ts). */
  const exportedPage = (): ExportedPage | null => {
    const current = noteRef.current;
    if (!current) return null;
    const kind = drawing ? "drawing" : mindmap ? "mindmap" : presentationPage ? "presentation" : "note";
    return { title: noteTitle(current.path), path: current.path, markdown: current.markdown, kind, drawing: drawingControls, mindmap: mindmapControls };
  };
  /** "Exporter en image": the whole map as a PNG. */
  const exportMindmap = async () => {
    const page = exportedPage();
    if (!mindmapControls || !page) return;
    try {
      const where = await exportMindmapPng(mindmapControls, page.title);
      if (where) notify(`Mind map exportée : ${where}`);
    } catch (error) {
      setStatus(`Export impossible : ${String(error)}`);
    }
  };
  const exportCurrent = async () => {
    const page = exportedPage();
    if (!vault || !page) return;
    try {
      const where = await exportSlidesHtml(vault, page, filesRef.current);
      if (where) notify(`Présentation exportée : ${where}`);
    } catch (error) {
      setStatus(`Export impossible : ${String(error)}`);
    }
  };
  /** PDF of the open page through the print panel. */
  const exportCurrentPdf = async () => {
    const page = exportedPage();
    if (!vault || !page) return;
    try {
      await exportPdf(vault, page, filesRef.current);
    } catch (error) {
      setStatus(`Export PDF impossible : ${String(error)}`);
    }
  };
  /** Exports the open note as an HTML file, images included. */
  const exportAsHtml = async () => {
    const current = noteRef.current;
    if (!editor || !current) return;
    try {
      const where = await exportNoteHtml(editor.state.doc, noteTitle(current.path));
      if (where) notify(`Note exportée : ${where}`);
    } catch (error) {
      setStatus(`Export HTML impossible : ${String(error)}`);
    }
  };
  const [pageMenu, setPageMenu] = useState<DOMRect | null>(null);

  /** Sets or removes the page icon (the `icon` property of the open note). */
  const setPageIcon = (icon: string | null) => {
    const control = frontmatter.current;
    if (control) control.set(setProperty(control.get(), "icon", icon ?? undefined));
  };

  /** The command palette's commands (⌘⇧P): what the app can do from where it is. */
  const paletteCommands = (): Command[] => {
    const page = noteRef.current;
    const command = (id: string, label: string, section: string, run: () => unknown, icon?: IconName, action?: GlobalAction): Command => ({ id, label, section, icon, keys: action && shortcutOf(action), run: () => void run() });
    const list: Command[] = [
      command("switcher", "Rechercher une page", "Navigation", () => setModal("switcher"), "search", "switcher"),
      command(
        "vaultSearch",
        "Rechercher dans les notes",
        "Navigation",
        () => {
          setSearchFilters([]);
          setModal("search");
        },
        "searchText",
        "vaultSearch",
      ),
      command("back", "Page précédente", "Navigation", goBack, "chevronLeft", "back"),
      command("forward", "Page suivante", "Navigation", goForward, "chevronRight", "forward"),
      command("home", "Ouvrir l'accueil", "Vues", () => openView(null, false), "home"),
      command("tasks", "Ouvrir les tâches", "Vues", () => void openTasks("tasks", false), "task"),
      command("taskBoard", "Ouvrir le tableau des tâches", "Vues", () => void openTasks("kanban", false), "board"),
      command("taskAgenda", "Ouvrir l'agenda des tâches", "Vues", () => void openTasks("agenda", false), "list"),
      command("taskCalendar", "Ouvrir le calendrier des tâches", "Vues", () => void openTasks("calendar", false), "calendar"),
      command("readingList", "Ouvrir les liens", "Vues", () => openView(READING_VIEW, false), "bookmark"),
      command("graph", "Ouvrir le graphe", "Vues", () => openView(GRAPH_VIEW, false), "graph"),
      command("docs", "Ouvrir la documentation", "Vues", () => openView(DOCS_VIEW, false), "book"),
      command("settings", "Ouvrir les réglages", "Vues", () => select(SETTINGS_VIEW, "push"), "sliders", "settings"),
      command("help", "Aide et raccourcis", "Vues", () => setModal("help"), "question", "help"),
      ...NEW_PAGE_KINDS.map(({ kind, create, icon }) => command(`new-${kind}`, create, "Créer", () => newPage(null, undefined, undefined, kind), icon, kind === "note" ? "newPage" : undefined)),
      command("newTab", "Nouvel onglet", "Onglets", () => newTab(null), "plus", "newTab"),
      command("closeTab", "Fermer l'onglet", "Onglets", () => closeTab(activeRef.current), "close", "closeTab"),
      command("previousTab", "Onglet précédent", "Onglets", () => cycleTab(-1), "chevronLeft", "previousTab"),
      command("nextTab", "Onglet suivant", "Onglets", () => cycleTab(1), "chevronRight", "nextTab"),
      command("split", "Ouvrir ou fermer le panneau de droite", "Onglets", toggleSplit, "split", "split"),
      command("sidebar", "Afficher ou masquer la barre latérale", "Fenêtre", toggleSidebar, "sidebar", "sidebar"),
      command("focus", "Mode focus", "Fenêtre", toggleFocus, "focus", "focus"),
      command("theme-light", "Thème clair", "Apparence", () => changeSettings({ ...settings, theme: "light" })),
      command("theme-dark", "Thème sombre", "Apparence", () => changeSettings({ ...settings, theme: "dark" })),
      command("theme-system", "Thème du système", "Apparence", () => changeSettings({ ...settings, theme: "system" })),
      command("gitGutter", settings.gitGutter ? "Masquer les modifications dans la marge" : "Afficher les modifications dans la marge", "Apparence", () => changeSettings({ ...settings, gitGutter: !settings.gitGutter }), "branch"),
      command("addLink", "Ajouter un lien", "Liens", openAddLink, "bookmark", "addLink"),
    ];
    if (vault?.git) list.push(command("git", "Panneau Git", "Git", () => toggleGit(), "branch", "git"));
    if (page) {
      list.push(
        command("newSubpage", "Nouvelle sous-page", "Créer", () => newPage(page.path), "doc"),
        ...(isMergeable(page.path) ? [command("merge", "Fusionner la note dans…", "Page", () => mergeInto(page.path), "merge")] : []),
        command("raw", "Mode Markdown brut", "Page", toggleRaw, "raw", "raw"),
        command("save", "Enregistrer maintenant", "Page", () => saveNow().catch(() => {}), undefined, "save"),
      );
      if (vault?.git && gitChanges !== null) list.push(command("history", "Historique de la note", "Git", () => setShowHistory(true), "clock"));
    }
    if (page && readable) {
      list.push(
        command("find", "Rechercher dans la note", "Page", () => openFind(false), "search", "find"),
        command("replace", "Rechercher et remplacer", "Page", () => openFind(true), "replace", "replace"),
        command("reading", "Mode lecture", "Page", toggleReading, "eye", "reading"),
        command("outline", "Plan de la note", "Page", toggleOutline, "outline"),
        command("wide", "Pleine largeur / largeur normale", "Page", () => toggleWide(page.path), "width"),
      );
      if (!presentationPage) list.push(command("exportHtml", "Exporter en HTML", "Page", exportAsHtml, "export"), command("toPresentation", "Transformer en présentation", "Page", convertToPresentation, "slides"));
    }
    if (page && !canvasPage && !dashboardPage && !kanbanPage && !basePage) list.push(command("exportPdf", "Exporter en PDF", "Page", exportCurrentPdf, "export"));
    if (presentationPage) list.push(command("present", "Présenter", "Page", present, "play", "present"));
    return list;
  };

  // Words and reading time of a plain note (not a drawing, mind map nor base).
  const words = note && !drawing && !mindmap && !canvasPage && !dashboardPage && !kanbanPage && !basePage ? countWords(note.markdown) : null;
  /**
   * Status pill, at the bottom right of the page:
   * the save state and the words, or a passing message. It takes no room and
   * fades while typing.
   */
  const statusPill =
    note || notice ? (
      <div className={drawing && !rawMode ? "status-pill-anchor over-drawing" : "status-pill-anchor"} aria-live="polite">
        <div
          className={["status-pill", typing && !notice && !selectionCount ? "quiet" : "", notice ? "notice" : ""].filter(Boolean).join(" ")}
          title={words ? `${words} mot${words > 1 ? "s" : ""} · ${note!.markdown.length.toLocaleString("fr-FR")} caractères · environ ${readingMinutes(words)} min de lecture` : undefined}
        >
          {notice ? (
            <span key={notice.id}>{notice.text}</span>
          ) : (
            <>
              <span className={dirty ? "save-state dirty" : "save-state"}>{dirty ? (settings.autosave ? "Enregistrement…" : "Non enregistré") : "Enregistré"}</span>
              {selectionCount ? (
                <span className="selection-count">
                  {selectionCount.words.toLocaleString("fr-FR")} mot{selectionCount.words > 1 ? "s" : ""} · {selectionCount.chars.toLocaleString("fr-FR")} caractère{selectionCount.chars > 1 ? "s" : ""} sélectionnés
                </span>
              ) : words ? (
                <span>
                  {words.toLocaleString("fr-FR")} mot{words > 1 ? "s" : ""}
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>
    ) : null;
  /** Without autosave, unsaved changes stay in sight at the top. */
  const saveState = dirty && !settings.autosave ? <span className="save-state dirty">{keys("Non enregistré · ⌘S")}</span> : null;

  // The sidebar is memoized: typing in a note does not draw it again (see useHandlers).
  const sidebarHidden = useMemo(() => [readingPath].filter(Boolean), [readingPath]);
  const notePath = note?.path;
  const sidebarLiveIcon = useMemo(() => (notePath ? { path: notePath, icon: liveIcon, title: liveTitle } : undefined), [notePath, liveIcon, liveTitle]);
  const otherVaults = useMemo(
    () => (vault && isTauri() ? recentTauriVaults().filter((root) => root !== currentTauriVault()).map((root) => ({ root, name: root.split("/").filter(Boolean).pop() ?? root })) : []),
    [vault],
  );
  const splitHandlers = useHandlers({
    onOpen: (path: string, newTabRequested: boolean) => (newTabRequested ? void newTab(path) : setTabSplit(activeTab, path)),
    onRenameRow: renamePath,
    onDeleteRow: removePage,
    onSwap: () => void swapSplit(),
    onNewTask: (status?: string) => void newTask(status),
    onSeparate: () => void separateTab(activeTab),
    onClose: () => setTabSplit(activeTab, null),
    onSaved: (before?: string, after?: string) => {
      if (splitPath && before !== undefined && after !== undefined) followHeadingRename(splitPath, before, after);
      void refreshGit();
      if (vault) void refresh(vault);
    },
    onToggleSpelling: toggleSpelling,
    onToggleFocus: toggleFocus,
    onToggleWide: () => splitPath && toggleWide(splitPath),
    onToggleReading: () => replaceTabs(withReading(tabsRef.current, activeTab, "split", !tabsRef.current.find((t) => t.id === activeTab)?.splitReading)),
    notify,
  });
  const sidebarHandlers = useHandlers({
    onToggleTitles: () => {
      const next = { ...settings, showTitles: !settings.showTitles };
      setSettings(next);
      saveSettings(next);
    },
    onPageSort: (pageSort: PageSort) => {
      const next = { ...settings, pageSort };
      setSettings(next);
      saveSettings(next);
    },
    onSelect: (path: string, newTabRequested: boolean) => void select(path, "push", newTabRequested),
    onOpenRight: openRight,
    onNewPage: (parent: string | null) => void newPage(parent),
    onNewPageInFolder: (folder: string) => void newPage(null, undefined, folder),
    onDelete: (path: string) => void removePage(path),
    onDuplicate: (path: string) => void duplicatePage(path),
    onMerge: (path: string) => void mergeInto(path),
    onCopyLink: (path: string) => void copyLink(path),
    onReveal: vault?.reveal ? (path: string) => void vault.reveal!(path).catch((error: unknown) => setStatus(String(error))) : undefined,
    onNewFolder: (parent: string) => void newFolder(parent),
    onRenameFolder: (folder: string) => void renameFolderPath(folder),
    onDeleteFolder: (folder: string) => void removeFolder(folder),
    onMove: (item: { path: string; folder: boolean }, target: string) => void moveItem(item, target),
    onRename: (path: string) => void askName("Renommer la page", noteTitle(path)).then((name) => (name ? renamePath(path, name) : false)),
    onSearch: () => setModal("switcher"),
    onTag: (tag: string) => {
      setSearchFilters([{ kind: "tag", tag }]);
      setModal("search");
    },
    onHome: (newTabRequested: boolean) => void openView(null, newTabRequested),
    onTasks: (newTabRequested: boolean) => void openTasks("tasks", newTabRequested),
    onGraph: (newTabRequested: boolean) => void openView(GRAPH_VIEW, newTabRequested),
    onReading: (newTabRequested: boolean) => void openView(READING_VIEW, newTabRequested),
    onDocs: (newTabRequested: boolean) => void openView(DOCS_VIEW, newTabRequested),
    onGit: () => toggleGit(),
    onSettings: (newTabRequested: boolean) => void select(SETTINGS_VIEW, "push", newTabRequested),
    onHelp: () => setModal("help"),
    onChangeVault: changeVault,
    onSwitchVault: (root: string) => void saveNow().catch(() => {}).then(() => open(openTauriVault(root))),
    onPickVault: isTauri() ? () => void saveNow().catch(() => {}).then(() => open(pickTauriVault())) : undefined,
  });

  if (!vault) {
    return (
      <Welcome
        recent={isTauri() ? recentTauriVaults() : []}
        onOpenVault={isTauri() ? () => void open(pickTauriVault()) : browserVaultSupported() ? () => void open(openBrowserVault()) : null}
        onOpenRecent={(root) => void open(openTauriVault(root))}
        onForgetRecent={forgetTauriVault}
        onTryDemo={() => void open(createMemoryVault("Carnet de Camille", DEMO_FILES, DEMO_REMOTE))}
        status={status}
      />
    );
  }

  /** The page bar's "…" menu (menus.ts); no button when the page offers none of its items. */
  const pageBarItems = note
    ? pageBarMenu({
        spelling: readable && !reading && settings.spellChecker !== "off" ? { on: spellingOn, toggle: toggleSpelling } : undefined,
        history: vault.git && gitChanges !== null ? { on: showHistory, toggle: () => setShowHistory(!showHistory) } : undefined,
        toPresentation: readable && !taskPage && !presentationPage && !reading ? convertToPresentation : undefined,
        exports:
          rawMode || basePage || taskPage || canvasPage || dashboardPage || kanbanPage
            ? []
            : [
                { label: "Exporter en PDF…", run: () => void exportCurrentPdf() },
                ...(!drawing && !mindmap && !presentationPage ? [{ label: "Exporter en HTML…", run: () => void exportAsHtml() }] : []),
              ],
      })
    : [];

  /** A tab's menu (menus.ts): the split view's actions, then closing it. */
  const tabMenuItems = (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    return tabMenuOf({
      path: tab?.path ?? null,
      split: tab?.split,
      isActive: id === activeTab,
      activeTitle: activePath === null ? "Accueil" : (VIEWS[activePath]?.title ?? taskViewTitle(taskConfig, activePath) ?? noteTitle(activePath)),
      otherPage: tabs.some((t) => t.id !== activeTab && t.path !== null && !isView(t.path)),
      isView,
      swapSplit: () => void swapSplit(),
      separate: () => void separateTab(id),
      closeSplit: () => setTabSplit(id, null),
      join: () => joinTab(id),
      toggleSplit,
      close: () => void closeTab(id),
      closeOthers: tabs.length > 1 ? () => void closeTabs(tabs.filter((t) => t.id !== id).map((t) => t.id)) : undefined,
      closeRight: tabs.findIndex((t) => t.id === id) < tabs.length - 1 ? () => void closeTabs(tabs.slice(tabs.findIndex((t) => t.id === id) + 1).map((t) => t.id)) : undefined,
    });
  };

  const sidebar = (
    <Sidebar
      vaultName={vault.name}
      tree={tree}
      taskPaths={taskPaths}
      hidden={sidebarHidden}
      selected={note?.path}
      view={activePath === null ? "home" : tasksView ? "tasks" : activePath === GRAPH_VIEW ? "graph" : activePath === READING_VIEW ? "reading" : activePath === SETTINGS_VIEW ? "settings" : activePath === DOCS_VIEW ? "docs" : null}
      liveIcon={sidebarLiveIcon}
      showTitles={settings.showTitles}
      pageSort={settings.pageSort}
      fileTimes={fileTimes}
      gitChanges={vault.git ? gitChanges : null}
      gitOpen={gitOpen}
      favorites={bookmarks}
      tags={tags}
      otherVaults={otherVaults}
      {...sidebarHandlers}
    />
  );

  return (
    <div className={`layout${sidebarOpen && !focusMode ? "" : " no-sidebar"}${focusMode ? " focus-mode" : ""}`}>
      <Titlebar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => {
          setPeek(false);
          toggleSidebar();
        }}
        onPeek={(shown) => (shown ? openPeek() : closePeekSoon())}
        canBack={canBack}
        canForward={canForward}
        onBack={goBack}
        onForward={goForward}
      >
        <TabBar
          tabs={tabs}
          active={activeTab}
          dirty={dirty}
          titleOf={(tab) => (tab.path === null ? "Accueil" : (VIEWS[tab.path]?.title ?? shownName(tab.path)))}
          iconOf={(tab) =>
            tab.path === null ? <Icon name="home" size={13} /> : isView(tab.path) ? <Icon name={VIEWS[tab.path].icon} size={13} /> : <PageIcon path={tab.path} icon={iconOf(tab.path)} task={taskPaths.has(tab.path)} presentation={isPresentation(tab.path)} size={13} />
          }
          onSelect={(id) => void switchTab(id)}
          onClose={(id) => void closeTab(id)}
          onNew={() => void newTab(null)}
          onReorder={reorderTab}
          onMenu={(id, anchor) => setTabMenu({ id, anchor })}
        />
        {tabMenu && (
          <PopoverMenu
            anchor={tabMenu.anchor}
            onClose={() => setTabMenu(null)}
            items={tabMenuItems(tabMenu.id)}
          />
        )}
      </Titlebar>
      <div className="workspace">
        {sidebarOpen && !focusMode ? (
          <div className="sidebar-dock">{sidebar}</div>
        ) : (
          <>
            <div className="sidebar-hotzone" onMouseEnter={openPeek} onMouseLeave={closePeekSoon} />
            {/* Kept mounted so it leaves the way it came (a transition, which a quick return reverses mid-way). */}
            <div className={peek ? "sidebar-dock floating open" : "sidebar-dock floating"} inert={!peek} onMouseEnter={openPeek} onMouseLeave={closePeekSoon}>
              {sidebar}
            </div>
          </>
        )}
        <div className="main-area">
        <main
          className="content"
          ref={contentRef}
          onKeyDown={(event) => !event.metaKey && !event.ctrlKey && !typing && setTyping(true)}
          onMouseMove={() => typing && setTyping(false)}
        >
          {statusPill}
          <Toolbar
            left={
              // A view of the app (Accueil, Tâches, Réglages…) is already named by its tab: no breadcrumbs, only the save state and the messages.
              note ? (
                <>
                  {!tasksView && <Breadcrumbs vaultName={vault.name} path={note.path} files={files} onOpen={(path) => void select(path)} onRename={renameCurrent} iconOf={pageIconFor} />}
                  {saveState}
                  {status && <span className="status warning">{status}</span>}
                </>
              ) : null
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
                  {readable && <ToolButton icon="outline" label="Plan de la note" onClick={toggleOutline} active={showOutline && !outlineHidden} />}
                  {readable && <ToolButton icon="eye" label={reading ? "Quitter le mode lecture (⌘⇧R)" : "Mode lecture (⌘⇧R)"} onClick={toggleReading} active={reading} disabled={rawMode} />}
                  {presentationPage && (
                    <>
                      <ToolButton icon="slides" label="Miniatures des diapos" onClick={() => setShowSlides(!showSlides)} active={showSlides} />
                      <ToolButton icon="play" label="Présenter (⌘⌥P)" onClick={() => present()} disabled={!slides} />
                      <ToolButton icon="export" label="Exporter en HTML" onClick={() => void exportCurrent()} />
                    </>
                  )}
                  {showHistory && vault.git && gitChanges !== null && <ToolButton icon="clock" label="Fermer l'historique de la note" onClick={() => setShowHistory(false)} active />}
                  {readable && !presentationPage && <ToolButton icon="width" label={widePages.has(note.path) ? "Largeur normale" : "Pleine largeur"} onClick={() => toggleWide(note.path)} active={widePages.has(note.path)} />}
                  <ToolButton icon="focus" label={focusMode ? "Quitter le mode focus (⌘⇧M)" : "Mode focus (⌘⇧M)"} onClick={toggleFocus} active={focusMode} />
                  <ToolButton icon="raw" label={`${rawLabel({ drawing, mindmap, base: basePage, canvas: canvasPage })} (⌘⇧E)`} onClick={toggleRaw} active={rawMode} />
                  {pageBarItems.length > 0 && <ToolButton icon="more" label="Correction, historique, export…" onClick={(event) => setPageMenu(event.currentTarget.getBoundingClientRect())} active={pageMenu !== null} />}
                </div>
              )
            }
          />
          {pageMenu && note && (
            <PopoverMenu
              anchor={pageMenu}
              onClose={() => setPageMenu(null)}
              items={pageBarItems}
            />
          )}
          {note ? (
            <>
              {findRequest && !rawMode && !drawing && !mindmap && !canvasPage && !dashboardPage && !kanbanPage && !basePage && <FindBar editor={editor} request={findRequest} onClose={() => setFindRequest(null)} />}
              <div className="panes">
                {drawing && !rawMode ? (
                  <div className="drawing-pane">
                    <DrawingEditor
                      key={`${note.path}#${note.reloads ?? 0}`}
                      source={note.loaded}
                      onMarkdown={onMarkdown}
                      bridge={bridge}
                      theme={settings.theme === "dark" || (settings.theme === "system" && systemDark) ? "dark" : "light"}
                      editable={!hasConflictMarkers(note.disk) && !reading}
                      onControls={setDrawingControls}
                      onToolChange={setDrawingTool}
                    />
                  </div>
                ) : kanbanPage && !rawMode ? (
                  <KanbanPage key={`${note.path}#${note.reloads ?? 0}`} source={note.loaded} onChange={onMarkdown} bridge={bridge} editable={!hasConflictMarkers(note.disk) && !reading} />
                ) : dashboardPage && !rawMode ? (
                  <DashboardBoard key={`${note.path}#${note.reloads ?? 0}`} source={note.loaded} onChange={onMarkdown} bridge={bridge} editable={!hasConflictMarkers(note.disk) && !reading} />
                ) : canvasPage && !rawMode ? (
                  <div className="drawing-pane">
                    <CanvasEditor
                      key={`${note.path}#${note.reloads ?? 0}`}
                      source={note.loaded}
                      onChange={onMarkdown}
                      bridge={bridge}
                      readFile={(path) => vault.read(path)}
                      theme={settings.theme === "dark" || (settings.theme === "system" && systemDark) ? "dark" : "light"}
                      editable={!hasConflictMarkers(note.disk) && !reading}
                    />
                  </div>
                ) : basePage && !rawMode ? (
                  <BaseView
                    key={`${note.path}#${note.reloads ?? 0}`}
                    vault={vault}
                    files={files}
                    path={note.path}
                    source={note.markdown}
                    editable={!hasConflictMarkers(note.disk) && !reading}
                    onSource={onMarkdown}
                    onOpen={(path, newTabRequested) => void select(path, "push", newTabRequested)}
                    onRenameRow={renamePath}
                    onDeleteRow={removePage}
                    loadImage={loadImage}
                    onChanged={() => {
                      void refresh(vault);
                      void refreshGit();
                    }}
                    tasks={baseTasks}
                  />
                ) : mindmap && !rawMode ? (
                  <div className="drawing-pane">
                    <MindmapEditor
                      key={`${note.path}#${note.reloads ?? 0}`}
                      source={note.loaded}
                      onMarkdown={onMarkdown}
                      title={noteTitle(note.path)}
                      theme={settings.theme === "dark" || (settings.theme === "system" && systemDark) ? "dark" : "light"}
                      editable={!hasConflictMarkers(note.disk) && !reading}
                      onControls={setMindmapControls}
                    />
                  </div>
                ) : (
                <div className={`${presentationPage ? "page presentation-page" : widePages.has(note.path) ? "page wide" : "page"}${reading ? " reading" : ""}`}>
                  {hasConflictMarkers(note.disk) && (
                    <div className="conflict-note-banner">
                      <span>Cette note contient un conflit de fusion : elle est en lecture seule jusqu'à sa résolution.</span>
                      {vault.git && <button onClick={() => toggleGit(true)}>Résoudre</button>}
                    </div>
                  )}
                  {!rawMode && !taskPage && (
                    <PageTitle
                      title={(presentationPage ? liveTitle : headingTitle) ?? noteTitle(note.path)}
                      fileName={titledPage ? noteTitle(note.path) : undefined}
                      onRenameFile={renameCurrent}
                      onRename={titledPage ? retitle : renameCurrent}
                      readOnly={hasConflictMarkers(note.disk) || reading}
                      icon={drawing ? undefined : liveIcon}
                      onIcon={drawing ? undefined : setPageIcon}
                    />
                  )}
                  {taskPage && !rawMode ? (
                    <TaskView
                      key={`${note.path}#${note.reloads ?? 0}`}
                      path={note.path}
                      source={note.loaded}
                      markdown={note.markdown}
                      onMarkdown={onMarkdown}
                      bridge={bridge}
                      editable={!hasConflictMarkers(note.disk) && !reading}
                      onEditor={setEditor}
                      onRename={renameCurrent}
                      config={taskConfig}
                    />
                  ) : rawMode ? (
                    <RawEditor key={`${note.path}#${note.reloads ?? 0}`} value={note.markdown} onChange={onMarkdown} readOnly={hasConflictMarkers(note.disk)} />
                  ) : (
                    <NoteEditor
                      key={`${note.path}#${note.reloads ?? 0}`}
                      source={note.loaded}
                      onMarkdown={onMarkdown}
                      bridge={bridge}
                      editable={!hasConflictMarkers(note.disk) && !reading}
                      onEditor={setEditor}
                      frontmatterControl={frontmatter}
                      titleHeading={!presentationPage}
                      gitBase={gitBase}
                      hiddenProperties={rowBase ? ["icon", ...baseProperties(rowBase.model)] : ["icon"]}
                      header={
                        rowBase
                          ? (raw, set) => (
                              <RowProperties
                                base={rowBase}
                                path={note.path}
                                raw={raw}
                                editable={!hasConflictMarkers(note.disk) && !reading}
                                onChange={set}
                                onOptions={(property, options) => void setRowOptions(property, options)}
                                onOpen={(path, newTabRequested) => void select(path, "push", newTabRequested)}
                              />
                            )
                          : undefined
                      }
                    />
                  )}
                  {!rawMode && !taskPage && !presentationPage && (
                    <Backlinks vault={vault} files={files} path={note.path} iconOf={pageIconFor} onOpen={(path, newTabRequested) => void select(path, "push", newTabRequested)} />
                  )}
                </div>
                )}
                {presentationPage && showSlides && !rawMode && <SlidesPanel editor={editor} rendered={slides} onPresent={(index) => setPresenting(index)} onClose={() => setShowSlides(false)} />}
                {(outlineShown || historyShown) && (
                  // Outline and history share one column, the outline on top.
                  <div className={historyShown ? "side-column with-history" : "side-column"}>
                    {outlineShown && <OutlinePanel editor={editor} onClose={toggleOutline} />}
                    {historyShown && vault.git && (
                      <HistoryPanel git={vault.git} path={note.path} current={note.disk} onRestore={restoreVersion} onClose={() => setShowHistory(false)} />
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            activePath === DOCS_VIEW ? (
              <DocsPage dark={dark} />
            ) : activePath === SETTINGS_VIEW ? (
              <SettingsPage
                key={activeTab}
                settings={settings}
                vaultName={vault.name}
                grammarAvailable={isTauri()}
                tasks={taskConfig}
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
            ) : (
            <Dashboard
              key={activeTab}
              vault={vault}
              files={files}
              iconOf={pageIconFor}
              onOpen={(path, newTabRequested) => void select(path, "push", newTabRequested)}
              onCreate={(kind) => void newPage(null, undefined, undefined, kind)}
              onOpenGit={() => toggleGit(true)}
              onOpenTasks={(newTabRequested) => void openTasks("tasks", newTabRequested)}
              tasksConfig={taskConfig}
              onOpenGraph={(newTabRequested) => void select(GRAPH_VIEW, "push", newTabRequested)}
              readingList={readingPath}
              readingVersion={readingVersion}
              onOpenReading={(newTabRequested) => void select(READING_VIEW, "push", newTabRequested)}
              onAddLink={() => void openAddLink()}
            />
            )
          )}
        </main>
        {splitPath && (
          <>
            <div
              className="split-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Largeur du panneau de droite"
              onPointerDown={startSplitResize}
            />
            <div className="split-host" style={{ flexBasis: `${splitWidth * 100}%` }}>
              <SplitPane
                key={activeTab}
                vault={vault}
                path={splitPath}
                files={files}
                bridge={splitBridge}
                theme={settings.theme === "dark" || (settings.theme === "system" && systemDark) ? "dark" : "light"}
                tasks={taskConfig}
                openOnLeft={note?.path === splitPath}
                autosave={settings.autosave}
                icon={iconOf(splitPath)}
                isRow={isBaseRow(splitPath)}
                saver={splitSaver}
                spellingOn={settings.spellChecker !== "off" ? spellingOn : null}
                focusOn={focusMode}
                wide={widePages.has(splitPath)}
                reading={Boolean(tabs.find((t) => t.id === activeTab)?.splitReading)}
                git={vault.git ?? null}
                gitGutter={settings.gitGutter}
                gitVersion={gitChanges}
                {...splitHandlers}
              />
            </div>
          </>
        )}
        </div>
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
          option={confirm.option}
          onDone={(ok, ticked) => {
            confirm.resolve(ok, ticked);
            setConfirm(null);
          }}
        />
      )}
      {modal === "switcher" && (
        <QuickSwitcher
          files={files}
          titles={switcherTitles}
          iconOf={pageIconFor}
          initialQuery={scopeQuery}
          onOpen={(path) => void select(path)}
          onCreate={(name) => void newPage(null, name)}
          onCommands={() => setModal("palette")}
          onContent={(query) => {
            setSearchFilters([]);
            setModal("search");
            setScopeQuery(query);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "palette" && <CommandPalette commands={paletteCommands()} onClose={() => setModal(null)} />}
      {modal === "search" && (
        <VaultSearch
          vault={vault}
          initialQuery={scopeQuery ?? (searchFilters.length ? "" : (findRequest?.query ?? selectedText()))}
          initialFilters={searchFilters}
          iconOf={pageIconFor}
          onOpen={(hit, occurrence, query) => {
            setRawMode(false);
            void select(hit.path).then(() => setFindRequest({ query, occurrence, nonce: Date.now() }));
          }}
          onOpenPage={(path) => void select(path)}
          onTitles={(query) => {
            setModal("switcher");
            setScopeQuery(query);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {presenting !== null && slides && presentationPage && <Presenter rendered={slides} start={presenting} onClose={() => setPresenting(null)} />}
      {modal === "help" && <ShortcutsHelp onClose={() => setModal(null)} />}
      {modal === "addLink" && <AddLinkDialog themes={readingThemes} tags={readingTags} fetchTitles={settings.fetchTitles} onAdd={addReading} onClose={() => setModal(null)} />}
      {choicePick && (
        <ChoiceDialog
          {...choicePick}
          onDone={(path) => {
            choicePick.resolve(path);
            setChoicePick(null);
          }}
        />
      )}
      {dialog && (
        <NameDialog
          title={dialog.title}
          initial={dialog.initial}
          folders={dialog.folders}
          folder={dialog.folder}
          kinds={dialog.kinds}
          initialKind={dialog.initialKind}
          templates={dialog.templates}
          onDone={(result) => {
            dialog.resolve(result);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
