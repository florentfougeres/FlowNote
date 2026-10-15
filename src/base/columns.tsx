import type { PropertyValue } from "../markdown/frontmatter";
import { NAME, type BaseModel, type ColumnMeta, type ColumnType, type SelectOption } from "./baseFile";
import { CellDisplay } from "./cells";
import { display, type FValue } from "./formula";
import { cellValue, columnMeta, FILE_PROPERTIES, optionsOf, type BaseRow } from "./rows";

/** A column of a base: a note property (editable), a file property or a formula (read only). */
export interface ColumnInfo {
  property: string;
  label: string;
  kind: "name" | "note" | "file" | "formula";
  meta: ColumnMeta;
  options: SelectOption[];
  /** The formula's expression, for formula columns. */
  formula?: string;
}

const FILE_TYPES: Record<string, ColumnType> = { "file.ctime": "date", "file.mtime": "date", "file.folder": "text", "file.tags": "multi", "file.links": "number" };

export function columnInfo(model: BaseModel, property: string, rows: BaseRow[]): ColumnInfo {
  if (property === NAME) return { property, label: "Nom", kind: "name", meta: { type: "text", options: [] }, options: [] };
  if (property.startsWith("file.")) {
    const label = FILE_PROPERTIES.find(([p]) => p === property)?.[1] ?? property;
    const type = FILE_TYPES[property] ?? "text";
    return { property, label: model.displayNames[property] ?? label, kind: "file", meta: { type, options: [] }, options: [] };
  }
  if (property.startsWith("formula.")) {
    const name = property.slice(8);
    return { property, label: model.displayNames[property] ?? name, kind: "formula", meta: { type: "text", options: [] }, options: [], formula: model.formulas[name] ?? "" };
  }
  const meta = columnMeta(model, property, rows);
  return { property, label: model.displayNames[property] ?? property, kind: "note", meta, options: meta.type === "select" || meta.type === "multi" ? optionsOf(meta, property, rows) : [] };
}

/** Whether a card shows this column for the row (an unchecked box is a value). */
export function hasValue(column: ColumnInfo, row: BaseRow, formulas: Record<string, string>): boolean {
  if (column.meta.type === "checkbox" && column.kind === "note") return true;
  const v = cellValue(row, column.property, formulas);
  return !(v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0));
}

const isObject = (v: unknown): v is { kind: string } => typeof v === "object" && v !== null && !Array.isArray(v) && "kind" in v;

/** A value of any column, read only (cards, gallery, formulas, file properties). */
export function ValueView({ column, row, formulas }: { column: ColumnInfo; row: BaseRow; formulas: Record<string, string> }) {
  const value = cellValue(row, column.property, formulas);
  if (value instanceof Error) {
    return (
      <span className="db-formula-error" title={value.message}>
        Erreur
      </span>
    );
  }
  if (column.kind === "formula") {
    if (typeof value === "boolean") return <CellDisplay type="checkbox" value={value} options={[]} />;
    if (typeof value === "number") return <span className="db-number">{display(value)}</span>;
    if (Array.isArray(value) && value.every((v) => typeof v === "string")) return <CellDisplay type="multi" value={value as string[]} options={[]} />;
    return <span>{display((isObject(value) ? value : value) as FValue)}</span>;
  }
  return <CellDisplay type={column.meta.type} value={value as PropertyValue | undefined} options={column.options} />;
}
