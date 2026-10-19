import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NoteEditor } from "./editor/NoteEditor";
import { titleHeadingOf } from "./editor/titleHeading";
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
import type { Editor } from "@tiptap/core";
import { RawEditor } from "./RawEditor";
import { OutlinePanel } from "./OutlinePanel";
import { HistoryPanel } from "./HistoryPanel";
import { PageIcon, PopoverMenu, type MenuItem } from "./Sidebar";
import { ToolButton, ToolGroup } from "./Toolbar";
import type { FrontmatterControl } from "./editor/NoteEditor";
import { copyNoteAsHtml } from "./editor/copyHtml";
import { DRAWING_TOOLS } from "./drawing/tools";
import type { DrawingControls } from "./drawing/DrawingEditor";
import type { MindmapControls } from "./mindmap/MindmapCanvas";
import { isPresentationMarkdown } from "./presentation/format";
import { slideAt, useSlides } from "./presentation/useSlides";
import { SlidesPanel } from "./presentation/SlidesPanel";
import { Presenter } from "./presentation/Presenter";
import { setProperty } from "./markdown/frontmatter";
import { exportMindmapPng, exportPdf, exportSlidesHtml, type ExportedPage } from "./pageExport";
import type { GitApi } from "./vault/git";


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
export const SplitPane = memo(function SplitPane({
  vault,
  path,
  files,
  bridge,
  theme,
  ticketColumns,
  openOnLeft,
  autosave,
  icon,
  isRow,
  onOpen,
  onRenameRow,
  onSwap,
  onSeparate,
  onClose,
  onSaved,
  saver,
  spellingOn,
  onToggleSpelling,
  focusOn,
  onToggleFocus,
  wide,
  onToggleWide,
  reading: readingOn,
  onToggleReading,
  git,
  notify,
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
  /** The page's emoji (its `icon` property), and whether it is a row of a base. */
  icon: string | null;
  isRow: boolean;
  onOpen: (path: string, newTab: boolean) => void;
  onRenameRow: (path: string, name: string) => Promise<boolean>;
  /** Shows this page on the left (and the left one here). */
  onSwap: () => void;
  /** Moves this page to a tab of its own. */
  onSeparate: () => void;
  onClose: () => void;
  /** A file was written. */
  onSaved: () => void;
  /** Receives how to write pending changes now (before the sides are swapped). */
  saver?: { current: (() => Promise<void>) | null };
  /** Settings and services shared with the left side's toolbar. Spell checking: null when off in the settings. */
  spellingOn: boolean | null;
  onToggleSpelling: () => void;
  focusOn: boolean;
  onToggleFocus: () => void;
  wide: boolean;
  onToggleWide: () => void;
  /** Reading mode of this side (notes, tickets, presentations). */
  reading: boolean;
  onToggleReading: () => void;
  git: GitApi | null;
  notify: (message: string) => void;
}) {
  const [page, setPage] = useState<Loaded | null>(null);
  const [status, setStatus] = useState("");
  const [raw, setRaw] = useState(false);
  const [outline, setOutline] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [history, setHistory] = useState(false);
  const [showSlides, setShowSlides] = useState(false);
  const [presenting, setPresenting] = useState<number | null>(null);
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [drawingControls, setDrawingControls] = useState<DrawingControls | null>(null);
  const [drawingTool, setDrawingTool] = useState("selection");
  const [mindmapControls, setMindmapControls] = useState<MindmapControls | null>(null);
  const frontmatter = useRef<FrontmatterControl | null>(null);
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
  const key = `${path}#${page?.reloads ?? 0}`;
  const drawing = isDrawingPath(path);
  const mindmap = isMindmapPath(path);
  const base = isBasePath(path);
  const ticket = page !== null && !drawing && !mindmap && !base && isTicketMarkdown(page.loaded);
  const note = !drawing && !mindmap && !base;
  const presentation = page !== null && note && !ticket && isPresentationMarkdown(page.markdown);
  const reading = readingOn && note && !raw;
  /** The note's first `# heading`, shown as its title (titleHeading.ts). */
  const headingTitle = note && !ticket && !presentation && !raw && editor && !editor.isDestroyed ? titleHeadingOf(editor.state.doc) : null;
  const editable = page !== null && !hasConflictMarkers(page.disk) && !openOnLeft && !reading;
  const slides = useSlides(presentation ? page.markdown : "", path, files, bridge.loadImage, presentation);
  const title = noteTitle(path);

  const report = (what: string) => (error: unknown) => setStatus(`${what} impossible : ${String(error)}`);
  const exported = (): ExportedPage | null =>
    page && { title, path, markdown: page.markdown, kind: drawing ? "drawing" : mindmap ? "mindmap" : presentation ? "presentation" : "note", drawing: drawingControls, mindmap: mindmapControls };
  const exportPng = async () => {
    if (!mindmapControls) return;
    const where = await exportMindmapPng(mindmapControls, title);
    if (where) notify(`Mind map exportée : ${where}`);
  };
  const exportSlides = async () => {
    const current = exported();
    if (!current) return;
    const where = await exportSlidesHtml(vault, current, files);
    if (where) notify(`Présentation exportée : ${where}`);
  };
  /** PDF of this page through the print panel, as the left side does it. */
  const exportPagePdf = async () => {
    const current = exported();
    if (current) await exportPdf(vault, current, files, "right");
  };
  const copyHtml = async () => {
    if (!editor || !page) return;
    await copyNoteAsHtml(editor.state.doc, title, page.markdown);
    notify("Note copiée en HTML");
  };
  /** A version from the history replaces the page (as a change to commit). */
  const restore = async (content: string) => {
    const current = pageRef.current;
    if (!current) return;
    await save();
    try {
      await vault.write(path, content, pageRef.current?.disk ?? current.disk);
      setPage({ loaded: content, disk: content, markdown: content, reloads: current.reloads + 1 });
      savedCallback.current();
      notify("Version restaurée : elle apparaît comme une modification à commiter.");
    } catch (error) {
      setStatus(String(error));
    }
  };

  /** Raw Markdown on or off; back to the page, it is shown from the edited text. */
  const toggleRaw = () => {
    if (raw) setPage((p) => (p ? { ...p, loaded: p.markdown, reloads: p.reloads + 1 } : p));
    setRaw(!raw);
  };

  let body: ReactNode = null;
  if (page && openOnLeft) {
    body = <p className="split-notice">Cette page est ouverte à gauche : elle s'y modifie.</p>;
  } else if (page && raw) {
    body = (
      <div className="page">
        <RawEditor key={key} value={page.markdown} onChange={onMarkdown} readOnly={!editable} />
      </div>
    );
  } else if (page && drawing) {
    body = (
      <div className="drawing-pane">
        <DrawingEditor key={key} source={page.loaded} onMarkdown={onMarkdown} bridge={bridge} theme={theme} editable={editable} onControls={setDrawingControls} onToolChange={setDrawingTool} />
      </div>
    );
  } else if (page && mindmap) {
    body = (
      <div className="drawing-pane">
        <MindmapEditor key={key} source={page.loaded} onMarkdown={onMarkdown} title={noteTitle(path)} theme={theme} editable={editable} onControls={setMindmapControls} />
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
      <div className={`${presentation ? "page presentation-page" : wide ? "page wide" : "page"}${reading ? " reading" : ""}`}>
        {!ticket && (
          <div className="page-heading split-heading">
            <h1 className="page-title" title={headingTitle !== null ? `Fichier : ${noteTitle(path)}` : undefined}>
              {headingTitle ?? noteTitle(path)}
            </h1>
          </div>
        )}
        {ticket ? (
          <TicketView key={key} path={path} source={page.loaded} markdown={page.markdown} onMarkdown={onMarkdown} bridge={bridge} editable={editable} onEditor={setEditor} columns={ticketColumns} />
        ) : (
          <NoteEditor key={key} source={page.loaded} onMarkdown={onMarkdown} bridge={bridge} editable={editable} hiddenProperties={["icon"]} onEditor={setEditor} frontmatterControl={frontmatter} titleHeading={!presentation} />
        )}
      </div>
    );
  }

  return (
    <section className="split-pane" aria-label={`Panneau de droite : ${noteTitle(path)}`}>
      <header className="split-pane-bar toolbar">
        <span className="split-pane-icon">
          <PageIcon path={path} icon={icon} ticket={ticket} presentation={presentation} row={isRow} />
        </span>
        <span className="split-pane-title" title={path}>
          {noteTitle(path)}
        </span>
        {dirty && <span className="tab-dirty" aria-label="Modifications non enregistrées" />}
        {status && <span className="status warning">{status}</span>}
        {drawing && !raw && !openOnLeft && (
          <ToolGroup>
            {DRAWING_TOOLS.map(([tool, icon, label]) => (
              <ToolButton key={tool} icon={icon} label={label} active={drawingTool === tool} disabled={!drawingControls} onClick={() => drawingControls?.setTool(tool)} />
            ))}
          </ToolGroup>
        )}
        <div className="page-actions">
          {mindmap && !raw && !openOnLeft && (
            <>
              <ToolButton icon="center" label="Ajuster la carte à la fenêtre" onClick={() => mindmapControls?.fit()} disabled={!mindmapControls} />
              <ToolButton icon="export" label="Exporter en image (PNG)" onClick={() => void exportPng().catch(report("Export"))} disabled={!mindmapControls} />
            </>
          )}
          {note && !openOnLeft && <ToolButton icon="outline" label="Plan de la note" onClick={() => setOutline(!outline)} active={outline && !raw} disabled={raw} />}
          {note && <ToolButton icon="eye" label={reading ? "Quitter le mode lecture" : "Mode lecture"} onClick={onToggleReading} active={reading} disabled={raw || openOnLeft} />}
          {note && !reading && spellingOn !== null && (
            <ToolButton icon="spelling" label={spellingOn ? "Désactiver la correction orthographique" : "Activer la correction orthographique"} onClick={onToggleSpelling} active={spellingOn} />
          )}
          {presentation && !openOnLeft && (
            <>
              <ToolButton icon="slides" label="Miniatures des diapos" onClick={() => setShowSlides(!showSlides)} active={showSlides} />
              <ToolButton icon="play" label="Présenter" onClick={() => setPresenting(editor && !editor.isDestroyed ? slideAt(editor.state.doc, editor.state.selection.from) : 0)} disabled={!slides} />
              <ToolButton icon="export" label="Exporter en HTML" onClick={() => void exportSlides().catch(report("Export"))} />
            </>
          )}
          {note && !ticket && !presentation && !openOnLeft && !reading && (
            <ToolButton icon="slides" label="Transformer en présentation" onClick={() => frontmatter.current?.set(setProperty(frontmatter.current.get(), "marp", true))} disabled={!editable || raw} />
          )}
          {git && <ToolButton icon="clock" label="Historique de la note" onClick={() => setHistory(!history)} active={history} />}
          {note && !presentation && <ToolButton icon="width" label={wide ? "Largeur normale" : "Pleine largeur"} onClick={onToggleWide} active={wide} />}
          <ToolButton icon="focus" label={focusOn ? "Quitter le mode focus (⌘⇧M)" : "Mode focus (⌘⇧M)"} onClick={onToggleFocus} active={focusOn} />
          {!base && !ticket && !openOnLeft && (
            <ToolButton icon="more" label="Exporter, copier…" onClick={(event) => setMenu(event.currentTarget.getBoundingClientRect())} active={menu !== null} disabled={raw || !page} />
          )}
          {!openOnLeft && <ToolButton icon="raw" label={drawing ? "Voir le fichier brut, JSON du dessin" : mindmap ? "Voir le fichier brut de la mind map" : base ? "Voir le fichier .base" : "Mode Markdown brut"} onClick={toggleRaw} active={raw} disabled={!page} />}
          <span className="split-pane-divider" />
          <ToolButton icon="open" label="Ouvrir dans son propre onglet" onClick={onSeparate} />
          <ToolButton icon="replace" label="Échanger les côtés" onClick={onSwap} />
          <ToolButton icon="close" label="Fermer la page de droite (⌘⌥\)" onClick={onClose} />
        </div>
      </header>
      <div className="split-pane-main">
        <div className="split-pane-body">{body ?? (status ? null : <p className="split-notice">Chargement…</p>)}</div>
        {presentation && showSlides && !raw && !openOnLeft && <SlidesPanel editor={editor} rendered={slides} onPresent={setPresenting} onClose={() => setShowSlides(false)} />}
        {((outline && note && !raw && !openOnLeft) || (history && git && page)) && (
          <div className={history && git ? "split-outline side-column with-history" : "split-outline"}>
            {outline && note && !raw && !openOnLeft && <OutlinePanel editor={editor} onClose={() => setOutline(false)} />}
            {history && git && page && <HistoryPanel git={git} path={path} current={page.disk} onRestore={restore} onClose={() => setHistory(false)} />}
          </div>
        )}
      </div>
      {menu && (
        <PopoverMenu
          anchor={menu}
          onClose={() => setMenu(null)}
          items={[
            { label: "Exporter en PDF…", icon: "export", run: () => void exportPagePdf().catch(report("Export PDF")) },
            ...(note && !presentation ? [{ label: "Copier en HTML", icon: "copy", run: () => void copyHtml().catch(report("Copie")) } satisfies MenuItem] : []),
          ]}
        />
      )}
      {presenting !== null && slides && presentation && <Presenter rendered={slides} start={presenting} onClose={() => setPresenting(null)} />}
    </section>
  );
});
