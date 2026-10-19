import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SplitPane } from "../SplitPane";
import { mountBase, type EmbedProps } from "../base/EmbeddedBase";
import { imageMime, NULL_BRIDGE, type VaultBridge } from "../editor/bridge";
import { useHandlers } from "../hooks/useHandlers";
import { useWidePages } from "../hooks/useWidePages";
import { linkFromParent, planPage, ticketPathsOf } from "../pageCreate";
import type { PageKind } from "../pageKinds";
import { applyTheme, type SpellChecker, type Theme } from "../SettingsPage";
import { useSpellChecking } from "../editor/useSpellChecking";
import { DEFAULT_COLUMNS, normalizeColumns, type TicketColumn } from "../ticket/board";
import { recordRecentPage } from "../dashboard/recents";
import type { FindRequest } from "../FindBar";
import { AddLinkDialog } from "../reading/AddLinkDialog";
import { addLink, newReadingList, parseReadingList, readingTagsOf } from "../reading/readingList";
import { DEFAULT_CONFIG, parseObsidianConfig, subpageFolder, type ObsidianConfig } from "../vault/links";
import { callNative, nativeVault } from "../vault/nativeVault";
import { deletePage, moveFolder, movePage, renameFolder, renamePage } from "../vault/pageOps";
import type { VaultEntry } from "../vault/vault";
import { isBasePath } from "../base/baseFile";
import { SHELL_VIEWS, ShellView } from "./ShellView";
import { NativeToolsContext, type NativeTool, type NativeTools } from "../nativeTools";

/** Settings chosen in the shell's native Settings window. */
export interface ShellSettings {
  theme: Theme;
  autosave: boolean;
  ticketsFolder: string;
  readingList: string;
  spellChecker: SpellChecker;
  fetchTitles: boolean;
  ticketColumns: TicketColumn[];
}

/**
 * Operations of the native sidebar, run here so that links and bases follow
 * exactly as in the web app (pageOps.ts). Each resolves to the page to show, if any.
 */
export type ShellOperation =
  | { op: "newPage"; kind: PageKind; name: string; folder: string; parent: string | null }
  | { op: "rename"; path: string; title: string }
  | { op: "renameFolder"; folder: string; title: string }
  | { op: "move"; path: string; folder: string; isFolder: boolean }
  | { op: "delete"; path: string }
  | { op: "deleteFolder"; folder: string };

declare global {
  interface Window {
    flownoteShell?: {
      open(path: string | null): void;
      settings(settings: ShellSettings): void;
      /** The vault changed on disk (another window, Obsidian, iCloud). */
      refresh(): void;
      run(operation: ShellOperation): Promise<{ path: string | null; renamed?: [string, string][] }>;
      /** A button of the page's toolbar, clicked in the native toolbar. */
      tool(id: string): void;
      /** ⌘F / ⌥⌘F: find (and replace) in the note. */
      find(replace: boolean): void;
      /** ⌘⇧L: adds a link to the reading list. */
      addLink(): void;
    };
  }
}

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

