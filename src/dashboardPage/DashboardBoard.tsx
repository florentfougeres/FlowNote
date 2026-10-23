import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { NoteEditor } from "../editor/NoteEditor";
import type { VaultBridge } from "../editor/bridge";
import { Icon } from "../Icon";
import { PopoverMenu, type MenuItem } from "../Sidebar";
import { newDrawingFile } from "../drawing/format";
import { newMindmapFile } from "../mindmap/format";
import { newBaseFile } from "../base/baseFile";
import { noteTitle } from "../vault/links";
import { COLUMNS, settle, parseDashboard, serializeDashboard, type Dashboard, type Widget } from "./format";

/** A widget made from Markdown it starts with. */
const KINDS: { label: string; icon: MenuItem["icon"]; title: string; body: string; w: number; h: number }[] = [
  { label: "Texte", icon: "text", title: "Notes", body: "\n", w: 4, h: 4 },
  { label: "Tableau", icon: "table", title: "Tableau", body: "\n| Colonne | Colonne |\n| --- | --- |\n|  |  |\n", w: 6, h: 5 },
  { label: "Graphique Plotly", icon: "graph", title: "Graphique", body: "\n```plotly\ndata:\n  - type: bar\n    x: [A, B, C]\n    y: [3, 5, 2]\n```\n", w: 6, h: 9 },
  { label: "Diagramme Mermaid", icon: "blocks", title: "Diagramme", body: "\n```mermaid\nflowchart LR\n  A --> B\n```\n", w: 6, h: 6 },
];

/** A widget showing a page of the vault (`![[…]]`), chosen or created from the menu. */
const PAGES: { label: string; icon: MenuItem["icon"]; suffix: string; create: string; file: (path: string) => string; w: number; h: number }[] = [
  { label: "Mind map", icon: "mindmap", suffix: ".mindmap.md", create: "Nouvelle mind map", file: (path) => newMindmapFile(noteTitle(path)), w: 6, h: 10 },
  { label: "Croquis Excalidraw", icon: "drawing", suffix: ".excalidraw.md", create: "Nouveau croquis", file: () => newDrawingFile(), w: 6, h: 10 },
  { label: "Base", icon: "database", suffix: ".base", create: "Nouvelle base", file: (path) => newBaseFile(path.slice(0, -".base".length)), w: 12, h: 10 },
];

/** A widget's text as written back: one blank line after its title and before the next. */
const sectionBody = (markdown: string) => `\n${markdown.trim()}\n`;

/** Height of a grid row, gap included. */
const ROW = 40;
const GAP = 12;

/**
 * A dashboard page: widgets on a 12-column grid, as wide as the page, moved by
 * their title bar and resized by their right edge, bottom edge or corner
 * (pointer events, snapped to the grid). Widgets in the way are pushed down.
 * Each widget is a `## Titre` section edited in place by the note editor.
 */
