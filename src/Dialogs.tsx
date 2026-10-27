import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon, type IconName } from "./Icon";
import { NEW_PAGE_KINDS as PAGE_KINDS, kindIconClass, type PageKind } from "./pageKinds";

export type { PageKind };

export interface NameResult {
  name: string;
  folder: string;
  kind: PageKind;
  /** A note started from this template (its path), when one was chosen. */
  template?: string;
}

/** Number of columns of the page-type grid (arrow keys move through it). */
const KIND_COLUMNS = 3;

const folderLabel = (folder: string) => (folder === "" ? "Racine du vault" : folder.split("/").join(" › "));

/**
 * Small modal asking for a page name (the webview has no reliable `prompt()`)
 * and, for a new page, its type and the folder to create it in ("" is the
 * vault root).
 */
export function NameDialog({
  title,
  initial,
  folders,
  folder: initialFolder = "",
  kinds = false,
  initialKind = "note",
  templates = [],
  onDone,
}: {
  title: string;
  initial: string;
  folders?: string[];
  folder?: string;
  /** Offer the page types. */
  kinds?: boolean;
  initialKind?: PageKind;
  /** The templates a new note can start from (Obsidian's templates folder). */
  templates?: TemplateChoice[];
  onDone: (result: NameResult | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const [folder, setFolder] = useState(initialFolder);
  const [kind, setKind] = useState<PageKind>(initialKind);
  const [template, setTemplate] = useState("");
  /** What the dialog gives back, a template only for a note. */
  const result = (k: PageKind): NameResult => ({ name: value.trim(), folder, kind: k, ...(k === "note" && template ? { template } : {}) });
  const input = useRef<HTMLInputElement>(null);
  const kindButtons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const current = PAGE_KINDS.find((k) => k.kind === kind) ?? PAGE_KINDS[0];

  const moveKind = (e: KeyboardEvent, index: number) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: KIND_COLUMNS, ArrowUp: -KIND_COLUMNS }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = (index + step + PAGE_KINDS.length) % PAGE_KINDS.length;
    setKind(PAGE_KINDS[next].kind);
    kindButtons.current[next]?.focus();
  };

  return (
    <div className="modal-backdrop" onMouseDown={() => onDone(null)}>
      <form
        className={kinds ? "modal name-dialog with-kinds" : "modal name-dialog"}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onDone(null)}
        onSubmit={(e) => {
          e.preventDefault();
          onDone(value.trim() ? result(kind) : null);
        }}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="name-dialog-close" aria-label="Fermer" onClick={() => onDone(null)}>
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="name-dialog-field">
          {kinds && (
            <span className={kindIconClass(kind)} aria-hidden="true">
              <Icon name={current.icon} size={16} />
            </span>
          )}
          <input ref={input} value={value} placeholder="Sans titre" aria-label="Nom" onChange={(e) => setValue(e.target.value)} />
        </div>

        {kinds && (
          <div className="name-dialog-kinds" role="radiogroup" aria-label="Type de page">
            {PAGE_KINDS.map((k, i) => (
              <button
                key={k.kind}
                ref={(el) => {
                  kindButtons.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={kind === k.kind}
                tabIndex={kind === k.kind ? 0 : -1}
                className={kind === k.kind ? "selected" : ""}
                onClick={() => setKind(k.kind)}
                onDoubleClick={() => value.trim() && onDone(result(k.kind))}
                onKeyDown={(e) => moveKind(e, i)}
              >
                <span className={kindIconClass(k.kind)}>
                  <Icon name={k.icon} size={16} />
                </span>
                <span>
                  <strong>{k.label}</strong>
                  <small>{k.description}</small>
                </span>
              </button>
            ))}
          </div>
        )}

        {folders && kind !== "task" && <FolderPicker folders={folders} folder={folder} onChange={setFolder} />}
        {kinds && kind === "note" && templates.length > 0 && <TemplatePicker templates={templates} template={template} onChange={setTemplate} />}
        {kinds && kind === "task" && (
          <p className="name-dialog-note">
            <Icon name="info" size={13} /> Rangée dans le dossier des tâches, au format de TaskNotes.
          </p>
        )}

        <footer className="name-dialog-footer">
          <span className="name-dialog-hint">
            <kbd>↵</kbd> {kinds ? "créer" : "valider"} <kbd>esc</kbd> fermer
          </span>
          <div className="modal-actions">
            <button type="button" onClick={() => onDone(null)}>
              Annuler
            </button>
            <button type="submit" className="primary" disabled={!value.trim()}>
              {kinds ? "Créer" : "Valider"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

/** A choice of a picker: its value, the label shown, and its indent in the list (folders). */
interface PickerOption {
  value: string;
  label: string;
  /** Label while filtering (the full path of a folder), the label otherwise. */
  filterLabel?: string;
  icon: IconName;
  depth?: number;
}

/** The options matching a filter, with the arrows and ↵ to choose one. */
function PickerList({
  options,
  selected,
  placeholder,
  empty,
  onChoose,
  onEscape,
}: {
  options: PickerOption[];
  selected: string | null;
  placeholder: string;
  empty: string;
  onChoose: (value: string) => void;
  onEscape: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === selected)));
  const list = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("fr");
    return q ? options.filter((o) => (o.filterLabel ?? o.label).toLocaleLowerCase("fr").includes(q)) : options;
  }, [options, query]);
  useEffect(() => {
    list.current?.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (matches.length ? (a + step + matches.length) % matches.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[active] !== undefined) onChoose(matches[active].value);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      onEscape();
    }
  };
  return (
    <>
      <input
        autoFocus
        className="name-dialog-folder-filter"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKey}
      />
      <div className="db-menu name-dialog-folder-list" role="listbox" ref={list}>
        {matches.length === 0 && <p className="name-dialog-folder-empty">{empty}</p>}
        {matches.map((o, i) => (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={o.value === selected}
            className={i === active ? "active" : ""}
            style={query || !o.depth ? undefined : { paddingLeft: 8 + o.depth * 14 }}
            onMouseEnter={() => setActive(i)}
            onClick={() => onChoose(o.value)}
          >
            <Icon name={o.icon} size={14} />
            <span className="name-dialog-folder-name">{query ? (o.filterLabel ?? o.label) : o.label}</span>
            {o.value === selected && <Icon name="check" size={13} />}
          </button>
        ))}
      </div>
    </>
  );
}