/** One page of the vault, inside a tab of the native shell. */
export function EmbedPage({ vaultName, git, initialPath, initialSettings }: { vaultName: string; git: boolean; initialPath: string | null; initialSettings: ShellSettings }) {
  const vault = useMemo(() => nativeVault(vaultName, git), [vaultName, git]);
  const [path, setPath] = useState(initialPath);
  const [settings, setSettings] = useState(initialSettings);
  const [files, setFiles] = useState<string[]>([]);
  const [tree, setTree] = useState<VaultEntry[]>([]);
  const [config, setConfig] = useState<ObsidianConfig>(DEFAULT_CONFIG);
  const [dark, setDark] = useState(systemDark);
  const [reading, setReading] = useState(false);
  const [spelling, toggleSpelling] = useSpellChecking(settings.spellChecker);
  const [reloads, setReloads] = useState(0);
  const [find, setFind] = useState<FindRequest | null>(null);
  const [adding, setAdding] = useState<{ themes: string[]; tags: string[] } | null>(null);
  const [readingVersion, setReadingVersion] = useState(0);
  const [widePages, toggleWide, followWide] = useWidePages();
  const anchor = useRef<HTMLDivElement>(null);
  const tools = useMemo(() => nativeTools(anchor), []);
  const filesRef = useRef(files);
  filesRef.current = files;
  const saver = useRef<(() => Promise<void>) | null>(null);
  const images = useRef(new Map<string, string>());

  const refresh = useCallback(async () => {
    const [nextFiles, nextTree] = await Promise.all([vault.files(), vault.tree()]);
    filesRef.current = nextFiles;
    setFiles(nextFiles);
    setTree(nextTree);
  }, [vault]);

  useEffect(() => {
    void refresh();
    void vault.obsidianConfig().then((json) => setConfig(parseObsidianConfig(json)));
  }, [vault, refresh]);

  useEffect(() => {
    applyTheme(settings.theme);
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => setDark(query.matches);
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [settings.theme]);

  const notify = useCallback((message: string) => void callNative("notify", { message }).catch(() => {}), []);
  const report = useCallback((error: unknown) => notify(error instanceof Error ? error.message : String(error)), [notify]);
  const openPath = useCallback((target: string, newTab = false) => void callNative("open_path", { path: target, newTab }).catch(report), [report]);

  const loadImage = useCallback(
    async (image: string) => {
      const cached = images.current.get(image);
      if (cached) return cached;
      const url = URL.createObjectURL(new Blob([(await vault.readBinary(image)) as BlobPart], { type: imageMime(image) }));
      images.current.set(image, url);
      return url;
    },
    [vault],
  );

  /** After pages moved: the open page and its width follow; the shell is told so its tabs follow too. */
  const moved = useCallback(
    async (renames: [string, string][]) => {
      const map = new Map(renames);
      followWide((p) => map.get(p) ?? p);
      setPath((current) => (current && map.has(current) ? map.get(current)! : current));
      await refresh();
      setReloads((n) => n + 1);
      return renames;
    },
    [followWide, refresh],
  );

  const renameRow = useCallback(
    async (row: string, name: string) => {
      try {
        await saver.current?.();
        const result = await renamePage(vault, row, name);
        await moved([[row, result.path]]);
        void callNative("pages_moved", { renames: [[row, result.path]] });
        return true;
      } catch (error) {
        report(error);
        return false;
      }
    },
    [vault, moved, report],
  );

  const embedProps = useRef<EmbedProps | null>(null);
  embedProps.current = { vault, files, editable: true, onOpen: openPath, onRenameRow: renameRow, onChanged: () => void refresh(), loadImage };

  const bridgeLatest = useRef<VaultBridge>(NULL_BRIDGE);
  bridgeLatest.current = {
    notePath: path ?? "",
    files,
    config,
    loadImage,
    openPath,
    askName: (title, initial) => callNative<string | null>("ask_name", { title, initial }),
    createFile: async (file, content) => {
      await vault.create(file, content);
      await refresh();
    },
    mountBase: (dom, base) => {
      const mounted = mountBase(dom, base, embedProps.current!);
      return () => mounted.unmount();
    },
  };
  const bridge = useMemo<VaultBridge>(
    () => ({
      get notePath() {
        return bridgeLatest.current.notePath;
      },
      get files() {
        return filesRef.current;
      },
      get config() {
        return bridgeLatest.current.config;
      },
      loadImage: (p) => bridgeLatest.current.loadImage(p),
      openPath: (p, newTab) => bridgeLatest.current.openPath(p, newTab),
      askName: (title, initial) => bridgeLatest.current.askName(title, initial),
      createFile: (p, content) => bridgeLatest.current.createFile(p, content),
      mountBase: (dom, p) => bridgeLatest.current.mountBase?.(dom, p) ?? (() => {}),
    }),
    [],
  );

  const openAddLink = useCallback(async () => {
    const sections = parseReadingList(await vault.read(settings.readingList).catch(() => ""));
    setAdding({ themes: sections.flatMap((s) => (s.title ? [s.title] : [])), tags: readingTagsOf(sections) });
  }, [vault, settings.readingList]);

  /** Adds a link to the reading list note (created with its first link). */
  const addReading = async (theme: string | null, title: string, url: string, tags: string[]) => {
    const list = settings.readingList;
    if (path === list) await saver.current?.().catch(() => {});
    if (!filesRef.current.includes(list)) await vault.create(list, newReadingList(theme, title, url, tags));
    else {
      const text = await vault.read(list);
      await vault.write(list, addLink(text, theme, title, url, tags), text);
    }
    await refresh();
    setReadingVersion((v) => v + 1);
    if (path === list) setReloads((n) => n + 1);
  };

  const columns = settings.ticketColumns?.length ? normalizeColumns(settings.ticketColumns) : DEFAULT_COLUMNS;

  const run = useCallback(
    async (operation: ShellOperation): Promise<{ path: string | null; renamed?: [string, string][] }> => {
      await saver.current?.().catch(() => {});
      switch (operation.op) {
        case "newPage": {
          const page = await planPage(vault, filesRef.current, ticketPathsOf(tree), { ...operation, ticketsFolder: settings.ticketsFolder });
          await vault.create(page.path, page.content);
          if (operation.parent) await linkFromParent(vault, operation.parent, page.path, [...filesRef.current, page.path]);
          await refresh();
          return { path: page.path };
        }
        case "rename": {
          const result = await renamePage(vault, operation.path, operation.title);
          // A base follows its rows' folder, renamed with it.
          if (isBasePath(operation.path) && result.path !== operation.path) {
            const text = await vault.read(result.path);
            const next = text.split(`file.inFolder(${JSON.stringify(subpageFolder(operation.path))})`).join(`file.inFolder(${JSON.stringify(subpageFolder(result.path))})`);
            if (next !== text) await vault.write(result.path, next, text);
          }
          return { path: result.path, renamed: await moved([[operation.path, result.path]]) };
        }
        case "renameFolder": {
          const result = await renameFolder(vault, operation.folder, operation.title);
          return { path: null, renamed: await moved(folderRenames(filesRef.current, operation.folder, result.path)) };
        }
        case "move": {
          if (operation.isFolder) {
            const result = await moveFolder(vault, operation.path, operation.folder);
            return { path: null, renamed: await moved(folderRenames(filesRef.current, operation.path, result.path)) };
          }
          const result = await movePage(vault, operation.path, operation.folder);
          return { path: result.path, renamed: await moved([[operation.path, result.path]]) };
        }
        case "delete":
          await deletePage(vault, operation.path, filesRef.current);
          await refresh();
          return { path: null };
        case "deleteFolder":
          await vault.remove(operation.folder);
          await refresh();
          return { path: null };
      }
    },
    [vault, tree, settings.ticketsFolder, refresh, moved],
  );

  useEffect(() => {
    window.flownoteShell = {
      open: (next) => {
        void (saver.current?.() ?? Promise.resolve()).catch(() => {}).then(() => {
          setReading(false);
          setPath(next);
        });
      },
      settings: setSettings,
      refresh: () => void refresh(),
      run,
      tool: (id) => tools.run(id),
      find: (replace) => {
        const selection = window.getSelection()?.toString() ?? "";
        setFind((previous) => ({ query: selection.includes("\n") ? previous?.query ?? "" : selection || previous?.query || "", replace, nonce: Date.now() }));
      },
      addLink: () => void openAddLink(),
    };
  }, [refresh, run, tools, openAddLink]);

  // The home page lists the pages opened lately.
  useEffect(() => {
    if (path && !path.startsWith("flownote:")) recordRecentPage(vaultName, path);
    setFind(null);
  }, [vaultName, path]);

  const handlers = useHandlers({
    onOpen: openPath,
    onRenameRow: renameRow,
    onSaved: () => void refresh(),
    onToggleSpelling: toggleSpelling,
    onToggleFocus: () => void callNative("toggle_sidebar").catch(report),
    onToggleWide: () => path && toggleWide(path),
    onToggleReading: () => setReading((on) => !on),
    notify,
    onState: (state: { dirty: boolean; status: string }) => void callNative("page_status", state).catch(() => {}),
  });

  const closeFind = useCallback(() => setFind(null), []);
  const iconOf = (target: string) => findEntry(tree, target)?.icon ?? null;
  const isRow = (target: string) => files.some((f) => isBasePath(f) && target.startsWith(`${subpageFolder(f)}/`));

  const dialog = adding && (
    <AddLinkDialog themes={adding.themes} tags={adding.tags} fetchTitles={settings.fetchTitles} onAdd={(...args) => addReading(...args).catch(report)} onClose={() => setAdding(null)} />
  );
  if (!path) return <div className="embed-empty">Choisissez une page dans la barre latérale.</div>;
  if (SHELL_VIEWS.includes(path)) {
    return (
      <>
      {dialog}
      <ShellView
        key={`${path}:${reloads}`}
        view={path}
        vault={vault}
        files={files}
        tree={tree}
        dark={settings.theme === "dark" || (settings.theme === "system" && dark)}
        readingList={settings.readingList}
        onOpen={openPath}
        onChanged={() => void refresh()}
        beforeCommit={async () => {}}
        readingVersion={readingVersion}
        onAddLink={() => void openAddLink()}
        columns={columns}
        onColumns={(ticketColumns) => void callNative("set_ticket_columns", { columns: ticketColumns }).catch(report)}
      />
      </>
    );
  }
  return (
    <div className="embed-page">
      {dialog}
      {/* Where menus of the native toolbar's buttons open: under the toolbar, on the right. */}
      <div ref={anchor} className="embed-menu-anchor" />
      <NativeToolsContext.Provider value={tools}>
      <SplitPane
        key={`${path}:${reloads}`}
        vault={vault}
        path={path}
        files={files}
        bridge={bridge}
        theme={settings.theme === "dark" || (settings.theme === "system" && dark) ? "dark" : "light"}
        ticketColumns={columns}
        openOnLeft={false}
        autosave={settings.autosave}
        icon={iconOf(path)}
        isRow={isRow(path)}
        saver={saver}
        spellingOn={settings.spellChecker !== "off" ? spelling : null}
        focusOn={false}
        wide={widePages.has(path)}
        reading={reading}
        git={vault.git ?? null}
        find={find}
        onCloseFind={closeFind}
        {...handlers}
      />
      </NativeToolsContext.Provider>
    </div>
  );
}

/**
 * The registry of the page's toolbar buttons: after each change they are sent
 * to the shell in the page's order (that of their placeholders in the DOM).
 */
function nativeTools(anchor: React.RefObject<HTMLDivElement | null>): NativeTools & { run(id: string): void } {
  const tools = new Map<string, NativeTool>();
  let sent = "";
  let scheduled = false;
  const send = () => {
    scheduled = false;
    const items = [...document.querySelectorAll<HTMLElement>("[data-native-tool]")].flatMap((element) => {
      const id = element.dataset.nativeTool!;
      const tool = tools.get(id);
      return tool ? [{ id, icon: tool.icon, label: tool.label, active: tool.active ?? null, disabled: Boolean(tool.disabled), group: tool.group ?? null }] : [];
    });
    const json = JSON.stringify(items);
    if (json === sent) return;
    sent = json;
    void callNative("toolbar", { items }).catch(() => {});
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(send);
  };
  return {
    set: (id, tool) => {
      tools.set(id, tool);
      schedule();
    },
    remove: (id) => {
      tools.delete(id);
      schedule();
    },
    run: (id) => {
      const target = anchor.current;
      if (target) tools.get(id)?.run({ currentTarget: target, target } as unknown as React.MouseEvent<HTMLButtonElement>);
    },
  };
}

function findEntry(entries: VaultEntry[], path: string): VaultEntry | null {
  for (const entry of entries) {
    if (entry.path === path) return entry;
    const found = entry.children ? findEntry(entry.children, path) : null;
    if (found) return found;
  }
  return null;
}

/** Old and new paths of the files of a folder that moved. */
function folderRenames(files: string[], from: string, to: string): [string, string][] {
  return files.filter((f) => f.startsWith(`${from}/`)).map((f) => [f, `${to}${f.slice(from.length)}`]);
}
