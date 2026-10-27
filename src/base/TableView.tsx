import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCoreRowModel, useReactTable, type ColumnDef, type ColumnSizingState } from "@tanstack/react-table";
import type { PropertyValue } from "../markdown/frontmatter";
import { Icon, type IconName } from "../Icon";
import { COLUMN_TYPES, NAME, type ColumnType, type SelectOption } from "./baseFile";
import type { ColumnInfo } from "./columns";
import { ValueView } from "./columns";
import { FILE_PROPERTIES, SUMMARIES, summarize, type BaseRow } from "./rows";
import { Cell, OptionPill, TYPE_ICONS } from "./cells";
import { PopoverMenu, type MenuItem } from "../Sidebar";
import { useClickOutside } from "../hooks/useClickOutside";

export type { ColumnInfo } from "./columns";

export interface TableActions {
  onCell: (row: BaseRow, property: string, value: PropertyValue | undefined) => void;
  onOptions: (property: string, options: SelectOption[]) => void;
  onOpen: (path: string, newTab: boolean) => void;
  onRenameRow: (row: BaseRow, name: string) => void;
  /** Deletes the row's note (after confirmation). */
  onDeleteRow: (row: BaseRow) => void;
  /** The name of a new row was typed (or left as is). */
  onEdited: () => void;
  onNewRow: (values?: Record<string, PropertyValue>) => void;
  onResize: (sizes: Record<string, number>) => void;
  onSort: (property: string, direction: "ASC" | "DESC") => void;
  onHide: (property: string) => void;
  onReorderColumns: (order: string[]) => void;
  onRowOrder: (paths: string[]) => void;
  onRenameColumn: (property: string, name: string) => void;
  /** The name shown for a column that cannot be renamed in the notes (the note's name); null: the default one. */
  onDisplayName: (property: string, name: string | null) => void;
  onType: (property: string, type: ColumnType) => void;
  onDeleteColumn: (property: string) => void;
  onAddColumn: (name: string, type: ColumnType) => void;
  onShowColumn: (property: string) => void;
  onFormula: (name: string, expression: string | null) => void;
  onSummary: (property: string, kind: string | null) => void;
}

const iconOf = (column: ColumnInfo): IconName => (column.kind === "name" ? "doc" : column.kind === "formula" ? "formula" : column.kind === "file" ? "info" : TYPE_ICONS[column.meta.type]);

/**
 * Width of a column not resized yet, after its content: numbers and boxes are
 * narrow, text wider, so that a few columns fit the page.
 */
function defaultWidth(column: ColumnInfo): number {
  if (column.kind === "name") return 220;
  if (column.kind === "formula") return 160;
  switch (column.meta.type) {
    case "number":
    case "checkbox":
      return 110;
    case "date":
    case "select":
      return 140;
    default:
      return 170;
  }
}

