import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PropertyValue } from "../markdown/frontmatter";
import { Icon, type IconName } from "../Icon";
import { readAllNotes, type Vault } from "../vault/vault";
import { noteTitle, uniquePath } from "../vault/links";
import { defaultView, NAME, parseBase, renameInBase, removeView, serializeBase, writeColumn, writeFormula, writeView, type BaseFile, type BaseView as View, type SimpleFilter } from "./baseFile";
import { FILE_PROPERTIES, propertiesOf, renameNoteProperty, rowsOf, setNoteProperty, viewRows, type BaseRow } from "./rows";
import { TableView, type TableActions } from "./TableView";
import { BoardView } from "./BoardView";
import { GalleryView } from "./GalleryView";
import { CalendarView } from "./CalendarView";
import { columnInfo, type ColumnInfo } from "./columns";
import { TYPE_ICONS } from "./cells";

const OPS: [SimpleFilter["op"], string][] = [
  ["is", "est"],
  ["isNot", "n'est pas"],
  ["contains", "contient"],
  ["checked", "est cochée"],
  ["unchecked", "n'est pas cochée"],
  ["empty", "est vide"],
  ["notEmpty", "n'est pas vide"],
];

/** A popover closed by a click outside. */
function usePopover(onClose: () => void) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose();
    window.addEventListener("mousedown", down);
    return () => window.removeEventListener("mousedown", down);
  }, [onClose]);
  return box;
}

