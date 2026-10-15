import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./Icon";
import { PAGE_KINDS, kindIconClass, type PageKind } from "./pageKinds";

export type { PageKind };

export interface NameResult {
  name: string;
  folder: string;
  kind: PageKind;
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
  onDone,
}: {
  title: string;
  initial: string;
  folders?: string[];
  folder?: string;
  /** Offer the page types. */
  kinds?: boolean;
  initialKind?: PageKind;
  onDone: (result: NameResult | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const [folder, setFolder] = useState(initialFolder);
  const [kind, setKind] = useState<PageKind>(initialKind);
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
          onDone(value.trim() ? { name: value.trim(), folder, kind } : null);
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
                onDoubleClick={() => value.trim() && onDone({ name: value.trim(), folder, kind: k.kind })}
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

        {folders && kind !== "ticket" && <FolderPicker folders={folders} folder={folder} onChange={setFolder} />}
        {kinds && kind === "ticket" && (
          <p className="name-dialog-note">
            <Icon name="info" size={13} /> Numéroté automatiquement et rangé dans le dossier des tickets.
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

/** The folder of a new page, as a menu with a filter (no raw `<select>`). */
function FolderPicker({ folders, folder, onChange }: { folders: string[]; folder: string; onChange: (folder: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("fr");
    return q ? folders.filter((f) => folderLabel(f).toLocaleLowerCase("fr").includes(q)) : folders;
  }, [folders, query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => {
    list.current?.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const toggle = () => {
    setQuery("");
    setActive(Math.max(0, folders.indexOf(folder)));
    setOpen(!open);
  };
  const choose = (f: string) => {
    onChange(f);
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (matches.length ? (a + step + matches.length) % matches.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[active] !== undefined) choose(matches[active]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="name-dialog-folder" ref={root}>
      <span className="name-dialog-folder-label">Dans</span>
      <button type="button" className="name-dialog-folder-button" aria-haspopup="listbox" aria-expanded={open} onClick={toggle}>
        <Icon name={folder === "" ? "home" : "folder"} size={14} />
        <span>{folderLabel(folder)}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <div className="db-popover name-dialog-folder-menu">
          <input
            autoFocus
            className="name-dialog-folder-filter"
            placeholder="Chercher un dossier…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
          />
          <div className="db-menu name-dialog-folder-list" role="listbox" ref={list}>
            {matches.length === 0 && <p className="name-dialog-folder-empty">Aucun dossier</p>}
            {matches.map((f, i) => {
              const depth = f === "" ? 0 : f.split("/").length;
              const name = f === "" ? "Racine du vault" : f.slice(f.lastIndexOf("/") + 1);
              return (
                <button
                  key={f}
                  type="button"
                  role="option"
                  aria-selected={f === folder}
                  className={i === active ? "active" : ""}
                  style={query ? undefined : { paddingLeft: 8 + Math.max(0, depth - 1) * 14 }}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(f)}
                >
                  <Icon name={f === "" ? "home" : "folder"} size={14} />
                  <span className="name-dialog-folder-name">{query ? folderLabel(f) : name}</span>
                  {f === folder && <Icon name="check" size={13} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
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
