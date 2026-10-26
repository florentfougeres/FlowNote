import { tabMenu as tabMenuOf } from "./menus";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keys } from "./keys";
import { NoteEditor } from "./editor/NoteEditor";
import { imageMime, NULL_BRIDGE, type VaultBridge } from "./editor/bridge";
import DOCUMENTATION from "./docs/documentation.md?raw";
import { docsBridge } from "./docs/docsBridge";
import { ConfirmDialog, NameDialog, TemplateDialog, type NameResult, type PageKind, type TemplateChoice } from "./Dialogs";
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
import { PageIcon, PopoverMenu, Sidebar, type MenuItem } from "./Sidebar";
import { Icon, type IconName } from "./Icon";
import { GraphPage } from "./graph/GraphPage";
import { ReadingView } from "./reading/ReadingView";
import { TodoView } from "./todo/TodoView";
import { ReviewView } from "./review/ReviewView";
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
import { isoDay, setTaskDone } from "./query/pages";
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
import { TabBar, type Tab } from "./TabBar";
import { joinTab as joinTabs, nextPageTab, readSavedTabs, restoredTabs, saveTabs, separateTab as separateTabs, splitOf as splitIn, swapReading, tabsToSave, withReading, withSplit } from "./tabs";
import { Dashboard } from "./Dashboard";
import { TicketView } from "./ticket/TicketView";
import { TicketsView } from "./ticket/TicketsView";
import { isTicketMarkdown } from "./ticket/format";
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
/** Pseudo-path of the to-do list view. */
const TODO_VIEW = "flownote:todo";
const TODO_PATH = "Todo.md";
/** Pseudo-path of the flashcards review. */
const REVIEW_VIEW = "flownote:review";
/** Pseudo-path of the settings page. */
const SETTINGS_VIEW = "flownote:settings";
/** Pseudo-path of the documentation (a read-only note shipped with the app). */
const DOCS_VIEW = "flownote:docs";
/** Views shown in a tab instead of a page. */
const VIEWS: Record<string, { title: string; icon: IconName }> = {
  [TICKETS_VIEW]: { title: "Tickets", icon: "ticket" },
  [GRAPH_VIEW]: { title: "Graphe", icon: "graph" },
  [READING_VIEW]: { title: "Lectures", icon: "bookmark" },
  [TODO_VIEW]: { title: "Tâches", icon: "checkbox" },
  [REVIEW_VIEW]: { title: "Révisions", icon: "cards" },
  [SETTINGS_VIEW]: { title: "Réglages", icon: "sliders" },
  [DOCS_VIEW]: { title: "Documentation", icon: "book" },
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
  templates?: TemplateChoice[];
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
  /** Obsidian's bookmarked files (.obsidian/bookmarks.json), shown as favorites. */
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  /** Obsidian's templates settings (.obsidian/templates.json), null when no folder is set: templates are then hidden. */
  const [templatesConfig, setTemplatesConfig] = useState<TemplatesConfig | null>(null);
  /** `/modèle`: the template list shown, until one is chosen. */
  const [templatePick, setTemplatePick] = useState<{ resolve: (path: string | null) => void } | null>(null);
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
  const [modal, setModal] = useState<"switcher" | "palette" | "help" | "search" | "addLink" | null>(null);
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
  useEffect(() => applyLook(settings.font, settings.blockMenu), [settings.font, settings.blockMenu]);
  // The macOS window is transparent so the sidebar can show the native material
  // (on Linux the window is opaque, with the system title bar).
  useEffect(() => {
    document.documentElement.classList.toggle("native-vibrancy", isTauri() && navigator.userAgent.includes("Mac"));
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
  /** Page on the right of the split view: part of the active tab (one tab for the pair). */
  const splitOf = (id: string) => splitIn(tabsRef.current, id);
  /** Writes the right side's pending changes. */
  const splitSaver = useRef<(() => Promise<void>) | null>(null);
  const [tabMenu, setTabMenu] = useState<{ id: string; anchor: DOMRect } | null>(null);
  const [splitWidth, startSplitResize] = useSplitWidth();
  const setTabPath = (id: string, path: string | null) => setTabs((list) => list.map((t) => (t.id === id ? { ...t, path } : t)));
  /** Sets (or, with null, closes) the page on the right of a tab. */
  const setTabSplit = (id: string, split: string | null) => replaceTabs(withSplit(tabsRef.current, id, split));
  /** Replaces the tab list now (the ref too, for the callbacks that follow). */
  const replaceTabs = (next: Tab[]) => {
    tabsRef.current = next;
    setTabs(next);
  };

  // Latest values for async callbacks.
  const noteRef = useRef(note);
  noteRef.current = note;
  const filesRef = useRef(files);
  filesRef.current = files;
  const images = useRef(new Map<string, string>());
  const saving = useRef<Promise<void>>(Promise.resolve());

  const dirty = note !== null && note.markdown !== note.disk;

  /** The vault's tags, nested, for the sidebar's "Tags" section. */
  const [tags, setTags] = useState<TagNode[]>([]);
  const refreshTags = useCallback(async (v: Vault) => setTags(tagTree(await readAllNotes(v, filesRef.current))), []);
  /** Filters the vault search opens with (a tag clicked in the sidebar). */
  const [searchFilters, setSearchFilters] = useState<SearchFilter[]>([]);

  const refresh = useCallback(async (v: Vault) => {
    const [newTree, newFiles, bookmarksJson, templatesJson] = await Promise.all([
      v.tree(),
      v.files(),
      v.bookmarks?.().catch(() => "{}") ?? "{}",
      v.templatesConfig?.().catch(() => "{}") ?? "{}",
    ]);
    setTemplatesConfig(readTemplatesConfig(templatesJson));
    setTree(newTree);
    setFiles(newFiles);
    filesRef.current = newFiles;
    setBookmarks(bookmarkedFiles(bookmarksJson).filter((p) => newFiles.includes(p)));
    void refreshTags(v);
  }, [refreshTags]);

  const open = async (pending: Vault | null | Promise<Vault | null>) => {
    const picked = await pending;
    if (!picked) return;
    // The views reading every note (dashboard, graph, tickets, bases, backlinks) share one copy of them.
    const opened = withNoteCache(picked);
    try {
      await refresh(opened);
      setConfig(parseObsidianConfig(await opened.obsidianConfig()));
      images.current.forEach((url) => URL.revokeObjectURL(url));
      images.current.clear();
      setVault(opened);
      setNote(null);
      // A vault opens on the tabs it had when it was left, or on the dashboard (FLOWNOTE_OPEN opens a page, for debugging).
      const exists = (path: string) => isView(path) || filesRef.current.includes(path);
      const restored = restoredTabs(readSavedTabs(opened.name), exists, newTabId) ?? { tabs: [{ id: newTabId(), path: null }], active: "" };
      const active = restored.tabs.find((t) => t.id === restored.active) ?? restored.tabs[0];
      tabState.current.clear();
      back.current = [];
      forward.current = [];
      activeRef.current = active.id;
      tabsRef.current = restored.tabs;
      setTabs(restored.tabs);
      setActiveTab(active.id);
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
    [vault, notify],
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

  // The tabs are remembered for the next launch, per vault.
  useEffect(() => {
    if (vault) saveTabs(vault.name, tabsToSave(tabs, activeTab));
  }, [vault, tabs, activeTab]);

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
          await splitSaver.current?.();
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

  const ticketPaths = useMemo(() => {
    const found = new Set<string>();
    const walk = (entries: VaultEntry[]) => entries.forEach((e) => (e.ticket ? found.add(e.path) : e.children && walk(e.children)));
    walk(tree);
    return found;
  }, [tree]);

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
    followWide(moved);
    setTabs((list) => list.map((t) => ({ ...t, path: t.path && !isView(t.path) ? moved(t.path) : t.path, split: t.split ? moved(t.split) : t.split })));
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
    back.current = back.current.filter((p) => !gone(p));
    forward.current = forward.current.filter((p) => !gone(p));
    setTabs((list) => list.map((t) => ({ ...t, path: gone(t.path) ? null : t.path, split: gone(t.split ?? null) ? null : t.split })));
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

  const { createFile, renamePath, renameCurrent, newFolder, renameFolderPath, moveItem, duplicatePage, copyLink, removeFolder, removePage, newPage } = usePageOps({
    vault,
    tree,
    filesRef,
    noteRef,
    config,
    templates,
    ticketPaths,
    settings,
    changeSettings,
    saveNow,
    refresh,
    refreshGit,
    select: (path) => select(path),
    notify,
    setStatus,
    askName,
    askConfirm,
    askNewPage: (request) => new Promise<NameResult | null>((resolve) => setDialog({ ...request, resolve })),
    followMoves,
    forgetRemoved,
  });

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
            const path = await new Promise<string | null>((resolve) => setTemplatePick({ resolve }));
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
  /** The open page is a ticket (front matter type: ticket), read from the loaded text. */
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
  const ticketPage = note !== null && !drawing && !mindmap && !canvasPage && !dashboardPage && !kanbanPage && !basePage && isTicketMarkdown(note.loaded);
  /** Reading mode (per tab, ⌘⇧R): notes, tickets and presentations, nothing editable. */
  const readable = note !== null && !drawing && !mindmap && !canvasPage && !dashboardPage && !kanbanPage && !basePage;
  const readingOn = Boolean(tabs.find((t) => t.id === activeTab)?.reading);
  const reading = readable && readingOn && !rawMode;
  const toggleReading = () => replaceTabs(withReading(tabsRef.current, activeTab, "page", !readingOn));
  /** The open page is a presentation (`marp: true`), read from the current text so a conversion shows at once. */
  const presentationPage = note !== null && !drawing && !mindmap && !canvasPage && !dashboardPage && !kanbanPage && !basePage && !ticketPage && isPresentationMarkdown(note.markdown);
  /**
   * A note's title is its first `# heading` (the file name without one): editing the
   * title writes that heading, never renames the file (titleHeading.ts).
   */
  const titledNote = readable && !ticketPage && !presentationPage && !rawMode;
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
  const rowBase = note !== null && !drawing && !mindmap && !canvasPage && !dashboardPage && !kanbanPage && !basePage && !ticketPage ? baseOfNote(note.path, bases) : null;
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

  /**
   * Opens the dashboard or a view from the sidebar: in the tab already showing
   * it, else in place when the active tab shows a view, else in a new tab (the
   * open page stays where it is).
   */
  const openView = (path: string | null, newTabRequested: boolean) => {
    const existing = tabsRef.current.find((t) => t.path === path);
    if (existing && !newTabRequested) return switchTab(existing.id);
    const current = tabsRef.current.find((t) => t.id === activeRef.current)?.path ?? null;
    if (newTabRequested || (current !== null && !isView(current))) return newTab(path);
    return path === null ? showHome() : select(path, "push");
  };

  /** Shows a page on the right of the active tab (replacing the one there). */
  const openRight = (path: string) => {
    if (!isView(path)) setTabSplit(activeRef.current, path);
  };

  /**
   * Puts the page of another tab on the right of the active one: the two make
   * one tab. A page already on the right goes back to a tab of its own, in
   * place of the one joined.
   */
  const joinTab = (id: string) => {
    const next = joinTabs(tabsRef.current, activeRef.current, id, newTabId(), (path) => !isView(path));
    if (!next) return;
    tabState.current.delete(id);
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
  const liveTitle = note && !basePage ? pageTitle(note.markdown, readable && !ticketPage && !presentationPage) : null;
  const treeTitles = useMemo(() => {
    const found = new Map<string, string>();
    const walk = (entries: VaultEntry[]) => entries.forEach((e) => (e.title && found.set(e.path, e.title), e.children && walk(e.children)));
    walk(tree);
    return found;
  }, [tree]);
  /** How a page is named in the tabs: its title, or its file name (setting of the sidebar). */
  const shownName = (path: string) => (settings.showTitles ? ((note?.path === path ? liveTitle : treeTitles.get(path)) ?? noteTitle(path)) : noteTitle(path));
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
  const pageIconFor = (path: string) => <PageIcon path={path} icon={iconOf(path)} ticket={ticketPaths.has(path)} presentation={isPresentation(path)} row={isBaseRow(path)} />;
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
      command("tickets", "Ouvrir les tickets", "Vues", () => openView(TICKETS_VIEW, false), "ticket"),
      command("readingList", "Ouvrir les lectures", "Vues", () => openView(READING_VIEW, false), "bookmark"),
      command("todoList", "Ouvrir les tâches", "Vues", () => openView(TODO_VIEW, false), "checkbox"),
      command("review", "Réviser les cartes", "Vues", () => openView(REVIEW_VIEW, false), "cards"),
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
      command("addLink", "Ajouter un lien à lire", "Lectures", openAddLink, "bookmark", "addLink"),
    ];
    if (vault?.git) list.push(command("git", "Panneau Git", "Git", () => toggleGit(), "branch", "git"));
    if (page) {
      list.push(
        command("newSubpage", "Nouvelle sous-page", "Créer", () => newPage(page.path), "doc"),
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
  const sidebarHidden = useMemo(() => [settings.ticketsFolder, readingPath, TODO_PATH].filter(Boolean), [settings.ticketsFolder, readingPath]);
  const notePath = note?.path;
  const sidebarLiveIcon = useMemo(() => (notePath ? { path: notePath, icon: liveIcon, title: liveTitle } : undefined), [notePath, liveIcon, liveTitle]);
  const otherVaults = useMemo(
    () => (vault && isTauri() ? recentTauriVaults().filter((root) => root !== currentTauriVault()).map((root) => ({ root, name: root.split("/").filter(Boolean).pop() ?? root })) : []),
    [vault],
  );
  const splitHandlers = useHandlers({
    onOpen: (path: string, newTabRequested: boolean) => (newTabRequested ? void newTab(path) : setTabSplit(activeTab, path)),
    onRenameRow: renamePath,
    onSwap: () => void swapSplit(),
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
    onSelect: (path: string, newTabRequested: boolean) => void select(path, "push", newTabRequested),
    onOpenRight: openRight,
    onNewPage: (parent: string | null) => void newPage(parent),
    onNewPageInFolder: (folder: string) => void newPage(null, undefined, folder),
    onDelete: (path: string) => void removePage(path),
    onDuplicate: (path: string) => void duplicatePage(path),
    onCopyLink: (path: string) => void copyLink(path),
    onReveal: vault?.reveal ? (path: string) => void vault.reveal!(path).catch((error: unknown) => setStatus(String(error))) : undefined,
    onNewFolder: (parent: string) => void newFolder(parent),
    onRenameFolder: (folder: string) => void renameFolderPath(folder),
    onDeleteFolder: (folder: string) => void removeFolder(folder),
    onMove: (item: { path: string; folder: boolean }, target: string) => void moveItem(item, target),
    onRename: (path: string) => void askName("Renommer la page", noteTitle(path)).then((name) => (name ? renamePath(path, name) : false)),
    onSearch: () => setModal("switcher"),
    onVaultSearch: () => {
      setSearchFilters([]);
      setModal("search");
    },
    onTag: (tag: string) => {
      setSearchFilters([{ kind: "tag", tag }]);
      setModal("search");
    },
    onHome: (newTabRequested: boolean) => void openView(null, newTabRequested),
    onTickets: (newTabRequested: boolean) => void openView(TICKETS_VIEW, newTabRequested),
    onGraph: (newTabRequested: boolean) => void openView(GRAPH_VIEW, newTabRequested),
    onTodo: (newTabRequested: boolean) => void openView(TODO_VIEW, newTabRequested),
    onReview: (newTabRequested: boolean) => void openView(REVIEW_VIEW, newTabRequested),
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

  /** A tab's menu (menus.ts): the split view's actions, then closing it. */
  const tabMenuItems = (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    return tabMenuOf({
      path: tab?.path ?? null,
      split: tab?.split,
      isActive: id === activeTab,
      activeTitle: activePath === null ? "Accueil" : (VIEWS[activePath]?.title ?? noteTitle(activePath)),
      otherPage: tabs.some((t) => t.id !== activeTab && t.path !== null && !isView(t.path)),
      isView,
      swapSplit: () => void swapSplit(),
      separate: () => void separateTab(id),
      closeSplit: () => setTabSplit(id, null),
      join: () => joinTab(id),
      toggleSplit,
      close: () => void closeTab(id),
    });
  };

  const sidebar = (
    <Sidebar
      vaultName={vault.name}
      tree={tree}
      ticketsFolder={settings.ticketsFolder}
      hidden={sidebarHidden}
      selected={note?.path}
      view={activePath === null ? "home" : activePath === TICKETS_VIEW ? "tickets" : activePath === GRAPH_VIEW ? "graph" : activePath === TODO_VIEW ? "todo" : activePath === REVIEW_VIEW ? "review" : activePath === READING_VIEW ? "reading" : activePath === SETTINGS_VIEW ? "settings" : activePath === DOCS_VIEW ? "docs" : null}
      liveIcon={sidebarLiveIcon}
      showTitles={settings.showTitles}
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
        canBack={back.current.length > 0}
        canForward={forward.current.length > 0}
        onBack={goBack}
        onForward={goForward}
      >
        <TabBar
          tabs={tabs}
          active={activeTab}
          dirty={dirty}
          titleOf={(tab) => (tab.path === null ? "Accueil" : (VIEWS[tab.path]?.title ?? shownName(tab.path)))}
          iconOf={(tab) =>
            tab.path === null ? <Icon name="home" size={13} /> : isView(tab.path) ? <Icon name={VIEWS[tab.path].icon} size={13} /> : <PageIcon path={tab.path} icon={iconOf(tab.path)} ticket={ticketPaths.has(tab.path)} presentation={isPresentation(tab.path)} size={13} />
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
            {peek && (
              <div className="sidebar-dock floating" onMouseEnter={openPeek} onMouseLeave={closePeekSoon}>
                {sidebar}
              </div>
            )}
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
              note ? (
                <>
                  <Breadcrumbs vaultName={vault.name} path={note.path} files={files} onOpen={(path) => void select(path)} onRename={renameCurrent} iconOf={pageIconFor} />
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
                  {!drawing && !mindmap && !canvasPage && !dashboardPage && !kanbanPage && !basePage && <ToolButton icon="outline" label="Plan de la note" onClick={toggleOutline} active={showOutline && !outlineHidden} />}
                  {readable && <ToolButton icon="eye" label={reading ? "Quitter le mode lecture (⌘⇧R)" : "Mode lecture (⌘⇧R)"} onClick={toggleReading} active={reading} disabled={rawMode} />}
                  {readable && !reading && settings.spellChecker !== "off" && (
                    <ToolButton icon="spelling" label={spellingOn ? "Désactiver la correction orthographique" : "Activer la correction orthographique"} onClick={toggleSpelling} active={spellingOn} />
                  )}
                  {presentationPage && (
                  <>
                    <ToolButton icon="slides" label="Miniatures des diapos" onClick={() => setShowSlides(!showSlides)} active={showSlides} />
                    <ToolButton icon="play" label="Présenter (⌘⌥P)" onClick={() => present()} disabled={!slides} />
                    <ToolButton icon="export" label="Exporter en HTML" onClick={() => void exportCurrent()} />
                  </>
                )}
                {!drawing && !mindmap && !canvasPage && !dashboardPage && !kanbanPage && !basePage && !ticketPage && !presentationPage && !reading && <ToolButton icon="slides" label="Transformer en présentation" onClick={convertToPresentation} />}
                {vault.git && gitChanges !== null && <ToolButton icon="clock" label="Historique de la note" onClick={() => setShowHistory(!showHistory)} active={showHistory} />}
                  {!drawing && !mindmap && !canvasPage && !dashboardPage && !kanbanPage && !basePage && !presentationPage && (
                    <ToolButton icon="width" label={widePages.has(note.path) ? "Largeur normale" : "Pleine largeur"} onClick={() => toggleWide(note.path)} active={widePages.has(note.path)} />
                  )}
                  <ToolButton icon="focus" label={focusMode ? "Quitter le mode focus (⌘⇧M)" : "Mode focus (⌘⇧M)"} onClick={toggleFocus} active={focusMode} />
                  {!basePage && !ticketPage && !canvasPage && !dashboardPage && !kanbanPage && (
                    <ToolButton icon="more" label="Exporter, copier…" onClick={(event) => setPageMenu(event.currentTarget.getBoundingClientRect())} active={pageMenu !== null} disabled={rawMode} />
                  )}
                  <ToolButton icon="raw" label={drawing ? "Voir le fichier brut, JSON du dessin (⌘⇧E)" : mindmap ? "Voir le fichier brut de la mind map (⌘⇧E)" : basePage ? "Voir le fichier .base (⌘⇧E)" : canvasPage ? "Voir le fichier .canvas (⌘⇧E)" : "Mode Markdown brut (⌘⇧E)"} onClick={toggleRaw} active={rawMode} />
                </div>
              )
            }
          />
          {pageMenu && note && (
            <PopoverMenu
              anchor={pageMenu}
              onClose={() => setPageMenu(null)}
              items={[
                { label: "Exporter en PDF…", icon: "export", run: () => void exportCurrentPdf() },
                ...(!drawing && !mindmap && !canvasPage && !dashboardPage && !kanbanPage && !presentationPage ? [{ label: "Exporter en HTML…", icon: "export", run: () => void exportAsHtml() } satisfies MenuItem] : []),
              ]}
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
                  {!rawMode && !ticketPage && (
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
                  {ticketPage && !rawMode ? (
                    <TicketView
                      key={`${note.path}#${note.reloads ?? 0}`}
                      path={note.path}
                      source={note.loaded}
                      markdown={note.markdown}
                      onMarkdown={onMarkdown}
                      bridge={bridge}
                      editable={!hasConflictMarkers(note.disk) && !reading}
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
                  {!rawMode && !ticketPage && !presentationPage && (
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
              <div className="page docs-page">
                <NoteEditor key={`docs-${dark}`} source={DOCUMENTATION} onMarkdown={() => {}} bridge={docsBridge(dark)} editable={false} properties={false} />
              </div>
            ) : activePath === SETTINGS_VIEW ? (
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
            ) : activePath === TODO_VIEW ? (
              <TodoView key={activeTab} vault={vault} path={TODO_PATH} exists={files.includes(TODO_PATH)} onCreated={() => void refresh(vault)} />
            ) : activePath === REVIEW_VIEW ? (
              <ReviewView key={activeTab} vault={vault} files={files} bridge={bridge} onOpenNote={(path, newTabRequested) => void select(path, "push", newTabRequested)} />
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
                onColumns={(ticketColumns) => {
                  const next = { ...settings, ticketColumns };
                  setSettings(next);
                  saveSettings(next);
                }}
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
              onOpenTodo={() => void select(TODO_VIEW, "push", false)}
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
                ticketColumns={settings.ticketColumns}
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
          onDone={(ok) => {
            confirm.resolve(ok);
            setConfirm(null);
          }}
        />
      )}
      {modal === "switcher" && (
        <QuickSwitcher files={files} iconOf={pageIconFor} onOpen={(path) => void select(path)} onCreate={(name) => void newPage(null, name)} onCommands={() => setModal("palette")} onClose={() => setModal(null)} />
      )}
      {modal === "palette" && <CommandPalette commands={paletteCommands()} onClose={() => setModal(null)} />}
      {modal === "search" && (
        <VaultSearch
          vault={vault}
          initialQuery={searchFilters.length ? "" : (findRequest?.query ?? selectedText())}
          initialFilters={searchFilters}
          iconOf={pageIconFor}
          onOpen={(hit, occurrence, query) => {
            setRawMode(false);
            void select(hit.path).then(() => setFindRequest({ query, occurrence, nonce: Date.now() }));
          }}
          onOpenPage={(path) => void select(path)}
          onClose={() => setModal(null)}
        />
      )}
      {presenting !== null && slides && presentationPage && <Presenter rendered={slides} start={presenting} onClose={() => setPresenting(null)} />}
      {modal === "help" && <ShortcutsHelp onClose={() => setModal(null)} />}
      {modal === "addLink" && <AddLinkDialog themes={readingThemes} tags={readingTags} fetchTitles={settings.fetchTitles} onAdd={addReading} onClose={() => setModal(null)} />}
      {templatePick && templates && (
        <TemplateDialog
          templates={templates.files.map((path) => ({ path, name: templateName(templates.config, path) }))}
          onDone={(path) => {
            templatePick.resolve(path);
            setTemplatePick(null);
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