export function DashboardBoard({ source, onChange, bridge, editable }: { source: string; onChange: (text: string) => void; bridge: VaultBridge; editable: boolean }) {
  const [board, setBoard] = useState<Dashboard>(() => parseDashboard(source));
  // Keys stay stable when a title changes or a widget moves, so its editor is not drawn again.
  const [ids, setIdsState] = useState(() => board.widgets.map((_, i) => i));
  const idsRef = useRef(ids);
  const setIds = (next: number[]) => {
    idsRef.current = next;
    setIdsState(next);
  };
  const nextId = useRef(board.widgets.length);
  // Each editor keeps the text it opened with: a new `source` would reload it at every keystroke.
  const sources = useRef(new Map(board.widgets.map((w, i) => [i, w.body])));
  const [menu, setMenu] = useState<{ anchor: DOMRect; items: MenuItem[] } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  // The widget being moved or resized, where it would land.
  const [drag, setDrag] = useState<{ index: number; widget: Widget } | null>(null);

  // The editors may keep the first `onMarkdown` they were given: changes read the latest board here.
  const latest = useRef(board);
  const commit = (next: Dashboard) => {
    latest.current = next;
    setBoard(next);
    onChange(serializeDashboard(next));
  };
  const setWidgets = (widgets: Widget[]) => commit({ ...latest.current, widgets });
  const update = (index: number, patch: Partial<Widget>) => setWidgets(latest.current.widgets.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  const updateBody = (id: number, body: string) => {
    const index = idsRef.current.indexOf(id);
    if (index >= 0 && latest.current.widgets[index].body !== body) update(index, { body });
  };

  const startDrag = (e: ReactPointerEvent, index: number, mode: "move" | "x" | "y" | "xy") => {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const origin = latest.current.widgets[index];
    const column = (grid.current!.clientWidth + GAP) / COLUMNS;
    const place = (ev: PointerEvent): Widget => {
      const dx = Math.round((ev.clientX - start.x) / column);
      const dy = Math.round((ev.clientY - start.y) / ROW);
      if (mode !== "move")
        return {
          ...origin,
          w: mode === "y" ? origin.w : Math.min(COLUMNS - origin.x, Math.max(2, origin.w + dx)),
          h: mode === "x" ? origin.h : Math.max(2, origin.h + dy),
        };
      return { ...origin, x: Math.min(COLUMNS - origin.w, Math.max(0, origin.x + dx)), y: Math.max(0, origin.y + dy) };
    };
    let last = origin;
    const move = (ev: PointerEvent) => {
      last = place(ev);
      setDrag({ index, widget: last });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      if (last !== origin) setWidgets(settle(latest.current.widgets.map((w, i) => (i === index ? last : w)), index));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const add = (title: string, body: string, w: number, h: number) => {
    const titles = new Set(latest.current.widgets.map((x) => x.title));
    let unique = title;
    for (let n = 2; titles.has(unique); n++) unique = `${title} ${n}`;
    const id = nextId.current++;
    sources.current.set(id, body);
    setIds([...idsRef.current, id]);
    // Below the others.
    const y = Math.max(0, ...latest.current.widgets.map((o) => o.y + o.h));
    setWidgets([...latest.current.widgets, { title: unique, body, x: 0, y, w, h }]);
  };
  const addPage = (path: string, w: number, h: number) => add(noteTitle(path), `\n![[${path}]]\n`, w, h);

  const pageMenu = (anchor: DOMRect, page: (typeof PAGES)[number]) => {
    const folder = bridge.notePath.includes("/") ? bridge.notePath.slice(0, bridge.notePath.lastIndexOf("/") + 1) : "";
    const create = async () => {
      const name = (await bridge.askName(page.create, ""))?.trim();
      if (!name) return;
      const path = `${folder}${name}${page.suffix}`;
      if (!bridge.files.includes(path)) await bridge.createFile(path, page.file(path));
      addPage(path, page.w, page.h);
    };
    const existing = bridge.files.filter((f) => f.toLowerCase().endsWith(page.suffix)).sort((a, b) => noteTitle(a).localeCompare(noteTitle(b)));
    setMenu({
      anchor,
      items: [{ label: `${page.create}…`, icon: "plus", run: () => void create() }, ...existing.map((f): MenuItem => ({ label: noteTitle(f), icon: page.icon, run: () => addPage(f, page.w, page.h) }))],
    });
  };
  const addMenu = (anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    setMenu({
      anchor: rect,
      items: [
        ...KINDS.map((k): MenuItem => ({ label: k.label, icon: k.icon, run: () => add(k.title, k.body, k.w, k.h) })),
        // The menu closes after a choice: the list of pages opens just after.
        ...PAGES.map((p): MenuItem => ({ label: `${p.label}…`, icon: p.icon, run: () => setTimeout(() => pageMenu(rect, p)) })),
      ],
    });
  };
  const remove = (index: number) => {
    setIds(idsRef.current.filter((_, i) => i !== index));
    setWidgets(latest.current.widgets.filter((_, i) => i !== index));
  };
  // While a widget moves, the others make room for it.
  const shown = drag ? settle(board.widgets.map((w, i) => (i === drag.index ? drag.widget : w)), drag.index) : board.widgets;

  return (
    <div className="dashboard-page">
      {editable && (
        <div className="dashboard-toolbar">
          <button type="button" onClick={(e) => addMenu(e.currentTarget)}>
            <Icon name="plus" size={14} /> Ajouter un widget
          </button>
        </div>
      )}
      {menu && <PopoverMenu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
      <div className="dashboard-scroll">
      {board.widgets.length === 0 && <p className="dashboard-empty">Ce dashboard est vide.</p>}
      <div ref={grid} className={drag ? "dashboard-grid dragging" : "dashboard-grid"} style={{ gridAutoRows: `${ROW - GAP}px`, gap: GAP }}>
        {shown.map((w, i) => {
          const saved = board.widgets[i];
          const id = ids[i];
          return (
            <section key={id} className={drag?.index === i ? "dashboard-widget moving" : "dashboard-widget"} style={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}>
              <header onPointerDown={(e) => (e.target as HTMLElement).tagName !== "INPUT" && (e.target as HTMLElement).closest("button") === null && startDrag(e, i, "move")}>
                <input
                  value={saved.title}
                  readOnly={!editable}
                  aria-label="Titre du widget"
                  onChange={(e) => {
                    const title = e.target.value.replace(/\n/g, " ");
                    if (title.trim() && !board.widgets.some((o, j) => j !== i && o.title === title.trim())) update(i, { title });
                  }}
                />
                {editable && (
                  <button type="button" className="dashboard-remove" title="Supprimer le widget" onClick={() => remove(i)}>
                    <Icon name="close" size={14} />
                  </button>
                )}
              </header>
              <div className="dashboard-body">
                <NoteEditor source={sources.current.get(id) ?? ""} onMarkdown={(markdown) => updateBody(id, sectionBody(markdown))} bridge={bridge} editable={editable} properties={false} />
              </div>
              {editable && (
                <>
                  <div className="dashboard-edge-x" onPointerDown={(e) => startDrag(e, i, "x")} />
                  <div className="dashboard-edge-y" onPointerDown={(e) => startDrag(e, i, "y")} />
                  <div className="dashboard-resize" title="Redimensionner" onPointerDown={(e) => startDrag(e, i, "xy")} />
                </>
              )}
            </section>
          );
        })}
      </div>
      </div>
    </div>
  );
}
