import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NoteEditor } from "./editor/NoteEditor";
import type { VaultBridge } from "./editor/bridge";
import { isDrawingPath } from "./drawing/format";
import { DrawingEditor } from "./drawing/DrawingEditor";
import { isMindmapPath } from "./mindmap/format";
import { MindmapEditor } from "./mindmap/MindmapEditor";
import { isBasePath } from "./base/baseFile";
import { BaseView } from "./base/BaseView";
import { TicketView } from "./ticket/TicketView";
import { isTicketMarkdown } from "./ticket/format";
import type { TicketColumn } from "./ticket/board";
import { hasConflictMarkers } from "./vault/conflicts";
import { noteTitle } from "./vault/links";
import { ConflictError, type Vault } from "./vault/vault";
import { Icon } from "./Icon";
import { keys } from "./keys";

const AUTOSAVE_DELAY_MS = 700;

interface Loaded {
  /** Content the editor was loaded from. */
  loaded: string;
  /** Content on disk when loaded or last saved. */
  disk: string;
  /** Current content. */
  markdown: string;
  reloads: number;
}

/**
 * The right side of the split view: a second page, read and saved on its own
 * (autosave, conflict check), next to the active tab. Notes, tickets,
 * drawings, mind maps and bases are shown; a page already open on the left is
 * not edited twice.
 */
