import { useEffect, useRef, useState } from "react";
import type { PropertyValue } from "../markdown/frontmatter";
import { Icon, type IconName } from "../Icon";
import { openUrl } from "../reading/web";
import { OPTION_COLORS, type ColumnMeta, type ColumnType, type OptionColor, type SelectOption } from "./baseFile";
import { DatePicker } from "../DatePicker";

export const TYPE_ICONS: Record<ColumnType | "name", IconName> = {
  name: "doc",
  text: "textLines",
  number: "hash",
  select: "chevronDownCircle",
  multi: "list",
  date: "calendar",
  checkbox: "checkbox",
  url: "link",
};

export const COLOR_LABELS: Record<OptionColor, string> = {
  default: "Par défaut",
  gray: "Gris",
  brown: "Marron",
  orange: "Orange",
  yellow: "Jaune",
  green: "Vert",
  blue: "Bleu",
  purple: "Violet",
  pink: "Rose",
  red: "Rouge",
};

/** A colored pill, like Notion's select options. */
export function OptionPill({ option, onRemove }: { option: SelectOption; onRemove?: () => void }) {
  return (
    <span className={`db-pill color-${option.color}`}>
      {option.value}
      {onRemove && (
        <button
          className="db-pill-remove"
          aria-label={`Retirer ${option.value}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

const asList = (value: PropertyValue | undefined): string[] => (Array.isArray(value) ? value.map(String) : value === null || value === undefined || value === "" ? [] : [String(value)]);

function formatDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T12:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** A value as shown in a cell or on a card. */
export function CellDisplay({ type, value, options }: { type: ColumnType; value: PropertyValue | undefined; options: SelectOption[] }) {
  if (type === "checkbox") return <span className={value === true ? "db-check checked" : "db-check"}>{value === true && <Icon name="check" size={12} />}</span>;
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  if (type === "select" || type === "multi") {
    return (
      <span className="db-pills">
        {asList(value).map((v) => (
          <OptionPill key={v} option={options.find((o) => o.value === v) ?? { value: v, color: "default" }} />
        ))}
      </span>
    );
  }
  if (type === "date" && typeof value === "string") return <span>{formatDate(value)}</span>;
  if (type === "url" && typeof value === "string") {
    return (
      <a
        className="db-url"
        href={value}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openUrl(value);
        }}
      >
        {value.replace(/^https?:\/\/(www\.)?/, "")}
      </a>
    );
  }
  if (type === "number") return <span className="db-number">{typeof value === "number" ? value.toLocaleString("fr-FR") : String(value)}</span>;
  return <span>{Array.isArray(value) ? value.join(", ") : String(value)}</span>;
}

/** Text, number, date and URL cells: an input over the cell; Enter or leaving saves, Escape cancels. */
function InputEditor({ type, value, onDone }: { type: ColumnType; value: PropertyValue | undefined; onDone: (value: PropertyValue | undefined | false) => void }) {
  const [text, setText] = useState(value === null || value === undefined ? "" : Array.isArray(value) ? value.join(", ") : String(value));
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const trimmed = text.trim();
    if (trimmed === "") return onDone(undefined);
    if (type === "number") {
      const n = Number(trimmed.replace(",", "."));
      return onDone(Number.isFinite(n) ? n : trimmed);
    }
    onDone(trimmed);
  };
  return (
    <input
      autoFocus
      className="db-input"
      inputMode={type === "number" ? "decimal" : undefined}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          done.current = true;
          onDone(false);
        }
      }}
    />
  );
}

/** Select and multi-select: the options as pills, a search that creates an option, colors. */
function SelectEditor({
  multi,
  value,
  options,
  onChange,
  onOptions,
  onClose,
}: {
  multi: boolean;
  value: PropertyValue | undefined;
  options: SelectOption[];
  onChange: (value: PropertyValue | undefined) => void;
  onOptions: (options: SelectOption[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [colorFor, setColorFor] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const selected = asList(value);
  useEffect(() => {
    const down = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose();
    window.addEventListener("mousedown", down);
    return () => window.removeEventListener("mousedown", down);
  }, [onClose]);

  const set = (list: string[]) => onChange(list.length === 0 ? undefined : multi ? list : list[list.length - 1]);
  const toggle = (v: string) => {
    if (multi) set(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
    else {
      set(selected.includes(v) ? [] : [v]);
      onClose();
    }
  };
  const q = query.trim();
  const shown = options.filter((o) => o.value.toLowerCase().includes(q.toLowerCase()));
  const create = () => {
    if (!q) return;
    if (!options.some((o) => o.value === q)) onOptions([...options, { value: q, color: OPTION_COLORS[1 + (options.length % (OPTION_COLORS.length - 1))] }]);
    toggle(q);
    setQuery("");
  };

  return (
    <div ref={box} className="db-popover db-select" onMouseDown={(e) => e.stopPropagation()}>
      <div className="db-select-current">
        {selected.map((v) => (
          <OptionPill key={v} option={options.find((o) => o.value === v) ?? { value: v, color: "default" }} onRemove={() => set(selected.filter((s) => s !== v))} />
        ))}
        <input
          autoFocus
          value={query}
          placeholder={selected.length ? "" : "Chercher ou créer une option"}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q) {
              // Like Notion: the exact option, else the first one matching, else a new option.
              const exact = options.find((o) => o.value === q);
              if (exact) toggle(exact.value);
              else if (shown.length > 0) toggle(shown[0].value);
              else create();
              setQuery("");
            }
            if (e.key === "Escape") onClose();
            if (e.key === "Backspace" && !query && selected.length) set(selected.slice(0, -1));
          }}
        />
      </div>
      <div className="db-select-list">
        <small>{q ? "Choisir ou créer" : "Choisir une option"}</small>
        {shown.map((o) => (
          <div key={o.value} className="db-select-row">
            <button className="db-select-option" onClick={() => toggle(o.value)}>
              <OptionPill option={o} />
              {selected.includes(o.value) && <Icon name="check" size={12} />}
            </button>
            <button className="db-icon-button" aria-label="Couleur" title="Couleur, supprimer" onClick={() => setColorFor(colorFor === o.value ? null : o.value)}>
              <Icon name="more" size={14} />
            </button>
            {colorFor === o.value && (
              <div className="db-colors">
                {OPTION_COLORS.map((c) => (
                  <button key={c} className={o.color === c ? "selected" : undefined} onClick={() => onOptions(options.map((x) => (x.value === o.value ? { ...x, color: c } : x)))}>
                    <span className={`db-swatch color-${c}`} /> {COLOR_LABELS[c]}
                  </button>
                ))}
                <button className="danger" onClick={() => onOptions(options.filter((x) => x.value !== o.value))}>
                  <Icon name="trash" size={12} /> Supprimer l'option
                </button>
              </div>
            )}
          </div>
        ))}
        {q && !options.some((o) => o.value === q) && (
          <button className="db-select-option" onClick={create}>
            Créer <OptionPill option={{ value: q, color: OPTION_COLORS[1 + (options.length % (OPTION_COLORS.length - 1))] }} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A cell: its value, edited in place on click (checkboxes toggle at once).
 * `onChange(undefined)` removes the property from the note.
 */
export function Cell({
  meta,
  options,
  value,
  editable,
  onChange,
  onOptions,
}: {
  meta: ColumnMeta;
  options: SelectOption[];
  value: PropertyValue | undefined;
  editable: boolean;
  onChange: (value: PropertyValue | undefined) => void;
  onOptions: (options: SelectOption[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  /** Back to the table cell after editing, for the keyboard. */
  const done = () => {
    setEditing(false);
    box.current?.closest("td")?.focus();
  };
  const type = meta.type;
  if (type === "checkbox") {
    return (
      <button className="db-cell db-cell-check" disabled={!editable} onClick={() => onChange(value === true ? false : true)}>
        <CellDisplay type={type} value={value} options={options} />
      </button>
    );
  }
  return (
    <div ref={box} className={editing ? "db-cell editing" : "db-cell"} onClick={() => editable && !editing && setEditing(true)}>
      {!editing || type === "select" || type === "multi" || type === "date" ? <CellDisplay type={type} value={value} options={options} /> : null}
      {editing && type === "date" && box.current && (
        <DatePicker
          value={typeof value === "string" ? value : null}
          withTime={typeof value === "string" && /[T ]\d{2}:\d{2}/.test(value)}
          anchor={box.current.getBoundingClientRect()}
          onChange={(next) => next !== value && onChange(next ?? undefined)}
          onClose={done}
        />
      )}
      {editing && (type === "select" || type === "multi") && (
        <SelectEditor multi={type === "multi"} value={value} options={options} onChange={onChange} onOptions={onOptions} onClose={done} />
      )}
      {editing && type !== "select" && type !== "multi" && type !== "date" && (
        <InputEditor
          type={type}
          value={value}
          onDone={(next) => {
            done();
            if (next !== false && next !== value) onChange(next);
          }}
        />
      )}
    </div>
  );
}
