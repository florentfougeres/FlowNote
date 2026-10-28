import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PropertyValue } from "../markdown/frontmatter";
import { Icon, type IconName } from "../Icon";
import { readAllNotes, type Vault } from "../vault/vault";
import { noteTitle, resolveLink, uniquePath } from "../vault/links";
import { defaultView, NAME, parseBase, renameInBase, removeView, serializeBase, writeColumn, writeDisplayName, writeFormula, writeView, type BaseFile, type BaseView as View, type SimpleFilter } from "./baseFile";
import { FILE_PROPERTIES, propertiesOf, renameNoteProperty, rowsOf, setNoteProperty, viewRows, type BaseRow } from "./rows";
import { TableView, type TableActions } from "./TableView";
import { BoardView } from "./BoardView";
import { GalleryView } from "./GalleryView";
import { CalendarView } from "./CalendarView";
import { columnInfo, type ColumnInfo } from "./columns";
import { BaseLinks, TYPE_ICONS } from "./cells";
import { isTaskView, TaskBaseView, taskViewName } from "../tasks/TaskBaseView";
import type { TaskConfig } from "../tasks/config";
import { useClickOutside } from "../hooks/useClickOutside";

const OPS: [SimpleFilter["op"], string][] = [
  ["is", "est"],
  ["isNot", "n'est pas"],
  ["contains", "contient"],
  ["checked", "est cochée"],
  ["unchecked", "n'est pas cochée"],
  ["empty", "est vide"],
  ["notEmpty", "n'est pas vide"],
];

