import { useCallback, useEffect, useState } from "react";
import { NoteEditor } from "./editor/NoteEditor";
import { browserVaultSupported, ConflictError, createMemoryVault, openBrowserVault, type Vault, type VaultEntry } from "./vault/vault";
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

function Tree({ entries, selected, onSelect }: { entries: VaultEntry[]; selected?: string; onSelect: (path: string) => void }) {
  return (
    <ul className="tree">
      {entries.map((entry) =>
        entry.kind === "dir" ? (
          <li key={entry.path}>
            <details open>
              <summary>{entry.name}</summary>
              <Tree entries={entry.children ?? []} selected={selected} onSelect={onSelect} />
            </details>
          </li>
        ) : (
          <li key={entry.path}>
            <button className={entry.path === selected ? "file selected" : "file"} onClick={() => onSelect(entry.path)}>
              {entry.name}
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

export function App() {
  const [vault, setVault] = useState<Vault | null>(null);
  const [tree, setTree] = useState<VaultEntry[]>([]);
  const [note, setNote] = useState<OpenNote | null>(null);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [status, setStatus] = useState("");

  const dirty = note !== null && note.markdown !== note.disk;

  const open = async (pending: Vault | null | Promise<Vault | null>) => {
    const opened = await pending;
    if (!opened) return;
    try {
      setTree(await opened.tree());
      setVault(opened);
      setNote(null);
    } catch (error) {
      setStatus(`Impossible d'ouvrir le vault : ${String(error)}`);
    }
  };

  // In the desktop app, reopen the last vault on launch.
  useEffect(() => {
    if (isTauri()) void open(lastTauriVault());
  }, []);

  const select = async (path: string) => {
    if (!vault) return;
    if (dirty && !window.confirm("Des modifications ne sont pas enregistrées. Les abandonner ?")) return;
    const disk = await vault.read(path);
    setNote({ path, loaded: disk, disk, markdown: disk });
    setStatus("");
  };

  const save = useCallback(async () => {
    if (!vault || !note || !dirty) return;
    try {
      await vault.write(note.path, note.markdown, note.disk);
      setNote({ ...note, disk: note.markdown });
      setStatus("Enregistré");
    } catch (error) {
      setStatus(error instanceof ConflictError ? `Conflit : ${error.message} Rechargez la note.` : String(error));
    }
  }, [vault, note, dirty]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

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
        <button onClick={() => void open(createMemoryVault("Démo", { "Exemple.md": FULL_NOTE }))}>Essayer avec une note d'exemple</button>
        {status && <p className="warning">{status}</p>}
      </main>
    );
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="vault-name">{vault.name}</div>
        <Tree entries={tree} selected={note?.path} onSelect={(path) => void select(path)} />
      </aside>
      <main className="content">
        {note ? (
          <>
            <header className="toolbar">
              <span className="path">{note.path}</span>
              <span className={dirty ? "badge dirty" : "badge"}>{dirty ? "Modifié" : "Identique au fichier"}</span>
              {status && <span className="status">{status}</span>}
              <button onClick={() => setShowMarkdown(!showMarkdown)}>{showMarkdown ? "Masquer" : "Voir"} le Markdown</button>
              <button onClick={() => void save()} disabled={!dirty}>
                Enregistrer
              </button>
            </header>
            <div className="panes">
              <NoteEditor key={note.path} source={note.loaded} onMarkdown={onMarkdown} />
              {showMarkdown && <pre className="markdown-preview">{note.markdown}</pre>}
            </div>
          </>
        ) : (
          <p className="empty">Choisissez une note dans la barre latérale.</p>
        )}
      </main>
    </div>
  );
}