/** A labelled choice of the new page dialog, as a menu with a filter (no raw `<select>`): its folder, its template. */
function MenuPicker({
  label,
  options,
  value,
  placeholder,
  empty,
  onChange,
}: {
  label: string;
  options: PickerOption[];
  value: string;
  placeholder: string;
  empty: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <div className="name-dialog-folder" ref={root}>
      <span className="name-dialog-folder-label">{label}</span>
      <button type="button" className="name-dialog-folder-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={current.icon} size={14} />
        <span>{current.filterLabel ?? current.label}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <div className="db-popover name-dialog-folder-menu">
          <PickerList
            options={options}
            selected={value}
            placeholder={placeholder}
            empty={empty}
            onChoose={(v) => {
              onChange(v);
              setOpen(false);
            }}
            onEscape={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

/** The folder of a new page. */
function FolderPicker({ folders, folder, onChange }: { folders: string[]; folder: string; onChange: (folder: string) => void }) {
  const options = useMemo(
    () =>
      folders.map((f): PickerOption => ({
        value: f,
        label: f === "" ? "Racine du vault" : f.slice(f.lastIndexOf("/") + 1),
        filterLabel: folderLabel(f),
        icon: f === "" ? "home" : "folder",
        depth: f === "" ? 0 : f.split("/").length - 1,
      })),
    [folders],
  );
  return <MenuPicker label="Dans" options={options} value={folder} placeholder="Chercher un dossier…" empty="Aucun dossier" onChange={onChange} />;
}

/** The template of a new note: none, or a note of the templates folder. */
function TemplatePicker({ templates, template, onChange }: { templates: TemplateChoice[]; template: string; onChange: (template: string) => void }) {
  const options = useMemo(() => [{ value: "", label: "Aucun", icon: "doc" as IconName }, ...templates.map((t): PickerOption => ({ value: t.path, label: t.name, icon: "copy" }))], [templates]);
  return <MenuPicker label="Modèle" options={options} value={template} placeholder="Chercher un modèle…" empty="Aucun modèle" onChange={onChange} />;
}

/** A template offered in the menus: its file and its name. */
export interface TemplateChoice {
  path: string;
  name: string;
}

/** `/modèle`: the template to insert in the note, chosen in a list. */
export function TemplateDialog({ templates, onDone }: { templates: TemplateChoice[]; onDone: (path: string | null) => void }) {
  const options = useMemo(() => templates.map((t): PickerOption => ({ value: t.path, label: t.name, icon: "copy" })), [templates]);
  return (
    <div className="modal-backdrop" onMouseDown={() => onDone(null)}>
      <div className="modal name-dialog template-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Insérer un modèle</h2>
          <button type="button" className="name-dialog-close" aria-label="Fermer" onClick={() => onDone(null)}>
            <Icon name="close" size={14} />
          </button>
        </header>
        <PickerList options={options} selected={null} placeholder="Chercher un modèle…" empty="Aucun modèle" onChoose={onDone} onEscape={() => onDone(null)} />
      </div>
    </div>
  );
}

/** Confirmation modal (the webview has no reliable `confirm()`). */
export function ConfirmDialog({ message, confirmLabel, onDone }: { message: string; confirmLabel: string; onDone: (confirmed: boolean) => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={() => onDone(false)}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && onDone(false)}>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          <button autoFocus onClick={() => onDone(false)}>
            Annuler
          </button>
          <button className="danger" onClick={() => onDone(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