export function SplitPane({
  vault,
  path,
  files,
  bridge,
  theme,
  ticketColumns,
  openOnLeft,
  autosave,
  iconOf,
  onOpen,
  onRenameRow,
  onSwap,
  onClose,
  onSaved,
  saver,
}: {
  vault: Vault;
  path: string;
  files: string[];
  /** The app's bridge, bound to this page. */
  bridge: VaultBridge;
  theme: "light" | "dark";
  ticketColumns: TicketColumn[];
  /** The left side shows the same page: it is edited there only. */
  openOnLeft: boolean;
  autosave: boolean;
  iconOf: (path: string) => ReactNode;
  onOpen: (path: string, newTab: boolean) => void;
  onRenameRow: (path: string, name: string) => Promise<boolean>;
  /** Shows this page on the left (and the left one here). */
  onSwap: () => void;
  onClose: () => void;
  /** A file was written. */
  onSaved: () => void;
  /** Receives how to write pending changes now (before the sides are swapped). */
  saver?: { current: (() => Promise<void>) | null };
}) {
  const [page, setPage] = useState<Loaded | null>(null);
  const [status, setStatus] = useState("");
  const pageRef = useRef(page);
  pageRef.current = page;
  const saving = useRef<Promise<void>>(Promise.resolve());
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;

  const save = useCallback(async () => {
    const run = async () => {
      const current = pageRef.current;
      if (!current || current.markdown === current.disk) return;
      try {
        await vault.write(path, current.markdown, current.disk);
        const saved = { ...current, disk: current.markdown };
        pageRef.current = saved;
        setPage((p) => (p ? { ...p, disk: current.markdown } : p));
        setStatus("");
        savedCallback.current();
      } catch (error) {
        setStatus(error instanceof ConflictError ? `Conflit : ${error.message}` : String(error));
      }
    };
    saving.current = saving.current.then(run, run);
    return saving.current;
  }, [vault, path]);

  useEffect(() => {
    if (!saver) return;
    saver.current = save;
    return () => {
      if (saver.current === save) saver.current = null;
    };
  }, [saver, save]);

  // Load the page; a pending change is written before another page replaces it.
  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setStatus("");
    vault.read(path).then(
      (disk) => !cancelled && setPage({ loaded: disk, disk, markdown: disk, reloads: 0 }),
      (error) => !cancelled && setStatus(`Impossible d'ouvrir ${path} : ${String(error)}`),
    );
    return () => {
      cancelled = true;
      void save();
    };
  }, [vault, path, save]);

  const dirty = page !== null && page.markdown !== page.disk;
  useEffect(() => {
    if (!dirty || !autosave) return;
    const timer = window.setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [page?.markdown, dirty, autosave, save]);

  // Back to the window: changes made elsewhere are read again (never over unsaved edits).
  useEffect(() => {
    const onFocus = () => {
      const current = pageRef.current;
      if (!current || current.markdown !== current.disk) return;
      void vault.read(path).then((disk) => {
        const now = pageRef.current;
        if (now && disk !== now.disk && now.markdown === now.disk) setPage({ loaded: disk, disk, markdown: disk, reloads: now.reloads + 1 });
      }, () => {});
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [vault, path]);

  // ⌘S saves this side too.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && void save();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const onMarkdown = useCallback((markdown: string) => setPage((p) => (p ? { ...p, markdown } : p)), []);
  const editable = page !== null && !hasConflictMarkers(page.disk) && !openOnLeft;
  const key = `${path}#${page?.reloads ?? 0}`;
  const drawing = isDrawingPath(path);
  const mindmap = isMindmapPath(path);
  const base = isBasePath(path);
  const ticket = page !== null && !drawing && !mindmap && !base && isTicketMarkdown(page.loaded);

  let body: ReactNode = null;
  if (page && openOnLeft) {
    body = <p className="split-notice">Cette page est ouverte à gauche : elle s'y modifie.</p>;
  } else if (page && drawing) {
    body = (
      <div className="drawing-pane">
        <DrawingEditor key={key} source={page.loaded} onMarkdown={onMarkdown} bridge={bridge} theme={theme} editable={editable} onControls={() => {}} onToolChange={() => {}} />
      </div>
    );
  } else if (page && mindmap) {
    body = (
      <div className="drawing-pane">
        <MindmapEditor key={key} source={page.loaded} onMarkdown={onMarkdown} title={noteTitle(path)} theme={theme} editable={editable} onControls={() => {}} />
      </div>
    );
  } else if (page && base) {
    body = (
      <BaseView
        key={key}
        vault={vault}
        files={files}
        path={path}
        source={page.markdown}
        editable={editable}
        onSource={onMarkdown}
        onOpen={onOpen}
        onRenameRow={onRenameRow}
        loadImage={bridge.loadImage}
        onChanged={onSaved}
      />
    );
  } else if (page) {
    body = (
      <div className="page">
        {!ticket && (
          <div className="page-heading split-heading">
            <h1 className="page-title">{noteTitle(path)}</h1>
          </div>
        )}
        {ticket ? (
          <TicketView key={key} path={path} source={page.loaded} markdown={page.markdown} onMarkdown={onMarkdown} bridge={bridge} editable={editable} onEditor={() => {}} columns={ticketColumns} />
        ) : (
          <NoteEditor key={key} source={page.loaded} onMarkdown={onMarkdown} bridge={bridge} editable={editable} hiddenProperties={["icon"]} />
        )}
      </div>
    );
  }

  return (
    <section className="split-pane" aria-label={`Panneau de droite : ${noteTitle(path)}`}>
      <header className="split-pane-bar">
        <span className="split-pane-icon">{iconOf(path)}</span>
        <span className="split-pane-title">{noteTitle(path)}</span>
        {dirty && <span className="tab-dirty" aria-label="Modifications non enregistrées" />}
        {status && <span className="status warning">{status}</span>}
        <button className="titlebar-button" onClick={onSwap} aria-label="Échanger les côtés" title="Échanger les côtés">
          <Icon name="replace" size={14} />
        </button>
        <button className="titlebar-button" onClick={onClose} aria-label="Fermer le panneau de droite" title={keys("Fermer le panneau de droite (⌘⌥\\)")}>
          <Icon name="close" size={12} />
        </button>
      </header>
      <div className="split-pane-body">{body ?? (status ? null : <p className="split-notice">Chargement…</p>)}</div>
    </section>
  );
}