/** Header menu of a column: rename, type or formula, sort, hide, delete. */
function HeaderMenu({ column, actions, onClose }: { column: ColumnInfo; actions: TableActions; onClose: () => void }) {
  const [name, setName] = useState(column.kind === "formula" ? column.property.slice(8) : column.property);
  const [formula, setFormula] = useState(column.formula ?? "");
  const [label, setLabel] = useState(column.label);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useClickOutside(box, onClose);
  const run = (action: () => void) => {
    action();
    onClose();
  };
  return (
    <div ref={box} className="db-popover db-menu" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {column.kind === "note" && (
        <input
          autoFocus
          className="db-menu-input"
          value={name}
          aria-label="Nom de la propriété"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim() && name.trim() !== column.property) run(() => actions.onRenameColumn(column.property, name.trim()));
            if (e.key === "Escape") onClose();
          }}
        />
      )}
      {column.kind === "name" && (
        <>
          <input
            autoFocus
            className="db-menu-input"
            value={label}
            aria-label="Nom de la colonne"
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run(() => actions.onDisplayName(NAME, label.trim() && label.trim() !== "Nom" ? label.trim() : null));
              if (e.key === "Escape") onClose();
            }}
          />
          <p className="db-menu-hint">Chaque ligne est une note : cette colonne est son nom de fichier. Elle se renomme ici, mais ne se supprime pas.</p>
          <hr />
        </>
      )}
      {column.kind === "formula" && (
        <>
          <small>Formule « {column.label} »</small>
          <textarea
            autoFocus
            className="db-formula-input"
            value={formula}
            spellCheck={false}
            aria-label="Formule"
            onChange={(e) => setFormula(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                run(() => actions.onFormula(column.property.slice(8), formula.trim()));
              }
              if (e.key === "Escape") onClose();
            }}
          />
          <p className="db-menu-hint">Ex. : prix * quantite · if(fait, "✓", "") · (date(echeance) - today()).days</p>
        </>
      )}
      {column.kind === "note" && (
        <>
          <small>Type</small>
          {COLUMN_TYPES.map(([type, label]) => (
            <button key={type} className={column.meta.type === type ? "selected" : undefined} onClick={() => run(() => actions.onType(column.property, type))}>
              <Icon name={TYPE_ICONS[type]} size={14} /> {label}
            </button>
          ))}
          <hr />
        </>
      )}
      <button onClick={() => run(() => actions.onSort(column.property, "ASC"))}>
        <Icon name="sort" size={14} /> Trier par ordre croissant
      </button>
      <button onClick={() => run(() => actions.onSort(column.property, "DESC"))}>
        <Icon name="sort" size={14} /> Trier par ordre décroissant
      </button>
      {column.kind !== "name" && (
        <button onClick={() => run(() => actions.onHide(column.property))}>
          <Icon name="close" size={14} /> Masquer dans cette vue
        </button>
      )}
      {column.kind === "note" &&
        (confirmDelete ? (
          <button className="danger" onClick={() => run(() => actions.onDeleteColumn(column.property))}>
            <Icon name="trash" size={14} /> Confirmer : retirer « {column.property} » de toutes les lignes
          </button>
        ) : (
          <button className="danger" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={14} /> Supprimer la propriété
          </button>
        ))}
      {column.kind === "formula" && (
        <button className="danger" onClick={() => run(() => actions.onFormula(column.property.slice(8), null))}>
          <Icon name="trash" size={14} /> Supprimer la formule
        </button>
      )}
    </div>
  );
}

/** "+" at the end of the header: a property, a formula, a file property, or a hidden column. */
function AddColumnMenu({ hidden, labels, actions, onClose }: { hidden: string[]; labels: (p: string) => string; actions: TableActions; onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ColumnType | "formula">("text");
  const [formula, setFormula] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useClickOutside(box, onClose);
  const add = () => {
    if (!name.trim()) return;
    if (type === "formula") actions.onFormula(name.trim(), formula.trim() || "0");
    else actions.onAddColumn(name.trim(), type);
    onClose();
  };
  const fileProps = FILE_PROPERTIES.filter(([p]) => hidden.includes(p) || !hidden.length);
  return (
    <div
      ref={box}
      className="db-popover db-menu db-menu-right"
      onMouseDown={(e) => e.stopPropagation()}
      // ↵ adds from anywhere in the menu, even after a click on a type (⇧↵ goes to the line in a formula); esc closes.
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        else if (e.key === "Enter" && !(e.shiftKey && e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          add();
        }
      }}
    >
      <input autoFocus className="db-menu-input" placeholder="Nom de la propriété" value={name} onChange={(e) => setName(e.target.value)} />
      <small>Type</small>
      {COLUMN_TYPES.map(([t, label]) => (
        <button key={t} className={type === t ? "selected" : undefined} onClick={() => setType(t)}>
          <Icon name={TYPE_ICONS[t]} size={14} /> {label}
        </button>
      ))}
      <button className={type === "formula" ? "selected" : undefined} onClick={() => setType("formula")}>
        <Icon name="formula" size={14} /> Formule
      </button>
      {type === "formula" && <textarea className="db-formula-input" placeholder="prix * quantite" value={formula} spellCheck={false} onChange={(e) => setFormula(e.target.value)} />}
      <button className="db-menu-primary" disabled={!name.trim()} onClick={add}>
        Ajouter
      </button>
      {fileProps.length > 0 && (
        <>
          <hr />
          <small>Propriétés du fichier</small>
          {fileProps.map(([p, label]) => (
            <button
              key={p}
              onClick={() => {
                actions.onShowColumn(p);
                onClose();
              }}
            >
              <Icon name="info" size={14} /> {label}
            </button>
          ))}
        </>
      )}
      {hidden.filter((p) => !p.startsWith("file.")).length > 0 && (
        <>
          <hr />
          <small>Masquées dans cette vue</small>
          {hidden
            .filter((p) => !p.startsWith("file."))
            .map((p) => (
              <button
                key={p}
                onClick={() => {
                  actions.onShowColumn(p);
                  onClose();
                }}
              >
                <Icon name="plus" size={14} /> {labels(p)}
              </button>
            ))}
        </>
      )}
    </div>
  );
}