/** A choice of a filter or sort rule, as the app's menus (no raw `<select>`). */
function RuleChoice<T extends string>({ value, choices, onChange }: { value: T; choices: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useClickOutside(box, () => setOpen(false));
  return (
    <div ref={box} className="db-choice">
      <button type="button" className="db-choice-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{choices.find(([v]) => v === value)?.[1] ?? value}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <div className="db-popover db-menu db-choice-list">
          {choices.map(([v, text]) => (
            <button
              key={v}
              type="button"
              className={v === value ? "selected" : undefined}
              onClick={() => {
                onChange(v);
                setOpen(false);
              }}
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The value of a filter, with the values of its column offered under it while it has the focus. */
function FilterValue({ value, values, onChange }: { value: string; values: string[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const typed = value.trim().toLowerCase();
  const offered = values.filter((v) => v.toLowerCase() !== typed && v.toLowerCase().includes(typed)).slice(0, 10);
  return (
    <div className="db-choice">
      <input value={value} placeholder="Valeur" onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
      {open && offered.length > 0 && (
        <div className="db-popover db-menu db-choice-list" onMouseDown={(e) => e.preventDefault()}>
          <small>Valeurs de la colonne</small>
          {offered.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                onChange(v);
                setOpen(false);
              }}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The base's name, edited in place like a page title: Enter or leaving the field renames the file (its rows' folder follows). */
function BaseTitle({ name, editable, onRename }: { name: string; editable: boolean; onRename: (name: string) => Promise<boolean> }) {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  const commit = async () => {
    const next = value.trim();
    if (!next || next === name) return setValue(name);
    if (!(await onRename(next))) setValue(name);
  };
  return (
    <input
      className="db-title"
      value={value}
      readOnly={!editable}
      spellCheck={false}
      aria-label="Nom de la base"
      size={Math.max(4, value.length)}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setValue(name);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

function FilterMenu({
  view,
  properties,
  label,
  valuesOf,
  onChange,
  onClose,
}: {
  view: View;
  properties: string[];
  label: (p: string) => string;
  /** The values used in a column, offered for a filter's value. */
  valuesOf: (p: string) => string[];
  onChange: (filters: SimpleFilter[]) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useClickOutside(box, onClose);
  const set = (i: number, patch: Partial<SimpleFilter>) => onChange(view.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const columns = properties.map((p) => [p, label(p)] as const);
  return (
    <div ref={box} className="db-popover db-menu db-rules">
      {view.filters.length === 0 && <p className="dash-muted">Aucun filtre dans cette vue.</p>}
      {view.filters.map((f, i) => (
        <div key={i} className="db-rule">
          <RuleChoice value={f.property} choices={columns} onChange={(property) => set(i, { property })} />
          <RuleChoice value={f.op} choices={OPS} onChange={(op) => set(i, { op })} />
          {["is", "isNot", "contains"].includes(f.op) && <FilterValue value={f.value} values={valuesOf(f.property)} onChange={(value) => set(i, { value })} />}
          <button className="db-icon-button" aria-label="Retirer le filtre" onClick={() => onChange(view.filters.filter((_, j) => j !== i))}>
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
      {view.otherFilters > 0 && <p className="dash-muted">{view.otherFilters} filtre{view.otherFilters > 1 ? "s" : ""} écrit{view.otherFilters > 1 ? "s" : ""} dans Obsidian, conservé{view.otherFilters > 1 ? "s" : ""} tel{view.otherFilters > 1 ? "s" : ""} quel{view.otherFilters > 1 ? "s" : ""} (non appliqué{view.otherFilters > 1 ? "s" : ""} ici).</p>}
      <button onClick={() => onChange([...view.filters, { property: properties[1] ?? NAME, op: "is", value: "" }])}>
        <Icon name="plus" size={14} /> Ajouter un filtre
      </button>
    </div>
  );
}

const DIRECTIONS = [
  ["ASC", "Croissant"],
  ["DESC", "Décroissant"],
] as const;

function SortMenu({ view, properties, label, onChange, onClose }: { view: View; properties: string[]; label: (p: string) => string; onChange: (sort: View["sort"]) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useClickOutside(box, onClose);
  const columns = properties.map((p) => [p, label(p)] as const);
  return (
    <div ref={box} className="db-popover db-menu db-rules">
      {view.sort.length === 0 && <p className="dash-muted">Lignes triées par nom.</p>}
      {view.sort.map((s, i) => (
        <div key={i} className="db-rule">
          <RuleChoice value={s.property} choices={columns} onChange={(property) => onChange(view.sort.map((x, j) => (j === i ? { ...x, property } : x)))} />
          <RuleChoice value={s.direction} choices={DIRECTIONS} onChange={(direction) => onChange(view.sort.map((x, j) => (j === i ? { ...x, direction } : x)))} />
          <button className="db-icon-button" aria-label="Retirer le tri" onClick={() => onChange(view.sort.filter((_, j) => j !== i))}>
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...view.sort, { property: properties[1] ?? NAME, direction: "ASC" }])}>
        <Icon name="plus" size={14} /> Ajouter un tri
      </button>
    </div>
  );
}

export type ViewType = "table" | "board" | "cards" | "calendar";
const VIEW_TYPES: [ViewType, string, IconName][] = [
  ["table", "Tableau", "table"],
  ["board", "Kanban", "board"],
  ["cards", "Galerie", "gallery"],
  ["calendar", "Calendrier", "calendar"],
];
const viewIcon = (type: string): IconName => VIEW_TYPES.find(([t]) => t === type)?.[2] ?? "table";

function ViewsMenu({ onAdd, onClose }: { onAdd: (type: ViewType) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useClickOutside(box, onClose);
  return (
    <div ref={box} className="db-popover db-menu">
      <small>Nouvelle vue</small>
      {VIEW_TYPES.map(([type, label, icon]) => (
        <button key={type} onClick={() => onAdd(type)}>
          <Icon name={icon} size={14} /> {label}
        </button>
      ))}
    </div>
  );
}

/** A menu choosing one property (or none): group, date, cover image. */
function ChoiceMenu({ title, choices, value, none, onChoose, onClose }: { title: string; choices: ColumnInfo[]; value: string | null; none?: string; onChoose: (property: string | null) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useClickOutside(box, onClose);
  const choose = (p: string | null) => {
    onChoose(p);
    onClose();
  };
  return (
    <div ref={box} className="db-popover db-menu db-menu-right">
      <small>{title}</small>
      {none && (
        <button className={value === null ? "selected" : undefined} onClick={() => choose(null)}>
          {none}
        </button>
      )}
      {choices.map((c) => (
        <button key={c.property} className={value === c.property ? "selected" : undefined} onClick={() => choose(c.property)}>
          <Icon name={TYPE_ICONS[c.meta.type]} size={14} /> {c.label}
        </button>
      ))}
      {choices.length === 0 && <p className="dash-muted">Aucune propriété de ce type.</p>}
    </div>
  );
}

function RenameView({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(name);
  return (
    <div className="db-rename-view">
      <input
        autoFocus
        value={value}
        aria-label="Nom de la vue"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onDone(value.trim() || null)}
        onKeyDown={(e) => (e.key === "Enter" ? onDone(value.trim() || null) : e.key === "Escape" && onDone(null))}
      />
    </div>
  );
}

export interface BaseViewProps {
  vault: Vault;
  files: string[];
  path: string;
  /** Current text of the base file. */
  source: string;
  editable: boolean;
  onSource: (text: string) => void;
  onOpen: (path: string, newTab: boolean) => void;
  onRenameRow: (path: string, name: string) => Promise<boolean>;
  /** Deletes a row's note, after confirmation. */
  onDeleteRow: (path: string) => Promise<void>;
  /** Notes were created or renamed: the app reads the vault again. */
  onChanged: () => void;
  /** Blob URL of a vault image (gallery covers). */
  loadImage: (path: string) => Promise<string>;
  /** Embedded in a note: no page title, a smaller frame. */
  embedded?: boolean;
  /** The tasks' settings and their creation, for TaskNotes' views; `openView` opens another of its views (created when missing). */
  tasks?: { config: TaskConfig; onNew: (status?: string) => void; openView?: (view: keyof TaskConfig["views"]) => void };
}

/**
 * A base, a database: views in tabs (table, kanban, gallery,
 * calendar) over the notes of a folder. The base file (`.base`) is the page's
 * text: its edits go through `onSource` like a note's. Cells are written to the
 * rows' notes.
 */
export function BaseView({ vault, files, path, source, editable, onSource, onOpen, onRenameRow, onDeleteRow, onChanged, loadImage, embedded = false, tasks }: BaseViewProps) {
  const parsed = useMemo(() => parseBase(source), [source]);
  /** Which of TaskNotes' default views this base is (its list, board, agenda or calendar), if any. */
  const taskViewKey = tasks ? (Object.entries(tasks.config.views).find(([, p]) => p === path)?.[0] as keyof TaskConfig["views"] | undefined) : undefined;
  const { model } = parsed;
  const [rows, setRows] = useState<BaseRow[] | null>(null);
  /** The notes' text, for TaskNotes' views (comments, checkboxes). */
  const [texts, setTexts] = useState<Map<string, string>>(new Map());
  const [viewIndex, setViewIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [popover, setPopover] = useState<"filter" | "sort" | "views" | "options" | null>(null);
  const [error, setError] = useState("");
  /** View being renamed (double-click on its tab). */
  const [renaming, setRenaming] = useState<number | null>(null);
  /** Row just created: its name is typed at once. */
  const [editRow, setEditRow] = useState<string | null>(null);
  const index = Math.min(viewIndex, model.views.length - 1);
  const view = model.views[index];

  const load = useCallback(async () => {
    const [notes, stats] = await Promise.all([readAllNotes(vault, files), vault.stats?.().catch(() => []) ?? Promise.resolve([])]);
    setRows(rowsOf(notes, parseBase(source).model, stats));
    setTexts(new Map(notes));
  }, [vault, files, model.folder]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void load().catch(() => setRows([]));
  }, [load]);

  /** Edits the base file from its current text. */
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const edit = (change: (file: BaseFile) => void) => {
    const file = parseBase(sourceRef.current);
    change(file);
    const text = serializeBase(file);
    sourceRef.current = text;
    onSource(text);
  };
  const editView = (patch: Partial<View>) => edit((file) => writeView(file, index, { ...file.model.views[index], ...patch }));

  const all = useMemo(() => rows ?? [], [rows]);
  const properties = useMemo(() => {
    const used = propertiesOf(all);
    for (const v of model.views) for (const p of v.order) if (p !== NAME && !p.startsWith("file.") && !p.startsWith("formula.") && !used.includes(p)) used.push(p);
    for (const p of Object.keys(model.columns)) if (!used.includes(p)) used.push(p);
    return used;
  }, [all, model]);
  const formulaIds = Object.keys(model.formulas).map((f) => `formula.${f}`);
  const label = (p: string) => columnInfo(model, p, all).label;
  const info = (p: string): ColumnInfo => columnInfo(model, p, all);
  /** The values a filter on `p` can take: the rows' names, a select's options, the values used. */
  const valuesOf = (p: string) => (p === NAME ? all.map((r) => r.name) : [...new Set([...info(p).options.map((o) => o.value), ...(info(p).values ?? [])])]);
  const known = (p: string) => p === NAME || properties.includes(p) || p.startsWith("file.") || formulaIds.includes(p);
  const order = view.order.length ? (view.order.includes(NAME) ? view.order : [NAME, ...view.order]) : [NAME, ...properties, ...formulaIds];
  const columns = order.filter(known).map(info);
  const hidden = [...properties, ...formulaIds, ...FILE_IDS].filter((p) => !order.includes(p));
  const shown = viewRows(all, view.filters, view.sort, search, model.formulas, view.rowOrder, view.where);

  /** Writes one note, shown at once; the list is read again if it fails. */
  const writeRow = async (row: BaseRow, change: (text: string) => string, local: (row: BaseRow) => BaseRow) => {
    setRows((list) => list?.map((r) => (r.path === row.path ? local(r) : r)) ?? list);
    try {
      const text = await vault.read(row.path);
      await vault.write(row.path, change(text), text);
    } catch (e) {
      setError(`Impossible d'enregistrer ${row.name} : ${String(e)}`);
      void load();
    }
  };
  const setCell = (row: BaseRow, property: string, value: PropertyValue | undefined) =>
    writeRow(
      row,
      (text) => setNoteProperty(text, property, value),
      (r) => {
        const values = { ...r.values };
        if (value === undefined) delete values[property];
        else values[property] = value;
        return { ...r, values };
      },
    );
  const setMeta = (property: string, patch: Partial<ColumnInfo["meta"]>) => edit((file) => writeColumn(file, property, { ...info(property).meta, options: info(property).options, ...patch }));

  const newRow = async (values: Record<string, PropertyValue> = {}) => {
    const folder = model.folder ?? "";
    const target = uniquePath(folder, "Sans titre.md", files);
    let text = "";
    for (const [k, v] of Object.entries(values)) text = setNoteProperty(text, k, v);
    try {
      await vault.create(target, text);
      setEditRow(target);
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  };
  /** Rows in a manual order: replaces the view's sort. */
  const setRowOrder = (paths: string[]) => {
    const rest = view.rowOrder.filter((p) => !paths.includes(p));
    editView({ rowOrder: [...paths, ...rest], sort: [] });
  };
  const valueFor = (property: string, value: string) => (info(property).meta.type === "multi" ? [value] : value);

  const actions: TableActions = {
    onCell: (row, property, value) => void setCell(row, property, value),
    onOptions: (property, options) => setMeta(property, { options }),
    onOpen,
    onRenameRow: (row, name) => {
      setEditRow(null);
      void onRenameRow(row.path, name).then((ok) => ok && void load());
    },
    onEdited: () => setEditRow(null),
    onDeleteRow: (row) => void onDeleteRow(row.path).then(() => void load()),
    onNewRow: (values) => void newRow(values),
    onResize: (sizes) => editView({ columnSize: Object.fromEntries(Object.entries(sizes).filter(([k]) => order.includes(k))) }),
    onSort: (property, direction) => editView({ sort: [{ property, direction }] }),
    onHide: (property) => editView({ order: order.filter((p) => p !== property) }),
    onShowColumn: (property) => editView({ order: [...order, property] }),
    onReorderColumns: (next) => editView({ order: next }),
    onRowOrder: setRowOrder,
    onType: (property, type) => setMeta(property, { type }),
    onAddColumn: (name, type) => {
      if (properties.includes(name)) return setError(`La propriété « ${name} » existe déjà.`);
      edit((file) => {
        writeColumn(file, name, { type, options: [] });
        writeView(file, index, { ...file.model.views[index], order: [...order, name] });
      });
    },
    onFormula: (name, expression) => {
      const id = `formula.${name}`;
      if (expression === null) {
        edit((file) => {
          writeFormula(file, name, null);
          file.model.views.forEach((v, i) => writeView(file, i, { ...v, order: v.order.filter((p) => p !== id), sort: v.sort.filter((s) => s.property !== id) }));
        });
        return;
      }
      edit((file) => {
        writeFormula(file, name, expression);
        if (!order.includes(id)) writeView(file, index, { ...file.model.views[index], order: [...order, id] });
      });
    },
    onSummary: (property, kind) => {
      const summaries = { ...view.summaries };
      if (kind) summaries[property] = kind;
      else delete summaries[property];
      editView({ summaries });
    },
    onRenameColumn: (from, to) => {
      if (properties.includes(to)) return setError(`La propriété « ${to} » existe déjà.`);
      edit((file) => renameInBase(file, from, to));
      for (const row of all.filter((r) => from in r.values)) {
        void writeRow(
          row,
          (text) => renameNoteProperty(text, from, to),
          (r) => {
            const values: Record<string, PropertyValue> = {};
            for (const [k, v] of Object.entries(r.values)) values[k === from ? to : k] = v;
            return { ...r, values };
          },
        );
      }
    },
    onDisplayName: (property, name) => edit((file) => writeDisplayName(file, property, name)),
    onDeleteColumn: (property) => {
      edit((file) => {
        writeColumn(file, property, null);
        file.model.views.forEach((v, i) => writeView(file, i, { ...v, order: v.order.filter((p) => p !== property), sort: v.sort.filter((s) => s.property !== property), filters: v.filters.filter((f) => f.property !== property), groupBy: v.groupBy === property ? null : v.groupBy, dateProperty: v.dateProperty === property ? null : v.dateProperty, image: v.image === property ? null : v.image }));
      });
      for (const row of all.filter((r) => property in r.values)) void setCell(row, property, undefined);
    },
  };

  const noteColumns = properties.map(info);
  const selectColumns = noteColumns.filter((c) => c.meta.type === "select" || c.meta.type === "multi");
  const dateColumns = noteColumns.filter((c) => c.meta.type === "date");
  const imageColumns = noteColumns.filter((c) => c.meta.type === "text" || c.meta.type === "url");

  const addView = (type: ViewType) => {
    edit((file) => {
      const count = file.model.views.filter((v) => v.type === type).length;
      const name = (VIEW_TYPES.find(([t]) => t === type)?.[1] ?? "Vue") + (count ? ` ${count + 1}` : "");
      writeView(file, file.model.views.length, {
        ...defaultView(type, name, order),
        groupBy: type === "board" ? (selectColumns[0]?.property ?? null) : null,
        dateProperty: type === "calendar" ? (dateColumns[0]?.property ?? null) : null,
      });
    });
    setViewIndex(model.views.length);
    setPopover(null);
  };

  const group = view.groupBy && known(view.groupBy) ? info(view.groupBy) : null;
  const options: { title: string; button: string; choices: ColumnInfo[]; value: string | null; none?: string; key: "groupBy" | "dateProperty" | "image" } | null =
    view.type === "table" || view.type === "board"
      ? { title: "Grouper par", button: group ? `Groupé par ${group.label}` : "Grouper", choices: selectColumns, value: view.groupBy, none: view.type === "table" ? "Aucun groupe" : undefined, key: "groupBy" }
      : view.type === "calendar"
        ? { title: "Placer selon la date", button: view.dateProperty ? `Date : ${label(view.dateProperty)}` : "Date", choices: dateColumns, value: view.dateProperty, key: "dateProperty" }
        : view.type === "cards"
          ? { title: "Image de couverture", button: view.image ? `Image : ${label(view.image)}` : "Couverture", choices: imageColumns, value: view.image, none: "Première image de la page", key: "image" }
          : null;
  const cardColumns = columns.filter((c) => c.property !== NAME && c.property !== view.groupBy && c.property !== view.image);

  /** A row (a card, an entry of the calendar) opens in a tab of its own: the base stays open. */
  const openRow = (row: string) => onOpen(row, true);
  // `[[liens]]` written in cells open their note, resolved from the base's folder.
  const openLink = (target: string, newTab: boolean) => {
    const found = resolveLink(target, files, path);
    if (found) onOpen(found, newTab);
  };

  return (
    <BaseLinks.Provider value={openLink}>
      <div className={embedded ? "db-page embedded" : "db-page"}>
        {!embedded && (
          <header className="db-header">
            {taskViewKey && tasks?.openView ? (
              <div className="task-views-head">
                <h1>
                  <Icon name="task" size={26} /> Tâches
                </h1>
                <div className="segmented" role="tablist" aria-label="Vues des tâches">
                  {TASK_VIEWS.map(([key, label, icon]) => (
                    <button key={key} role="tab" aria-selected={key === taskViewKey} className={key === taskViewKey ? "selected" : ""} onClick={() => key !== taskViewKey && tasks.openView?.(key)}>
                      <Icon name={icon} size={13} /> {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <h1>
                <Icon name="database" size={26} /> <BaseTitle name={noteTitle(path)} editable={editable} onRename={(name) => onRenameRow(path, name)} />
              </h1>
            )}
            <p className="dash-muted">{tasks && model.views.some((v) => isTaskView(v.type)) ? "Les tâches du vault, au format du plugin TaskNotes" : model.folder !== null ? `Les pages du dossier « ${model.folder || "racine"} »` : "Toutes les pages du vault"}</p>
          </header>
        )}
        <div className="db-toolbar">
          <div className="db-tabs" role="tablist">
            {embedded && (
              <button className="db-embed-title" onClick={(e) => onOpen(path, e.metaKey || e.ctrlKey)} title="Ouvrir la base">
                <Icon name="database" size={15} /> <span className="db-embed-name">{noteTitle(path)}</span>
              </button>
            )}
            {model.views.map((v, i) => (
              <button key={i} role="tab" aria-selected={i === index} className={i === index ? "db-tab active" : "db-tab"} onClick={() => setViewIndex(i)} onDoubleClick={() => editable && setRenaming(i)}>
                <Icon name={isTaskView(v.type) ? (v.type === "tasknotesKanban" ? "board" : "task") : viewIcon(v.type)} size={14} /> {tasks && isTaskView(v.type) ? taskViewName(v.name) : v.name}
                {i === index && model.views.length > 1 && editable && (
                  <span
                    className="db-tab-remove"
                    role="button"
                    aria-label={`Supprimer la vue ${v.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      edit((file) => removeView(file, i));
                      setViewIndex(0);
                    }}
                  >
                    ×
                  </span>
                )}
              </button>
            ))}
            {editable && (
              <span className="db-popover-anchor">
                <button className="db-icon-button" aria-label="Ajouter une vue" title="Ajouter une vue" onClick={() => setPopover(popover === "views" ? null : "views")}>
                  <Icon name="plus" size={14} />
                </button>
                {popover === "views" && <ViewsMenu onAdd={addView} onClose={() => setPopover(null)} />}
              </span>
            )}
          </div>
          <div className="db-tools">
            <label className="tasks-search db-search">
              <Icon name="search" size={14} />
              <input placeholder="Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setSearch("")} />
            </label>
            <span className="db-popover-anchor">
              <button className={view.filters.length ? "db-tool active" : "db-tool"} onClick={() => setPopover(popover === "filter" ? null : "filter")}>
                <Icon name="filter" size={14} /> Filtrer{view.filters.length ? ` · ${view.filters.length}` : ""}
              </button>
              {popover === "filter" && <FilterMenu view={view} properties={[NAME, ...properties]} label={label} valuesOf={valuesOf} onChange={(filters) => editView({ filters })} onClose={() => setPopover(null)} />}
            </span>
            <span className="db-popover-anchor">
              <button className={view.sort.length ? "db-tool active" : "db-tool"} onClick={() => setPopover(popover === "sort" ? null : "sort")}>
                <Icon name="sort" size={14} /> Trier{view.sort.length ? ` · ${view.sort.length}` : ""}
              </button>
              {popover === "sort" && <SortMenu view={view} properties={[NAME, ...properties, ...formulaIds, ...FILE_IDS]} label={label} onChange={(sort) => editView({ sort })} onClose={() => setPopover(null)} />}
            </span>
            {options && editable && (
              <span className="db-popover-anchor">
                <button className={options.value ? "db-tool active" : "db-tool"} onClick={() => setPopover(popover === "options" ? null : "options")}>
                  <Icon name={options.key === "groupBy" ? "board" : options.key === "dateProperty" ? "calendar" : "image"} size={14} /> {options.button}
                </button>
                {popover === "options" && <ChoiceMenu title={options.title} choices={options.choices} value={options.value} none={options.none} onChoose={(p) => editView({ [options.key]: p })} onClose={() => setPopover(null)} />}
              </span>
            )}
            {editable && (
              <button className="primary db-new" onClick={() => (tasks && isTaskView(view.type) ? tasks.onNew() : void newRow())}>
                <Icon name="plus" size={13} /> Nouveau
              </button>
            )}
          </div>
        </div>
        {renaming !== null && (
          <RenameView
            name={model.views[renaming]?.name ?? ""}
            onDone={(name) => {
              if (name) edit((file) => writeView(file, renaming, { ...file.model.views[renaming], name }));
              setRenaming(null);
            }}
          />
        )}
        {error && (
          <p className="status warning" onClick={() => setError("")}>
            {error}
          </p>
        )}
        {rows === null ? (
          <p className="dash-muted">Lecture des pages…</p>
        ) : tasks && isTaskView(view.type) ? (
          <TaskBaseView view={view} rows={shown} texts={texts} config={tasks.config} vault={vault} editable={editable} onOpen={onOpen} onChanged={() => void load()} onNew={tasks.onNew} onDelete={(row) => void onDeleteRow(row).then(() => void load())} />
        ) : view.type === "board" ? (
          <BoardView
            rows={shown}
            group={group}
            shown={cardColumns}
            formulas={model.formulas}
            selectColumns={selectColumns}
            editable={editable}
            onGroup={(property) => editView({ groupBy: property })}
            onMove={(row, value, paths) => {
              if (view.groupBy && value !== null) void setCell(row, view.groupBy, value);
              if (paths) setRowOrder(paths);
            }}
            onOpen={openRow}
            onNewRow={(value) => void newRow(value !== undefined && view.groupBy ? { [view.groupBy]: valueFor(view.groupBy, value) } : {})}
          />
        ) : view.type === "table" ? (
          <TableView
            rows={shown}
            columns={columns}
            hidden={hidden}
            sizes={view.columnSize}
            editable={editable}
            formulas={model.formulas}
            group={group}
            summaries={view.summaries}
            sorted={view.sort.length > 0}
            editRow={editRow}
            labels={label}
            actions={actions}
          />
        ) : view.type === "cards" ? (
          <GalleryView rows={shown} shown={cardColumns} formulas={model.formulas} image={view.image} files={files} editable={editable} loadImage={loadImage} onOpen={openRow} onNewRow={() => void newRow()} />
        ) : view.type === "calendar" ? (
          <CalendarView
            rows={shown}
            date={view.dateProperty ? info(view.dateProperty) : null}
            dateColumns={dateColumns}
            editable={editable}
            onDate={(property) => editView({ dateProperty: property })}
            onMove={(row, value) => view.dateProperty && void setCell(row, view.dateProperty, value)}
            onOpen={openRow}
            onNewRow={(day) => view.dateProperty && void newRow({ [view.dateProperty]: day })}
          />
        ) : (
          <p className="dash-muted">La vue « {view.name} » ({view.type}) est une vue d'Obsidian que FlowNote n'affiche pas encore. Elle est conservée telle quelle.</p>
        )}
      </div>
    </BaseLinks.Provider>
  );
}

const FILE_IDS = FILE_PROPERTIES.map(([p]) => p);

/** TaskNotes' default views, offered side by side. */
const TASK_VIEWS: [keyof TaskConfig["views"], string, IconName][] = [
  ["tasks", "Liste", "list"],
  ["kanban", "Tableau", "board"],
  ["agenda", "Agenda", "clock"],
  ["calendar", "Calendrier", "calendar"],
];
