import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { DateField } from "../DatePicker";
import { usePersistentFlag } from "../hooks/usePersistentFlag";
import { readProperties, renameProperty, setProperty, type Property, type PropertySuggestion, type PropertyType, type PropertyValue } from "../markdown/frontmatter";

const TYPE_ICONS: Record<PropertyType, IconName> = {
  text: "textLines",
  list: "list",
  number: "hash",
  checkbox: "checkbox",
  date: "calendar",
  datetime: "clock",
  other: "code",
};

interface Props {
  /** Frontmatter as stored in the file ("---\n…\n---"), or null. */
  raw: string | null;
  readOnly?: boolean;
  onChange: (raw: string | null) => void;
  /** Keys not listed (managed by the app). */
  hidden?: string[];
  /** The properties used in the vault, offered when adding one. */
  suggestKeys?: () => Promise<PropertySuggestion[]>;
}

/** A first value matching the type the property has elsewhere in the vault. */
const EMPTY_VALUES: Partial<Record<PropertyType, PropertyValue>> = { list: [], checkbox: false };

/**
 * The name of a new property, typed or chosen among those of the vault
 * (filtered as you type, with their type), as Obsidian offers them.
 */
function NewProperty({ taken, suggestKeys, onAdd, onCancel }: { taken: string[]; suggestKeys?: () => Promise<PropertySuggestion[]>; onAdd: (key: string, type: PropertyType) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState("");
  const [known, setKnown] = useState<PropertySuggestion[]>([]);
  /** The suggestion picked with the arrows; none at first, so that Enter keeps a new name as typed. */
  const [active, setActive] = useState(-1);
  useEffect(() => {
    let live = true;
    suggestKeys?.().then((keys) => live && setKnown(keys), () => {});
    return () => {
      live = false;
    };
  }, [suggestKeys]);
  const query = draft.trim().toLowerCase();
  const offered = known.filter((k) => !taken.includes(k.key) && k.key.toLowerCase().includes(query)).slice(0, 8);
  const choose = (key: string) => {
    const name = key.trim();
    if (!name) return onCancel();
    onAdd(name, known.find((k) => k.key === name)?.type ?? "text");
  };
  return (
    <div className="property property-new">
      <span className="property-icon">
        <Icon name="plus" size={14} />
      </span>
      <div className="property-new-field">
        <input
          className="property-key"
          autoFocus
          value={draft}
          placeholder="Nom de la propriété"
          spellCheck={false}
          role="combobox"
          aria-expanded={offered.length > 0}
          onChange={(e) => {
            setDraft(e.target.value);
            setActive(-1);
          }}
          onBlur={() => choose(draft)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (offered.length) setActive(e.key === "ArrowDown" ? (active + 1) % offered.length : active <= 0 ? offered.length - 1 : active - 1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(offered[active]?.key ?? draft);
            } else if (e.key === "Escape") onCancel();
          }}
        />
        {offered.length > 0 && (
          <div className="property-suggest" role="listbox" onMouseDown={(e) => e.preventDefault()}>
            {offered.map((k, i) => (
              <button key={k.key} role="option" aria-selected={i === active} className={i === active ? "active" : ""} onMouseEnter={() => setActive(i)} onClick={() => choose(k.key)}>
                <Icon name={TYPE_ICONS[k.type]} size={13} />
                <span>{k.key}</span>
                <small>{k.count}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Text field committing on Enter or when leaving it. */
function CommitInput({ value, onCommit, type = "text", placeholder, className }: { value: string; onCommit: (v: string) => void; type?: string; placeholder?: string; className?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={className}
      type={type}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

/**
 * A text value on as many lines as it needs (a long title is not cut), still
 * one line in the YAML: Enter commits, pasted line breaks become spaces.
 */
function TextValue({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setDraft(value), [value]);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  return (
    <textarea
      ref={area}
      className="property-value property-text"
      rows={1}
      value={draft}
      placeholder="Vide"
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value.replace(/\s*\n\s*/g, " "))}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

function ListEditor({ values, isTags, onChange }: { values: string[]; isTags: boolean; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const items = draft
      .split(",")
      .map((v) => v.trim().replace(isTags ? /^#/ : /^$/, ""))
      .filter(Boolean);
    if (items.length) onChange([...values, ...items]);
    setDraft("");
  };
  return (
    <div className="property-chips">
      {values.map((v, i) => (
        <span key={`${v}-${i}`} className={isTags ? "chip tag-chip" : "chip"}>
          {isTags ? `#${v}` : v}
          <button aria-label={`Retirer ${v}`} onClick={() => onChange(values.filter((_, j) => j !== i))}>
            <Icon name="close" size={10} />
          </button>
        </span>
      ))}
      <input
        className="chip-input"
        value={draft}
        placeholder={values.length ? "" : isTags ? "Ajouter un tag" : "Ajouter"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
          if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
        }}
      />
    </div>
  );
}

function ValueEditor({ property, onChange }: { property: Property; onChange: (v: PropertyValue) => void }) {
  const { type, value, key } = property;
  switch (type) {
    case "checkbox":
      return <input type="checkbox" className="property-checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
    case "number":
      return <CommitInput className="property-value" type="number" value={String(value ?? "")} onCommit={(v) => onChange(v === "" ? null : Number(v))} />;
    case "date":
      return <DateField className="property-value" value={value ? String(value) : null} onChange={onChange} />;
    case "datetime": {
      // The separator already written (Obsidian writes "T") is kept.
      const separator = / \d{2}:\d{2}/.test(String(value ?? "")) ? " " : "T";
      return <DateField className="property-value" withTime value={value ? String(value) : null} onChange={(v) => onChange(v && v.replace("T", separator))} />;
    }
    case "list":
      return <ListEditor values={(value as string[]) ?? []} isTags={key === "tags" || key === "tag"} onChange={onChange} />;
    case "other":
      return <span className="property-value readonly">{String(value)}</span>;
    default:
      return <TextValue value={String(value ?? "")} onCommit={(v) => onChange(v === "" ? null : v)} />;
  }
}

/** Obsidian-style properties of the note (YAML frontmatter), editable in place. */
export function PropertiesPanel({ raw, readOnly, onChange, hidden = [], suggestKeys }: Props) {
  /** The name of a new property being typed. */
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  /** The properties folded away, for every note (the eye of the panel). */
  const [shown, setShown] = usePersistentFlag("flownote:properties", true, ["shown", "hidden"]);
  const [rawDraft, setRawDraft] = useState<string | null>(null);
  const all = readProperties(raw);
  // Keys managed elsewhere (a notebook's marimo-version and pyproject) are not listed.
  const parsed = { ...all, properties: all.properties.filter((p) => !hidden.includes(p.key)) };

  const apply = (update: () => string | null) => {
    try {
      setError("");
      onChange(update());
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  if (parsed.error) {
    // Invalid YAML is never rewritten: it can only be edited as text.
    const text = rawDraft ?? raw ?? "";
    return (
      <section className="properties">
        <p className="git-feedback error">YAML invalide : {parsed.error}</p>
        <textarea className="properties-raw" value={text} rows={Math.min(12, text.split("\n").length + 1)} readOnly={readOnly} onChange={(e) => setRawDraft(e.target.value)} />
        {!readOnly && rawDraft !== null && (
          <button
            onClick={() => {
              onChange(rawDraft);
              setRawDraft(null);
            }}
          >
            Appliquer
          </button>
        )}
      </section>
    );
  }

  if (parsed.properties.length === 0 && !adding) {
    // A page whose front matter the app manages (base row, ticket) has no empty panel; the icon is not one of those keys.
    if (readOnly || hidden.some((key) => key !== "icon")) return null;
    return (
      <div className="properties properties-empty">
        <button className="property-add" onClick={() => setAdding(true)}>
          <Icon name="plus" size={13} /> Ajouter des propriétés
        </button>
      </div>
    );
  }

  const count = parsed.properties.length;
  if (!shown && count > 0) {
    return (
      <div className="properties properties-empty properties-folded">
        <button className="property-add properties-hide" onClick={() => setShown(true)} aria-label="Afficher les propriétés" title="Afficher les propriétés">
          <Icon name="eyeOff" size={14} />
        </button>
      </div>
    );
  }

  return (
    <section className="properties" aria-label="Propriétés">
      {parsed.properties.map((property) => (
        <div key={property.key} className="property">
          <span className="property-icon" title={property.type}>
            <Icon name={TYPE_ICONS[property.type]} size={14} />
          </span>
          {readOnly ? (
            <span className="property-key">{property.key}</span>
          ) : (
            <CommitInput className="property-key" value={property.key} onCommit={(next) => next.trim() && apply(() => renameProperty(raw!, property.key, next.trim()))} />
          )}
          <div className={readOnly ? "property-editor readonly" : "property-editor"}>
            <ValueEditor property={property} onChange={(value) => apply(() => setProperty(raw, property.key, value))} />
          </div>
          {!readOnly && (
            <button className="property-remove" aria-label={`Supprimer ${property.key}`} title="Supprimer la propriété" onClick={() => apply(() => setProperty(raw, property.key, undefined))}>
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      ))}
      {adding && (
        <NewProperty
          taken={all.properties.map((p) => p.key)}
          suggestKeys={suggestKeys}
          onCancel={() => setAdding(false)}
          onAdd={(key, type) => {
            setAdding(false);
            apply(() => setProperty(raw, key, EMPTY_VALUES[type] ?? null));
          }}
        />
      )}
      <div className="properties-footer">
        {!readOnly && !adding && (
          <button className="property-add" onClick={() => setAdding(true)}>
            <Icon name="plus" size={13} /> Ajouter une propriété
          </button>
        )}
        <button className="property-add properties-hide" onClick={() => setShown(false)} aria-label="Masquer les propriétés" title="Masquer les propriétés">
          <Icon name="eye" size={14} />
        </button>
      </div>
      {error && <p className="git-feedback error">{error}</p>}
    </section>
  );
}
