import { Icon } from "../Icon";
import { readProperties, setProperty, type PropertyValue } from "../markdown/frontmatter";
import { noteTitle } from "../vault/links";
import { NAME, type BaseModel, type SelectOption } from "./baseFile";
import { Cell, TYPE_ICONS } from "./cells";
import { columnInfo, ValueView } from "./columns";
import type { BaseRow } from "./rows";

/** A base the open note is a row of. */
export interface RowBase {
  path: string;
  model: BaseModel;
}

/** The note properties a base shows: its typed columns and those of its views. */
export function baseProperties(model: BaseModel): string[] {
  const list = Object.keys(model.columns);
  for (const view of model.views) for (const p of view.order) if (p !== NAME && !p.startsWith("file.") && !p.startsWith("formula.") && !list.includes(p)) list.push(p);
  return list;
}

/** The base whose folder holds `notePath` (the deepest one), if any. */
export function baseOfNote(notePath: string, bases: RowBase[]): RowBase | null {
  const owners = bases.filter((b) => b.model.folder !== null && b.model.folder !== "" && notePath.startsWith(`${b.model.folder}/`) && notePath.toLowerCase().endsWith(".md"));
  return owners.sort((a, b) => (b.model.folder?.length ?? 0) - (a.model.folder?.length ?? 0))[0] ?? null;
}

/**
 * The properties of a note that is a row of a base, as in a Notion database
 * page: the base's typed editors (selects with their colors, dates…), then
 * its formulas, read only. Other properties stay in the regular panel.
 */
export function RowProperties({
  base,
  path,
  raw,
  editable,
  onChange,
  onOptions,
  onOpen,
}: {
  base: RowBase;
  path: string;
  /** Front matter of the note ("---\n…\n---"), or null. */
  raw: string | null;
  editable: boolean;
  onChange: (raw: string | null) => void;
  onOptions: (property: string, options: SelectOption[]) => void;
  onOpen: (path: string, newTab: boolean) => void;
}) {
  const { properties, error } = readProperties(raw);
  if (error) return null;
  const values: Record<string, PropertyValue> = Object.fromEntries(properties.map((p) => [p.key, p.value]));
  const row: BaseRow = { path, name: noteTitle(path), values, file: { name: noteTitle(path), path, folder: base.model.folder ?? "", ctime: null, mtime: null, tags: [], links: 0 }, image: null };
  const columns = baseProperties(base.model).map((p) => columnInfo(base.model, p, [row]));
  const formulas = Object.keys(base.model.formulas).map((f) => columnInfo(base.model, `formula.${f}`, [row]));
  return (
    <section className="properties db-row-properties" aria-label="Propriétés de la base">
      <button className="db-row-base" onClick={(e) => onOpen(base.path, e.metaKey || e.ctrlKey)} title="Ouvrir la base">
        <Icon name="database" size={13} /> {noteTitle(base.path)}
      </button>
      {columns.map((column) => (
        <div key={column.property} className="property">
          <span className="property-icon" title={column.meta.type}>
            <Icon name={TYPE_ICONS[column.meta.type]} size={14} />
          </span>
          <span className="property-key">{column.label}</span>
          <div className="property-editor">
            <Cell
              meta={column.meta}
              options={column.options}
              value={values[column.property]}
              editable={editable}
              onChange={(value) => onChange(setProperty(raw, column.property, value))}
              onOptions={(options) => onOptions(column.property, options)}
            />
          </div>
        </div>
      ))}
      {formulas.map((column) => (
        <div key={column.property} className="property">
          <span className="property-icon" title="Formule">
            <Icon name="formula" size={14} />
          </span>
          <span className="property-key">{column.label}</span>
          <div className="property-editor db-readonly" title={column.formula}>
            <ValueView column={column} row={row} formulas={base.model.formulas} />
          </div>
        </div>
      ))}
    </section>
  );
}
