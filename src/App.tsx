import { useCallback, useEffect, useRef, useState } from "react";
import { NoteEditor } from "./editor/NoteEditor";
import { imageMime, type VaultBridge } from "./editor/bridge";
import { ConfirmDialog, NameDialog, type NameResult, type PageKind } from "./Dialogs";
import { DRAWING_SUFFIX, isDrawingPath, newDrawingFile } from "./drawing/format";
import { isNotebookMarkdown, newNotebookFile } from "./notebook/format";
import { demoDrawing } from "./drawing/demo";
import { demoNotebook } from "./notebook/demo";
import { DrawingEditor, type DrawingControls, type DrawingTool } from "./drawing/DrawingEditor";
import { PageTitle } from "./PageTitle";
import { QuickSwitcher } from "./QuickSwitcher";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { applyTheme, loadSettings, saveSettings, SettingsDialog, type Settings } from "./SettingsDialog";
import { deletePage, renamePage, subpagesOf } from "./vault/pageOps";
import { Sidebar } from "./Sidebar";
import { GitPanel } from "./GitPanel";
import { ToolButton, ToolGroup, Toolbar } from "./Toolbar";
import { Breadcrumbs } from "./Breadcrumbs";
import { OutlinePanel } from "./OutlinePanel";
import { RawEditor } from "./RawEditor";
import { FindBar, type FindRequest } from "./FindBar";
import { VaultSearch } from "./VaultSearch";
import { setGrammarChecker, setSystemSpellcheck, type ParagraphResult } from "./editor/grammar";
import type { Editor } from "@tiptap/core";
import { Icon, type IconName } from "./Icon";
import { HistoryPanel } from "./HistoryPanel";
import { browserVaultSupported, ConflictError, createMemoryVault, openBrowserVault, type Vault, type VaultEntry } from "./vault/vault";
import { DEFAULT_CONFIG, linkTextFor, newNoteFolder, noteTitle, parseObsidianConfig, sanitizeName, subpageFolder, uniquePath, type ObsidianConfig } from "./vault/links";
import { FULL_NOTE } from "./markdown/fixtures";
import { hasConflictMarkers } from "./vault/conflicts";
import { forgetTauriVault, isTauri, lastTauriVault, openTauriVault, pickTauriVault, recentTauriVaults } from "./vault/tauriVault";
import { Welcome } from "./Welcome";
import { invoke } from "@tauri-apps/api/core";

/** Narrowest Git panel, also its default width. */
const GIT_MIN_WIDTH = 300;

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

/** Drawing tools of the toolbar: Excalidraw tool, icon, label with its shortcut. */
const DRAWING_TOOLS: [DrawingTool, IconName, string][] = [
  ["selection", "pointer", "Sélection (V)"],
  ["hand", "hand", "Déplacer la vue (H)"],
  ["rectangle", "rectangle", "Rectangle (R)"],
  ["diamond", "diamond", "Losange (D)"],
  ["ellipse", "ellipse", "Ellipse (O)"],
  ["arrow", "arrow", "Flèche (A)"],
  ["line", "line", "Trait (L)"],
  ["freedraw", "pencil", "Crayon (P)"],
  ["text", "text", "Texte (T)"],
  ["image", "image", "Image (9)"],
  ["eraser", "eraser", "Gomme (E)"],
];

interface Dialog {
  title: string;
  initial: string;
  folders?: string[];
  folder?: string;
  kinds?: boolean;
  resolve: (result: NameResult | null) => void;
}

interface Confirm {
  message: string;
  confirmLabel: string;
  resolve: (confirmed: boolean) => void;
}

const AUTOSAVE_DELAY_MS = 700;

/** The simulated remote changed the same line of "Projets.md": edit it locally, commit, then pull to see a conflict. */
const DEMO_REMOTE = { "Projets.md": "# Projets\n\n[[Mon Notion]] — modifié sur un autre ordinateur\n" };

