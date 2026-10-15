import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { addProperty, readProperties, renameProperty, setProperty, type Property, type PropertyType, type PropertyValue } from "../markdown/frontmatter";

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
      return <CommitInput className="property-value" type="date" value={String(value ?? "")} onCommit={(v) => onChange(v || null)} />;
    case "datetime":
      return <CommitInput className="property-value" type="datetime-local" value={String(value ?? "").replace(" ", "T")} onCommit={(v) => onChange(v || null)} />;
    case "list":
      return <ListEditor values={(value as string[]) ?? []} isTags={key === "tags" || key === "tag"} onChange={onChange} />;
    case "other":
      return <span className="property-value readonly">{String(value)}</span>;
    default:
      return <CommitInput className="property-value" value={String(value ?? "")} placeholder="Vide" onCommit={(v) => onChange(v === "" ? null : v)} />;
  }
}

/** Obsidian-style properties of the note (YAML frontmatter), editable in place. */
export function PropertiesPanel({ raw, readOnly, onChange, hidden = [] }: Props) {
  const [error, setError] = useState("");
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

  if (parsed.properties.length === 0) {
    // A page whose front matter the app manages (base row, ticket) has no empty panel; the icon is not one of those keys.
    if (readOnly || hidden.some((key) => key !== "icon")) return null;
    return (
      <div className="properties properties-empty">
        <button className="property-add" onClick={() => apply(() => addProperty(raw, "tags").raw)}>
          <Icon name="plus" size={13} /> Ajouter des propriétés
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
          <div className="property-editor" style={readOnly ? { pointerEvents: "none", opacity: 0.7 } : undefined}>
            <ValueEditor property={property} onChange={(value) => apply(() => setProperty(raw, property.key, value))} />
          </div>
          {!readOnly && (
            <button className="property-remove" aria-label={`Supprimer ${property.key}`} title="Supprimer la propriété" onClick={() => apply(() => setProperty(raw, property.key, undefined))}>
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button className="property-add" onClick={() => apply(() => addProperty(raw).raw)}>
          <Icon name="plus" size={13} /> Ajouter une propriété
        </button>
      )}
      {error && <p className="git-feedback error">{error}</p>}
    </section>
  );
}