/** The name of a row: opens it; the pencil (or a new row) renames the note. */
function NameCell({ row, editable, autoEdit, renaming = false, actions }: { row: BaseRow; editable: boolean; autoEdit: boolean; renaming?: boolean; actions: TableActions }) {
  const [editing, setEditing] = useState(autoEdit);
  const [text, setText] = useState(autoEdit ? "" : row.name);
  useEffect(() => {
    if (autoEdit) {
      setEditing(true);
      setText("");
    }
  }, [autoEdit]);
  // "Renommer" in the row's menu: the name, ready to be changed.
  useEffect(() => {
    if (renaming) {
      setEditing(true);
      setText(row.name);
    }
  }, [renaming, row.name]);
  const commit = (input: HTMLInputElement | null) => {
    setEditing(false);
    const next = text.trim();
    if (next && next !== row.name) actions.onRenameRow(row, next);
    else {
      setText(row.name);
      actions.onEdited();
    }
    input?.closest("td")?.focus();
  };
  if (editing) {
    return (
      <div className="db-cell editing">
        <input
          autoFocus
          className="db-input"
          value={text}
          placeholder={row.name}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(e.currentTarget);
            if (e.key === "Escape") {
              setText(row.name);
              setEditing(false);
              actions.onEdited();
              e.currentTarget.closest("td")?.focus();
            }
          }}
        />
      </div>
    );
  }
  return (
    <div className="db-cell db-name">
      <button className="db-name-link" tabIndex={-1} onClick={() => actions.onOpen(row.path, true)} title="Ouvrir dans un nouvel onglet">
        <Icon name="doc" size={14} />
        <span>{row.name}</span>
      </button>
      {editable && (
        <button className="db-icon-button db-name-edit" tabIndex={-1} aria-label="Renommer" title="Renommer" onClick={() => (setText(row.name), setEditing(true))}>
          <Icon name="pencil" size={13} />
        </button>
      )}
    </div>
  );
}

/** Where the menu of a summary goes: under its button, or above when there is more room there; never off screen. */
function summaryMenuPlace(anchor: DOMRect): React.CSSProperties {
  const below = window.innerHeight - anchor.bottom - 12;
  const above = anchor.top - 12;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 228));
  return below >= 280 || below >= above ? { left, top: anchor.bottom + 4, maxHeight: below } : { left, bottom: window.innerHeight - anchor.top + 4, maxHeight: above };
}

