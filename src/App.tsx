import { useCallback, useEffect, useRef, useState } from "react";
import { NoteEditor } from "./editor/NoteEditor";
import { imageMime, type VaultBridge } from "./editor/bridge";
import { NameDialog } from "./NameDialog";
import { Sidebar } from "./Sidebar";
import { browserVaultSupported, ConflictError, createMemoryVault, openBrowserVault, type Vault, type VaultEntry } from "./vault/vault";
import { DEFAULT_CONFIG, linkTextFor, newNoteFolder, noteTitle, parseObsidianConfig, sanitizeName, subpageFolder, uniquePath, type ObsidianConfig } from "./vault/links";
import { FULL_NOTE } from "./markdown/fixtures";
import { isTauri, lastTauriVault, pickTauriVault } from "./vault/tauriVault";

interface OpenNote {
  path: string;
  /** Content the editor was loaded from (unchanged by saves, so the editor is not reloaded). */
  loaded: string;
  /** Content on disk when the note was loaded or last saved. */
  disk: string;
  /** Current serialization of the editor content. */
  markdown: string;
}

interface Dialog {
  title: string;
  initial: string;
  resolve: (name: string | null) => void;
}

const AUTOSAVE_DELAY_MS = 700;

const DEMO_FILES = {
  "Exemple.md": FULL_NOTE,
  "Projets.md": "# Projets\n\n[[Mon Notion]]\n",
  "Projets/Mon Notion.md": "Une sous-page de [[Projets]].\n",
};

export function App() {
  const [vault, setVault] = useState<Vault | null>(null);
  const [tree, setTree] = useState<VaultEntry[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [config, setConfig] = useState<ObsidianConfig>(DEFAULT_CONFIG);
  const [note, setNote] = useState<OpenNote | null>(null);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [status, setStatus] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);

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
    } catch (error) {
      setStatus(`Impossible d'ouvrir le vault : ${String(error)}`);
    }
  };

  // In the desktop app, reopen the last vault on launch.
  useEffect(() => {
    if (isTauri()) void open(lastTauriVault());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      } catch (error) {
        setStatus(error instanceof ConflictError ? `Conflit : ${error.message} Rechargez la note.` : String(error));
        throw error;
      }
    };
    saving.current = saving.current.then(run, run);
    return saving.current;
  }, [vault]);

  // Autosave, like Notion and Obsidian.
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => void saveNow().catch(() => {}), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [note?.markdown, dirty, saveNow]);

  const select = useCallback(
    async (path: string) => {
      if (!vault) return;
      try {
        await saveNow();
      } catch {
        return; // keep the note open so the conflict can be resolved
      }
      const disk = await vault.read(path);
      setNote({ path, loaded: disk, disk, markdown: disk });
      setStatus("");
    },
    [vault, saveNow],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        void saveNow().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveNow]);

  const askName = useCallback((title: string, initial: string) => new Promise<string | null>((resolve) => setDialog({ title, initial, resolve })), []);

  const createFile = useCallback(
    async (path: string, content: string | Uint8Array) => {
      if (!vault) return;
      await vault.create(path, content);
      filesRef.current = [...filesRef.current, path].sort();
      await refresh(vault);
    },
    [vault, refresh],
  );

  /** "+ Nouvelle page" (root) or "+" on a page (sub-page, linked from its parent). */
  const newPage = async (parent: string | null) => {
    if (!vault) return;
    const name = await askName(parent ? "Nom de la sous-page" : "Nom de la page", "Sans titre");
    if (!name) return;
    const folder = parent ? subpageFolder(parent) : newNoteFolder("", config);
    const path = uniquePath(folder, `${sanitizeName(name) || "Sans titre"}.md`, filesRef.current);
    try {
      await saveNow();
      await createFile(path, "");
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

  const bridge: VaultBridge = {
    notePath: note?.path ?? "",
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

  if (!vault) {
    return (
      <main className="welcome">
        <h1>Mon Notion</h1>
        <p>Éditeur de blocs pour un vault Obsidian. Les fichiers Markdown restent la seule source de vérité.</p>
        {isTauri() ? (
          <button onClick={() => void open(pickTauriVault())}>Ouvrir un vault…</button>
        ) : browserVaultSupported() ? (
          <button onClick={() => void open(openBrowserVault())}>Ouvrir un vault…</button>
        ) : (
          <p className="warning">Ce navigateur ne permet pas d'ouvrir un dossier : utilisez Chrome, ou l'app Tauri.</p>
        )}{" "}
        <button onClick={() => void open(createMemoryVault("Démo", DEMO_FILES))}>Essayer avec une note d'exemple</button>
        {status && <p className="warning">{status}</p>}
      </main>
    );
  }

  return (
    <div className="layout">
      <Sidebar vaultName={vault.name} tree={tree} selected={note?.path} onSelect={(path) => void select(path)} onNewPage={(parent) => void newPage(parent)} />
      <main className="content">
        {note ? (
          <>
            <header className="toolbar">
              <span className="path">{note.path}</span>
              <span className={dirty ? "badge dirty" : "badge"}>{dirty ? "Enregistrement…" : "Enregistré"}</span>
              {status && <span className="status warning">{status}</span>}
              <button onClick={() => setShowMarkdown(!showMarkdown)}>{showMarkdown ? "Masquer" : "Voir"} le Markdown</button>
            </header>
            <div className="panes">
              <div className="page">
                <h1 className="page-title">{noteTitle(note.path)}</h1>
                <NoteEditor key={note.path} source={note.loaded} onMarkdown={onMarkdown} bridge={bridge} />
              </div>
              {showMarkdown && <pre className="markdown-preview">{note.markdown}</pre>}
            </div>
          </>
        ) : (
          <p className="empty">Choisissez une page dans la barre latérale.</p>
        )}
      </main>
      {dialog && (
        <NameDialog
          title={dialog.title}
          initial={dialog.initial}
          onDone={(name) => {
            dialog.resolve(name);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