const DEMO_FILES = {
  "Exemple.md": FULL_NOTE,
  "Projets.md": "# Projets\n\n[[Mon Notion]]\n",
  "Projets/Mon Notion.md": "Une sous-page de [[Projets]].\n",
  "Croquis.excalidraw.md": demoDrawing(),
  "Analyse.md": demoNotebook(),
};

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
  // The Git drawer stays mounted while it slides out, so it leaves the way it came in.
  const [gitOpen, setGitOpen] = useState(false);
  const [gitMounted, setGitMounted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [gitChanges, setGitChanges] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [modal, setModal] = useState<"switcher" | "help" | "settings" | "search" | null>(null);
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
  useEffect(() => {
    const grammalecte = isTauri() && settings.spellChecker === "grammalecte";
    setGrammarChecker(grammalecte ? (paragraphs) => invoke<ParagraphResult[]>("grammar_check", { paragraphs }) : null);
    // Outside the desktop app, the Grammalecte choice falls back to the system checker.
    setSystemSpellcheck(settings.spellChecker === "system" || (settings.spellChecker === "grammalecte" && !isTauri()));
  }, [settings.spellChecker]);
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [drawingControls, setDrawingControls] = useState<DrawingControls | null>(null);
  const [drawingTool, setDrawingTool] = useState("selection");
  /** Light or dark, as displayed (the "system" setting follows macOS). */
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;
  const [showOutline, setShowOutline] = useState(() => {
    try {
      return localStorage.getItem("flownote:outline") === "shown";
    } catch {
      return false;
    }
  });
  /** Outline set aside while the Git panel is open (the preference is kept). */
  const [outlineHidden, setOutlineHidden] = useState(false);
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
    setShowOutline((shown) => {
      try {
        localStorage.setItem("flownote:outline", shown ? "hidden" : "shown");
      } catch {
        // not remembered
      }
      return !shown;
    });
  };
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem("flownote:sidebar") !== "hidden";
    } catch {
      return true;
    }
  });
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      try {
        localStorage.setItem("flownote:sidebar", open ? "hidden" : "shown");
      } catch {
        // not remembered
      }
      return !open;
    });
  }, []);
  useEffect(() => applyTheme(settings.theme), [settings.theme]);
  // The desktop window is transparent so the sidebar can show the native macOS material.
  useEffect(() => {
    document.documentElement.classList.toggle("native-vibrancy", isTauri());
  }, []);

  const [gitWidth, setGitWidth] = useState(() => {
    try {
      return Number(localStorage.getItem("flownote:git-width")) || GIT_MIN_WIDTH;
    } catch {
      return GIT_MIN_WIDTH;
    }
  });
  const [resizingGit, setResizingGit] = useState(false);
  /** Drag on the drawer's left edge; the width is remembered. */
  const startGitResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = gitWidth;
    let width = startWidth;
    setResizingGit(true);
    const move = (e: PointerEvent) => {
      width = Math.round(Math.min(Math.max(startX - e.clientX + startWidth, GIT_MIN_WIDTH), window.innerWidth * 0.7));
      setGitWidth(width);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizingGit(false);
      try {
        localStorage.setItem("flownote:git-width", String(width));
      } catch {
        // not remembered
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const gitOpenRef = useRef(false);
  const toggleGit = useCallback((open?: boolean) => {
    const next = open ?? !gitOpenRef.current;
    gitOpenRef.current = next;
    if (!next) return setGitOpen(false);
    // Git and the outline share the right edge: Git takes the place.
    setOutlineHidden(true);
    // Mount closed, then open on the next frame so the drawer slides in.
    setGitMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => gitOpenRef.current && setGitOpen(true)));
  }, []);
  // Visited pages, for back/forward navigation.
  const back = useRef<string[]>([]);
  const forward = useRef<string[]>([]);

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
      // Reopen the last note of this vault (or FLOWNOTE_OPEN in the desktop app, for debugging).
      const forced = isTauri() ? await invoke<string | null>("startup_note").catch(() => null) : null;
      const last = forced ?? localStorage.getItem(`flownote:last-note:${opened.name}`);
      if (last) setPendingOpen(last);
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
      } catch (error) {
        setStatus(error instanceof ConflictError ? `Conflit : ${error.message} Rechargez la note.` : String(error));
        throw error;
      }
    };
    saving.current = saving.current.then(run, run);
    return saving.current;
  }, [vault, refreshGit]);

  // Autosave, like Notion and Obsidian (can be turned off in the settings).
  useEffect(() => {
    if (!dirty || !settings.autosave) return;
    const timer = window.setTimeout(() => void saveNow().catch(() => {}), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [note?.markdown, dirty, saveNow, settings.autosave]);

  const select = useCallback(
    async (path: string, navigation: "push" | "history" = "push") => {
      if (!vault) return;
      try {
        await saveNow();
      } catch {
        return; // keep the note open so the conflict can be resolved
      }
      let disk: string;
      try {
        disk = await vault.read(path);
      } catch (error) {
        return setStatus(`Impossible d'ouvrir ${path} : ${String(error)}`);
      }
      const previous = noteRef.current?.path;
      if (navigation === "push" && previous && previous !== path) {
        back.current.push(previous);
        forward.current = [];
      }
      setNote({ path, loaded: disk, disk, markdown: disk });
      setStatus("");
      try {
        localStorage.setItem(`flownote:last-note:${vault.name}`, path);
      } catch {
        // not remembered
      }
    },
    [vault, saveNow],
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
    else if (key === "p" || key === "k" || key === "o") run(() => setModal("switcher"));
    else if (key === "n" && !event.shiftKey) run(() => void newPage(null));
    else if (key === "[") run(goBack);
    else if (key === "]") run(goForward);
    else if (key === "g" && event.shiftKey) run(() => toggleGit());
    else if (key === "/") run(() => setModal("help"));
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
    return [...folders].sort((a, b) => a.localeCompare(b, "fr"));
  };
  const askConfirm = (message: string, confirmLabel: string) => new Promise<boolean>((resolve) => setConfirm({ message, confirmLabel, resolve }));

  /** Renames the open page from its title; links across the vault follow. */
  const renameCurrent = async (title: string): Promise<boolean> => {
    const current = noteRef.current;
    if (!vault || !current) return false;
    try {
      await saveNow();
      const result = await renamePage(vault, current.path, title);
      await refresh(vault);
      const disk = await vault.read(result.path);
      back.current = back.current.map((p) => (p === current.path ? result.path : p));
      setNote({ path: result.path, loaded: disk, disk, markdown: disk });
      const others = result.updatedNotes.filter((p) => p !== result.path).length;
      setStatus(others > 0 ? `Page renommée ; liens mis à jour dans ${others} note${others > 1 ? "s" : ""}.` : "Page renommée.");
      void refreshGit();
      return true;
    } catch (error) {
      setStatus(String(error));
      return false;
    }
  };

  const removePage = async (path: string) => {
    if (!vault) return;
    const children = subpagesOf(path, filesRef.current).length;
    const where = isTauri() ? "Elle ira dans la corbeille." : "Cette suppression est définitive.";
    const withChildren = children === 0 ? "" : children === 1 ? " et sa sous-page" : ` et ses ${children} sous-pages`;
    const message = `Supprimer « ${noteTitle(path)} »${withChildren} ? ${where}`;
    if (!(await askConfirm(message, "Supprimer"))) return;
    try {
      if (noteRef.current?.path === path) await saveNow();
      await deletePage(vault, path, filesRef.current);
      await refresh(vault);
      back.current = back.current.filter((p) => p !== path);
      forward.current = forward.current.filter((p) => p !== path);
      if (noteRef.current && (noteRef.current.path === path || noteRef.current.path.startsWith(`${subpageFolder(path)}/`))) setNote(null);
      void refreshGit();
    } catch (error) {
      setStatus(String(error));
    }
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
  const newPage = async (parent: string | null, presetName?: string, inFolder?: string) => {
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
          resolve,
        }),
      );
      if (!result) return;
      name = result.name;
      kind = result.kind;
      if (chooseFolder) folder = result.folder;
    }
    const title = sanitizeName(name) || "Sans titre";
    const path = uniquePath(folder, `${title}${kind === "drawing" ? DRAWING_SUFFIX : ".md"}`, filesRef.current);
    try {
      await saveNow();
      await createFile(path, kind === "drawing" ? newDrawingFile() : kind === "notebook" ? newNotebookFile() : "");
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

  /** The open page is a notebook (front matter with marimo-version), read from the loaded text. */
  const notebookPage = note !== null && !isDrawingPath(note.path) && isNotebookMarkdown(note.loaded);

  const bridge: VaultBridge = {
    notePath: note?.path ?? "",
    notebook: notebookPage,
    // Read through a ref: callbacks may run between renders, after a file was created.
    get files() {
      return filesRef.current;
    },
    config,
    loadImage: async (path) => {
      const cached = images.current.get(path);
      if (cached || !vault) return cached ?? "";
      const bytes = await vault.readBinary(path);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: imageMime(path) }));
      images.current.set(path, url);
      return url;
    },
    openPath: (path) => void select(path),
    askName,
    createFile,
  };

  const onMarkdown = useCallback((markdown: string) => setNote((current) => (current ? { ...current, markdown } : current)), []);

  /** The open page is a drawing (Name.excalidraw.md). */
  const drawing = note !== null && isDrawingPath(note.path);

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

  return (
    <div className={sidebarOpen ? "layout" : "layout no-sidebar"}>
      {sidebarOpen && (
        <div className="sidebar-dock" data-tauri-drag-region>
        <Sidebar
          onDelete={(path) => void removePage(path)}
          onSearch={() => setModal("switcher")}
          vaultName={vault.name}
          tree={tree}
          selected={note?.path}
          onSelect={(path) => void select(path)}
          onNewPage={(parent) => void newPage(parent)}
          onNewPageInFolder={(folder) => void newPage(null, undefined, folder)}
        />
        </div>
      )}
      <main className="content">
        <Toolbar
          left={
            <>
              <ToolGroup>
                <ToolButton icon="sidebar" label="Afficher ou masquer la barre latérale (⌘\)" onClick={toggleSidebar} active={sidebarOpen} />
              </ToolGroup>
              <ToolGroup>
                <ToolButton icon="chevronLeft" label="Page précédente (⌘[)" onClick={goBack} disabled={back.current.length === 0} />
                <ToolButton icon="chevronRight" label="Page suivante (⌘])" onClick={goForward} disabled={forward.current.length === 0} />
              </ToolGroup>
              {drawing && note && (
                <>
                  <Breadcrumbs vaultName={vault.name} path={note.path} files={files} onOpen={(path) => void select(path)} onRename={renameCurrent} />
                  <span className={dirty ? "save-state dirty" : "save-state"}>{dirty ? (settings.autosave ? "Enregistrement…" : "Non enregistré · ⌘S") : "Enregistré"}</span>
                </>
              )}
            </>
          }
          center={
            drawing && !rawMode ? (
              <ToolGroup>
                {DRAWING_TOOLS.map(([tool, icon, label]) => (
                  <ToolButton key={tool} icon={icon} label={label} active={drawingTool === tool} disabled={!drawingControls} onClick={() => drawingControls?.setTool(tool)} />
                ))}
              </ToolGroup>
            ) : drawing ? (
              status && <span className="status warning">{status}</span>
            ) : note ? (
              <>
                <Breadcrumbs vaultName={vault.name} path={note.path} files={files} onOpen={(path) => void select(path)} onRename={renameCurrent} />
                <span className={dirty ? "save-state dirty" : "save-state"}>{dirty ? (settings.autosave ? "Enregistrement…" : "Non enregistré · ⌘S") : "Enregistré"}</span>
                {status && <span className="status warning">{status}</span>}
              </>
            ) : (
              <span className="toolbar-location">{vault.name}</span>
            )
          }
          right={
            <>
              <ToolGroup>
                <ToolButton icon="search" label="Rechercher une page (⌘P)" onClick={() => setModal("switcher")} />
                <ToolButton icon="replace" label="Rechercher dans le vault (⌘⇧F)" onClick={() => setModal("search")} />
                <ToolButton icon="compose" label="Nouvelle page (⌘N)" onClick={() => void newPage(null)} />
              </ToolGroup>
              {note && (
                <ToolGroup>
                  {!drawing && <ToolButton icon="outline" label="Plan de la note" onClick={toggleOutline} active={showOutline && !outlineHidden} />}
                  {vault.git && gitChanges !== null && <ToolButton icon="clock" label="Historique de la note" onClick={() => setShowHistory(!showHistory)} active={showHistory} />}
                  <ToolButton icon="raw" label={drawing ? "Voir le fichier brut, JSON du dessin (⌘⇧E)" : "Mode Markdown brut (⌘⇧E)"} onClick={toggleRaw} active={rawMode} />
                </ToolGroup>
              )}
              <ToolGroup>
                {vault.git && gitChanges !== null && <ToolButton icon="branch" label="Git (⌘⇧G)" onClick={() => toggleGit()} active={gitOpen} badge={gitChanges} />}
                <ToolButton icon="sliders" label="Réglages" onClick={() => setModal("settings")} />
                <ToolButton icon="question" label="Raccourcis (⌘/)" onClick={() => setModal("help")} />
              </ToolGroup>
            </>
          }
        />
        {note ? (
          <>
            {findRequest && !rawMode && !drawing && <FindBar editor={editor} request={findRequest} onClose={() => setFindRequest(null)} />}
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
              ) : (
              <div className="page">
                {hasConflictMarkers(note.disk) && (
                  <div className="conflict-note-banner">
                    <span>Cette note contient un conflit de fusion : elle est en lecture seule jusqu'à sa résolution.</span>
                    {vault.git && <button onClick={() => toggleGit(true)}>Résoudre</button>}
                  </div>
                )}
                {!rawMode && <PageTitle title={noteTitle(note.path)} onRename={renameCurrent} readOnly={hasConflictMarkers(note.disk)} />}
                {rawMode ? (
                  <RawEditor key={`${note.path}#${note.reloads ?? 0}`} value={note.markdown} onChange={onMarkdown} readOnly={hasConflictMarkers(note.disk)} />
                ) : (
                  <NoteEditor key={`${note.path}#${note.reloads ?? 0}`} source={note.loaded} onMarkdown={onMarkdown} bridge={bridge} editable={!hasConflictMarkers(note.disk)} onEditor={setEditor} />
                )}
              </div>
              )}
              {showOutline && !outlineHidden && !rawMode && !drawing && <OutlinePanel editor={editor} onClose={toggleOutline} />}
              {showHistory && vault.git && (
                <HistoryPanel git={vault.git} path={note.path} current={note.disk} onRestore={restoreVersion} onClose={() => setShowHistory(false)} />
              )}
            </div>
          </>
        ) : (
          <p className="empty">Choisissez une page dans la barre latérale.</p>
        )}
      </main>
      {gitMounted && vault.git && (
        <aside
          className={`git-drawer${gitOpen ? " open" : ""}${resizingGit ? " resizing" : ""}`}
          style={{ width: gitOpen ? gitWidth : 0 }}
          aria-label="Gestionnaire Git"
          onTransitionEnd={(e) => e.target === e.currentTarget && !gitOpen && setGitMounted(false)}
        >
          <div className="git-drawer-resize" onPointerDown={startGitResize} role="separator" aria-orientation="vertical" aria-label="Redimensionner le panneau Git" />
          <div className="git-drawer-inner" style={{ width: gitWidth }}>
          <div className="git-drawer-header">
            <span>Git</span>
            <button onClick={() => toggleGit(false)} aria-label="Fermer le panneau Git" title="Fermer (⌘⇧G)">
              <Icon name="close" size={14} />
            </button>
          </div>
          <div className="git-drawer-body">
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
          </div>
          </div>
        </aside>
      )}
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
        <QuickSwitcher files={files} onOpen={(path) => void select(path)} onCreate={(name) => void newPage(null, name)} onClose={() => setModal(null)} />
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
      {modal === "help" && <ShortcutsHelp onClose={() => setModal(null)} />}
      {modal === "settings" && (
        <SettingsDialog
          settings={settings}
          vaultName={vault.name}
          grammarAvailable={isTauri()}
          onChange={(next) => {
            setSettings(next);
            saveSettings(next);
          }}
          onChangeVault={() => {
            setModal(null);
            void saveNow()
              .catch(() => {})
              // Back to the welcome screen: recent vaults, or another folder.
              .then(() => {
                setVault(null);
                setNote(null);
                setStatus("");
              });
          }}
          onClose={() => setModal(null)}
        />
      )}
      {dialog && (
        <NameDialog
          title={dialog.title}
          initial={dialog.initial}
          folders={dialog.folders}
          folder={dialog.folder}
          kinds={dialog.kinds}
          onDone={(result) => {
            dialog.resolve(result);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