function FilterMenu({ view, properties, label, onChange, onClose }: { view: View; properties: string[]; label: (p: string) => string; onChange: (filters: SimpleFilter[]) => void; onClose: () => void }) {
  const box = usePopover(onClose);
  const set = (i: number, patch: Partial<SimpleFilter>) => onChange(view.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div ref={box} className="db-popover db-menu db-menu-right db-rules">
      {view.filters.length === 0 && <p className="dash-muted">Aucun filtre dans cette vue.</p>}
      {view.filters.map((f, i) => (
        <div key={i} className="db-rule">
          <select value={f.property} onChange={(e) => set(i, { property: e.target.value })}>
            {properties.map((p) => (
              <option key={p} value={p}>
                {label(p)}
              </option>
            ))}
          </select>
          <select value={f.op} onChange={(e) => set(i, { op: e.target.value as SimpleFilter["op"] })}>
            {OPS.map(([op, text]) => (
              <option key={op} value={op}>
                {text}
              </option>
            ))}
          </select>
          {["is", "isNot", "contains"].includes(f.op) && <input value={f.value} placeholder="Valeur" onChange={(e) => set(i, { value: e.target.value })} />}
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

function SortMenu({ view, properties, label, onChange, onClose }: { view: View; properties: string[]; label: (p: string) => string; onChange: (sort: View["sort"]) => void; onClose: () => void }) {
  const box = usePopover(onClose);
  return (
    <div ref={box} className="db-popover db-menu db-menu-right db-rules">
      {view.sort.length === 0 && <p className="dash-muted">Lignes triées par nom.</p>}
      {view.sort.map((s, i) => (
        <div key={i} className="db-rule">
          <select value={s.property} onChange={(e) => onChange(view.sort.map((x, j) => (j === i ? { ...x, property: e.target.value } : x)))}>
            {properties.map((p) => (
              <option key={p} value={p}>
                {label(p)}
              </option>
            ))}
          </select>
          <select value={s.direction} onChange={(e) => onChange(view.sort.map((x, j) => (j === i ? { ...x, direction: e.target.value as "ASC" | "DESC" } : x)))}>
            <option value="ASC">Croissant</option>
            <option value="DESC">Décroissant</option>
          </select>
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
  const box = usePopover(onClose);
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
  const box = usePopover(onClose);
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
  /** Notes were created or renamed: the app reads the vault again. */
  onChanged: () => void;
  /** Blob URL of a vault image (gallery covers). */
  loadImage: (path: string) => Promise<string>;
  /** Embedded in a note: no page title, a smaller frame. */
  embedded?: boolean;
}

/**
 * A base, like a Notion database: views in tabs (table, kanban, gallery,
 * calendar) over the notes of a folder. The base file (`.base`) is the page's
 * text: its edits go through `onSource` like a note's. Cells are written to the
 * rows' notes.
 */
export function BaseView({ vault, files, path, source, editable, onSource, onOpen, onRenameRow, onChanged, loadImage, embedded = false }: BaseViewProps) {
  const parsed = useMemo(() => parseBase(source), [source]);
  const { model } = parsed;
  const [rows, setRows] = useState<BaseRow[] | null>(null);
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
  const known = (p: string) => p === NAME || properties.includes(p) || p.startsWith("file.") || formulaIds.includes(p);
  const order = view.order.length ? (view.order.includes(NAME) ? view.order : [NAME, ...view.order]) : [NAME, ...properties, ...formulaIds];
  const columns = order.filter(known).map(info);
  const hidden = [...properties, ...formulaIds, ...FILE_IDS].filter((p) => !order.includes(p));
  const shown = viewRows(all, view.filters, view.sort, search, model.formulas, view.rowOrder);

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

  return (
    <div className={embedded ? "db-page embedded" : "db-page"}>
      {!embedded && (
        <header className="db-header">
          <h1>
            <Icon name="database" size={26} /> {noteTitle(path)}
          </h1>
          <p className="dash-muted">{model.folder !== null ? `Les pages du dossier « ${model.folder || "racine"} »` : "Toutes les pages du vault"}</p>
        </header>
      )}
      <div className="db-toolbar">
        <div className="db-tabs" role="tablist">
          {embedded && (
            <button className="db-embed-title" onClick={(e) => onOpen(path, e.metaKey || e.ctrlKey)} title="Ouvrir la base">
              <Icon name="database" size={15} /> {noteTitle(path)}
            </button>
          )}
          {model.views.map((v, i) => (
            <button key={i} role="tab" aria-selected={i === index} className={i === index ? "db-tab active" : "db-tab"} onClick={() => setViewIndex(i)} onDoubleClick={() => editable && setRenaming(i)}>
              <Icon name={viewIcon(v.type)} size={14} /> {v.name}
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
          <label className="tickets-search db-search">
            <Icon name="search" size={14} />
            <input placeholder="Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setSearch("")} />
          </label>
          <span className="db-popover-anchor">
            <button className={view.filters.length ? "db-tool active" : "db-tool"} onClick={() => setPopover(popover === "filter" ? null : "filter")}>
              <Icon name="filter" size={14} /> Filtrer{view.filters.length ? ` · ${view.filters.length}` : ""}
            </button>
            {popover === "filter" && <FilterMenu view={view} properties={[NAME, ...properties]} label={label} onChange={(filters) => editView({ filters })} onClose={() => setPopover(null)} />}
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
            <button className="primary db-new" onClick={() => void newRow()}>
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
          onOpen={onOpen}
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
        <GalleryView rows={shown} shown={cardColumns} formulas={model.formulas} image={view.image} files={files} editable={editable} loadImage={loadImage} onOpen={onOpen} onNewRow={() => void newRow()} />
      ) : view.type === "calendar" ? (
        <CalendarView
          rows={shown}
          date={view.dateProperty ? info(view.dateProperty) : null}
          dateColumns={dateColumns}
          editable={editable}
          onDate={(property) => editView({ dateProperty: property })}
          onMove={(row, value) => view.dateProperty && void setCell(row, view.dateProperty, value)}
          onOpen={onOpen}
          onNewRow={(day) => view.dateProperty && void newRow({ [view.dateProperty]: day })}
        />
      ) : (
        <p className="dash-muted">La vue « {view.name} » ({view.type}) est une vue d'Obsidian que FlowNote n'affiche pas encore. Elle est conservée telle quelle.</p>
      )}
    </div>
  );
}

const FILE_IDS = FILE_PROPERTIES.map(([p]) => p);