function SummaryCell({ column, rows, kind, formulas, editable, onSummary }: { column: ColumnInfo; rows: BaseRow[]; kind: string | undefined; formulas: Record<string, string>; editable: boolean; onSummary: (kind: string | null) => void }) {
  const [place, setPlace] = useState<React.CSSProperties | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!place) return;
    const down = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node) && setPlace(null);
    const close = () => setPlace(null);
    window.addEventListener("mousedown", down);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [place]);
  const type = column.meta.type;
  const choices = SUMMARIES.filter((s) => s.types === "all" || (s.types === "number" && (type === "number" || column.kind === "formula")) || (s.types === "checkbox" && type === "checkbox") || (s.types === "date" && type === "date"));
  const label = SUMMARIES.find((s) => s.id === kind)?.label;
  const choose = (id: string | null) => {
    onSummary(id);
    setPlace(null);
  };
  return (
    <div ref={box} className="db-summary">
      <button
        className={kind ? "db-summary-button set" : "db-summary-button"}
        disabled={!editable}
        onClick={(e) => setPlace(place ? null : summaryMenuPlace(e.currentTarget.getBoundingClientRect()))}
      >
        {kind ? (
          <>
            <span>{label}</span> <strong>{summarize(rows, column.property, kind, formulas)}</strong>
          </>
        ) : (
          <span>Calculer</span>
        )}
      </button>
      {place &&
        // In the page's body, over the view tabs and outside the table's scrolling box.
        createPortal(
          <div ref={menu} className="db-popover db-menu db-summary-menu" style={place} onMouseDown={(e) => e.stopPropagation()}>
            <button onClick={() => choose(null)}>Aucun calcul</button>
            {choices.map((s) => (
              <button key={s.id} className={kind === s.id ? "selected" : undefined} onClick={() => choose(s.id)}>
                {s.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

interface Group {
  key: string;
  option: SelectOption | null;
  rows: BaseRow[];
}

/**
 * The table view: TanStack Table for the column sizes, our cells for the look.
 * Keyboard: arrows and Tab move between cells, Enter edits. Columns move by
 * dragging their header, rows by their handle (the view's manual order).
 */
export function TableView({
  rows,
  columns,
  hidden,
  sizes,
  editable,
  formulas,
  group,
  summaries,
  sorted,
  editRow,
  labels,
  actions,
}: {
  rows: BaseRow[];
  columns: ColumnInfo[];
  hidden: string[];
  sizes: Record<string, number>;
  editable: boolean;
  formulas: Record<string, string>;
  /** Rows grouped by this column (sections). */
  group: ColumnInfo | null;
  summaries: Record<string, string>;
  /** The view has a sort: dragging a row replaces it with a manual order. */
  sorted: boolean;
  /** Row whose name is being typed (just created). */
  editRow: string | null;
  labels: (p: string) => string;
  actions: TableActions;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [sizing, setSizing] = useState<ColumnSizingState>(sizes);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [colDrag, setColDrag] = useState<{ id: string; target: number } | null>(null);
  const [rowDrag, setRowDrag] = useState<{ path: string; target: number } | null>(null);
  /** The menu of a row (right click, or a click on its handle), and the row being renamed from it. */
  const [rowMenu, setRowMenu] = useState<{ path: string; anchor: DOMRect } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  useEffect(() => setSizing(sizes), [sizes]);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const defs = useMemo<ColumnDef<BaseRow>[]>(() => columns.map((c) => ({ id: c.property, size: defaultWidth(c), minSize: 80 })), [columns]);
  const table = useReactTable({ data: rows, columns: defs, getCoreRowModel: getCoreRowModel(), getRowId: (r) => r.path, columnResizeMode: "onChange", state: { columnSizing: sizing }, onColumnSizingChange: setSizing });
  const resizing = table.getState().columnSizingInfo.isResizingColumn;
  const wasResizing = useRef<string | false>(false);
  useEffect(() => {
    if (wasResizing.current && !resizing) actionsRef.current.onResize(sizing);
    wasResizing.current = resizing;
  }, [resizing, sizing]);
  const width = (id: string) => table.getColumn(id)?.getSize() ?? 180;

  const groups: Group[] = group
    ? [
        ...group.options.map((option) => ({ key: option.value, option, rows: rows.filter((r) => [r.values[group.property]].flat().map(String).includes(option.value)) })),
        { key: "", option: null, rows: rows.filter((r) => !group.options.some((o) => [r.values[group.property]].flat().map(String).includes(o.value))) },
      ].filter((g) => g.rows.length > 0 || g.option)
    : [{ key: "", option: null, rows }];

  /** Keyboard: arrows / Tab between cells, Enter to edit. */
  const onKey = (e: React.KeyboardEvent<HTMLTableCellElement>) => {
    const td = e.currentTarget;
    if (e.target !== td) return;
    const r = Number(td.dataset.r);
    const c = Number(td.dataset.c);
    const focus = (rr: number, cc: number) => tableRef.current?.querySelector<HTMLElement>(`td[data-r="${rr}"][data-c="${cc}"]`)?.focus();
    const move: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, e.shiftKey ? -1 : 1] };
    if (move[e.key]) {
      e.preventDefault();
      const [dr, dc] = move[e.key];
      focus(r + dr, Math.max(0, Math.min(columns.length - 1, c + dc)));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = td.querySelector<HTMLElement>(".db-name-edit, button.db-cell-check, .db-cell:not(.db-name)");
      target?.click();
    }
  };

  /** Column drag: from the header, dropped between two headers. */
  const startColumnDrag = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || id === NAME || !editable) return;
    const x0 = e.clientX;
    let moved = false;
    const targetAt = (x: number) => {
      const ths = [...(tableRef.current?.querySelectorAll<HTMLElement>("thead th[data-id]") ?? [])];
      return Math.max(1, ths.filter((th) => x > th.getBoundingClientRect().left + th.offsetWidth / 2).length);
    };
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - x0) < 5) return;
      moved = true;
      setColDrag({ id, target: targetAt(ev.clientX) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setColDrag(null);
      if (!moved) return setMenu((m) => (m === id ? null : id));
      const order = columns.map((c) => c.property).filter((p) => p !== id);
      const at = targetAt(ev.clientX);
      const from = columns.findIndex((c) => c.property === id);
      order.splice(at > from ? at - 1 : at, 0, id);
      actions.onReorderColumns(order);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /** Row drag: from its handle, dropped between two rows. */
  const startRowDrag = (e: React.PointerEvent, path: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const startY = e.clientY;
    let moved = false;
    const trs = () => [...(tableRef.current?.querySelectorAll<HTMLElement>("tbody tr[data-path]") ?? [])];
    const targetAt = (y: number) => trs().filter((tr) => y > tr.getBoundingClientRect().top + tr.offsetHeight / 2).length;
    const move = (ev: PointerEvent) => {
      moved ||= Math.abs(ev.clientY - startY) > 3;
      if (moved) setRowDrag({ path, target: targetAt(ev.clientY) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setRowDrag(null);
      // A click on the handle, without a drag: the row's menu.
      if (!moved) return setRowMenu({ path, anchor: handle });
      const paths = trs().map((tr) => tr.dataset.path!);
      const at = targetAt(ev.clientY);
      const from = paths.indexOf(path);
      if (at === from || at === from + 1) return;
      const next = paths.filter((p) => p !== path);
      next.splice(at > from ? at - 1 : at, 0, path);
      actions.onRowOrder(next);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  let rowIndex = 0;
  const visibleRows = groups.flatMap((g) => (collapsed.has(g.key) ? [] : g.rows));
  return (
    <div className={colDrag || rowDrag ? "db-table-wrap dragging" : "db-table-wrap"}>
      <table ref={tableRef} className="db-table" style={{ width: table.getTotalSize() + 44 }}>
        <thead>
          <tr>
            {columns.map((column, i) => (
              <th key={column.property} data-id={column.property} style={{ width: width(column.property) }} className={colDrag && colDrag.target === i && colDrag.id !== column.property ? "drop-before" : undefined}>
                <button className="db-th" onPointerDown={(e) => startColumnDrag(e, column.property)} onClick={(e) => column.property === NAME && (e.preventDefault(), setMenu(menu === NAME ? null : NAME))}>
                  <Icon name={iconOf(column)} size={14} />
                  <span>{column.label}</span>
                </button>
                {menu === column.property && <HeaderMenu column={column} actions={actions} onClose={() => setMenu(null)} />}
                <div
                  className={table.getColumn(column.property)?.getIsResizing() ? "db-resizer resizing" : "db-resizer"}
                  onMouseDown={table.getHeaderGroups()[0].headers.find((h) => h.id === column.property)?.getResizeHandler()}
                  onDoubleClick={() => table.getColumn(column.property)?.resetSize()}
                />
              </th>
            ))}
            <th className={colDrag && colDrag.target >= columns.length ? "db-th-add drop-before" : "db-th-add"}>
              {editable && (
                <button className="db-icon-button" aria-label="Ajouter une propriété" title="Ajouter une propriété" onClick={() => setAdding(!adding)}>
                  <Icon name="plus" size={15} />
                </button>
              )}
              {adding && <AddColumnMenu hidden={hidden} labels={labels} actions={actions} onClose={() => setAdding(false)} />}
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.key}>
              {group && (
                <tr className="db-group-row">
                  <td colSpan={columns.length + 1}>
                    <button
                      className="db-group-toggle"
                      onClick={() => {
                        const next = new Set(collapsed);
                        if (next.has(g.key)) next.delete(g.key);
                        else next.add(g.key);
                        setCollapsed(next);
                      }}
                    >
                      <Icon name={collapsed.has(g.key) ? "chevronRight" : "chevronDown"} size={12} />
                      {g.option ? <OptionPill option={g.option} /> : <span className="dash-muted">Sans {group.label.toLowerCase()}</span>}
                      <span className="board-count">{g.rows.length}</span>
                    </button>
                    {editable && (
                      <button className="db-icon-button" aria-label="Nouvelle ligne dans ce groupe" title="Nouvelle ligne dans ce groupe" onClick={() => actions.onNewRow(g.option ? { [group.property]: group.meta.type === "multi" ? [g.option.value] : g.option.value } : {})}>
                        <Icon name="plus" size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              )}
              {!collapsed.has(g.key) &&
                g.rows.map((row) => {
                  const r = rowIndex++;
                  const dropBefore = rowDrag && rowDrag.target === visibleRows.indexOf(row) && rowDrag.path !== row.path;
                  return (
                    <tr
                      key={row.path}
                      data-path={row.path}
                      className={[rowDrag?.path === row.path ? "dragging" : "", dropBefore ? "drop-before" : ""].join(" ").trim() || undefined}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setRowMenu({ path: row.path, anchor: new DOMRect(e.clientX, e.clientY, 0, 0) });
                      }}
                    >
                      {columns.map((column, c) => (
                        <td
                          key={column.property}
                          data-r={r}
                          data-c={c}
                          tabIndex={0}
                          style={{ width: width(column.property) }}
                          onKeyDown={onKey}
                          // A click in the cell's empty space (below a short value, in a tall row) edits it too.
                          onClick={(e) => e.target === e.currentTarget && e.currentTarget.querySelector<HTMLElement>(":scope > .db-cell")?.click()}
                        >
                          {column.kind === "name" ? (
                            <>
                              {editable && !group && (
                                <button className="db-row-handle" tabIndex={-1} aria-label="Déplacer la ligne, ou son menu" title={sorted ? "Glisser pour ordonner à la main (retire le tri) · Cliquer pour le menu" : "Glisser pour déplacer · Cliquer pour le menu"} onPointerDown={(e) => startRowDrag(e, row.path)}>
                                  <Icon name="grip" size={12} />
                                </button>
                              )}
                              <NameCell row={row} editable={editable} autoEdit={editRow === row.path} renaming={renaming === row.path} actions={{ ...actions, onEdited: () => (setRenaming(null), actions.onEdited()), onRenameRow: (r, name) => (setRenaming(null), actions.onRenameRow(r, name)) }} />
                            </>
                          ) : column.kind === "note" ? (
                            <Cell
                              meta={column.meta}
                              options={column.options}
                              value={row.values[column.property]}
                              editable={editable}
                              suggestions={column.values}
                              onChange={(value) => actions.onCell(row, column.property, value)}
                              onOptions={(options) => actions.onOptions(column.property, options)}
                            />
                          ) : (
                            <div className="db-cell db-readonly">
                              <ValueView column={column} row={row} formulas={formulas} />
                            </div>
                          )}
                        </td>
                      ))}
                      <td />
                    </tr>
                  );
                })}
            </GroupRows>
          ))}
          {rowDrag && rowDrag.target >= visibleRows.length && (
            <tr className="drop-before db-drop-end">
              <td colSpan={columns.length + 1} />
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            {columns.map((column) => (
              <td key={column.property} style={{ width: width(column.property) }}>
                <SummaryCell column={column} rows={rows} kind={summaries[column.property]} formulas={formulas} editable={editable} onSummary={(kind) => actions.onSummary(column.property, kind)} />
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
      {editable && (
        <button className="db-new-row" onClick={() => actions.onNewRow()}>
          <Icon name="plus" size={14} /> Nouveau
        </button>
      )}
      {rowMenu && <RowMenu row={rows.find((r) => r.path === rowMenu.path)} anchor={rowMenu.anchor} editable={editable} actions={actions} onRename={setRenaming} onClose={() => setRowMenu(null)} />}
    </div>
  );
}

/** A row's menu: open it, rename or delete its note. */
function RowMenu({ row, anchor, editable, actions, onRename, onClose }: { row: BaseRow | undefined; anchor: DOMRect; editable: boolean; actions: TableActions; onRename: (path: string) => void; onClose: () => void }) {
  if (!row) return null;
  const items: MenuItem[] = [
    { label: "Ouvrir dans un nouvel onglet", icon: "open", run: () => actions.onOpen(row.path, true) },
    { label: "Ouvrir ici", icon: "doc", run: () => actions.onOpen(row.path, false) },
    ...(editable
      ? [
          { label: "Renommer", icon: "pencil", run: () => onRename(row.path) } satisfies MenuItem,
          { label: "Supprimer", icon: "trash", danger: true, run: () => actions.onDeleteRow(row) } satisfies MenuItem,
        ]
      : []),
  ];
  return createPortal(<PopoverMenu anchor={anchor} items={items} onClose={onClose} />, document.body);
}

function GroupRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
