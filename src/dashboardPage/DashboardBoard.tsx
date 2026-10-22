import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { NoteEditor } from "../editor/NoteEditor";
import type { VaultBridge } from "../editor/bridge";
import { Icon } from "../Icon";
import { PopoverMenu, type MenuItem } from "../Sidebar";
import { COLUMNS, parseDashboard, serializeDashboard, settle, type Dashboard, type Widget } from "./format";

/** What "+ Widget" offers: a title and the Markdown it starts with. */
const KINDS: { label: string; icon: MenuItem["icon"]; title: string; body: string }[] = [
  { label: "Texte", icon: "text", title: "Notes", body: "\n" },
  { label: "Graphique", icon: "graph", title: "Graphique", body: "\n```plotly\ndata:\n  - type: bar\n    x: [A, B, C]\n    y: [3, 5, 2]\n```\n" },
  { label: "Tâches à faire", icon: "checkbox", title: "Tâches à faire", body: "\n```tasks\nnot done\nlimit 10\n```\n" },
  { label: "Notes récentes", icon: "list", title: "Notes récentes", body: "\n```dataview\nLIST\nSORT file.mtime DESC\nLIMIT 8\n```\n" },
];

/** A widget's text as written back: one blank line after its title and before the next. */
const sectionBody = (markdown: string) => `\n${markdown.trim()}\n`;

/** Height of a grid row, gap included. */
const ROW = 48;
const GAP = 12;

/**
 * A dashboard page: widgets on a 12-column grid, moved by their title bar and
 * resized by their corner (pointer events, snapped to the grid). Each widget is
 * a `## Titre` section edited in place by the note editor.
 */
export function DashboardBoard({ source, onChange, bridge, editable }: { source: string; onChange: (text: string) => void; bridge: VaultBridge; editable: boolean }) {
  const [board, setBoard] = useState<Dashboard>(() => parseDashboard(source));
  // Keys stay stable when a title changes, so its editor is not drawn again.
  const [ids, setIds] = useState(() => board.widgets.map((_, i) => i));
  const nextId = useRef(board.widgets.length);
  // Each editor keeps the text it opened with: a new `source` would reload it at every keystroke.
  const sources = useRef(new Map(board.widgets.map((w, i) => [i, w.body])));
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const grid = useRef<HTMLDivElement>(null);
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

  const startDrag = (e: ReactPointerEvent, index: number, resize: boolean) => {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const origin = board.widgets[index];
    const column = (grid.current!.clientWidth + GAP) / COLUMNS;
    const place = (ev: PointerEvent): Widget => {
      const dx = Math.round((ev.clientX - start.x) / column);
      const dy = Math.round((ev.clientY - start.y) / ROW);
      if (resize) return { ...origin, w: Math.min(COLUMNS - origin.x, Math.max(2, origin.w + dx)), h: Math.max(2, origin.h + dy) };
      return { ...origin, x: Math.min(COLUMNS - origin.w, Math.max(0, origin.x + dx)), y: Math.max(0, origin.y + dy) };
    };
    const move = (ev: PointerEvent) => setDrag({ index, widget: place(ev) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      const widget = place(ev);
      if (widget.x !== origin.x || widget.y !== origin.y || widget.w !== origin.w || widget.h !== origin.h)
        setWidgets(settle(board.widgets.map((w, i) => (i === index ? widget : w)), index));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const add = (kind: (typeof KINDS)[number]) => {
    const titles = new Set(board.widgets.map((w) => w.title));
    let title = kind.title;
    for (let n = 2; titles.has(title); n++) title = `${kind.title} ${n}`;
    // Next to the last widget when there is room on its row, else below.
    const last = board.widgets.at(-1);
    const [x, y] = last && last.x + last.w + 6 <= 12 ? [last.x + last.w, last.y] : [0, Math.max(0, ...board.widgets.map((w) => w.y + w.h))];
    const id = nextId.current++;
    sources.current.set(id, kind.body);
    setIds([...ids, id]);
    setWidgets(settle([...board.widgets, { title, body: kind.body, x, y, w: 6, h: kind.title === "Notes" ? 4 : kind.title === "Graphique" ? 10 : 7 }], board.widgets.length));
  };
  const addMenu = (anchor: HTMLElement) => setMenu(anchor.getBoundingClientRect());
  const remove = (index: number) => {
    setIds(ids.filter((_, i) => i !== index));
    setWidgets(board.widgets.filter((_, i) => i !== index));
  };

  return (
    <div className="dashboard-page">
      {editable && (
        <div className="dashboard-toolbar">
          <button type="button" onClick={(e) => addMenu(e.currentTarget)}>
            <Icon name="plus" size={14} /> Widget
          </button>
        </div>
      )}
      {menu && <PopoverMenu anchor={menu} items={KINDS.map((k) => ({ label: k.label, icon: k.icon, run: () => add(k) }))} onClose={() => setMenu(null)} />}
      {board.widgets.length === 0 && (
        <div className="dashboard-empty">
          <p>Ce dashboard est vide.</p>
          {editable && (
            <button type="button" onClick={(e) => addMenu(e.currentTarget)}>
              <Icon name="plus" size={14} /> Ajouter un widget
            </button>
          )}
        </div>
      )}
      <div ref={grid} className={drag ? "dashboard-grid dragging" : "dashboard-grid"} style={{ gridAutoRows: `${ROW - GAP}px`, gap: GAP }}>
        {board.widgets.map((saved, i) => {
          const w = drag?.index === i ? drag.widget : saved;
          return (
            <section key={ids[i]} className={drag?.index === i ? "dashboard-widget moving" : "dashboard-widget"} style={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}>
              <header onPointerDown={(e) => (e.target as HTMLElement).tagName !== "INPUT" && (e.target as HTMLElement).closest("button") === null && startDrag(e, i, false)}>
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
                <NoteEditor source={sources.current.get(ids[i]) ?? ""} onMarkdown={(markdown) => update(i, { body: sectionBody(markdown) })} bridge={bridge} editable={editable} properties={false} />
              </div>
              {editable && <div className="dashboard-resize" onPointerDown={(e) => startDrag(e, i, true)} />}
            </section>
          );
        })}
      </div>
    </div>
  );
}
