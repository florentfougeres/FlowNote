import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/** Small modal asking for a page name (the webview has no reliable `prompt()`). */
export type PageKind = "note" | "drawing" | "ticket";

export interface NameResult {
  name: string;
  folder: string;
  kind: PageKind;
}

/**
 * Asks for a page name and, when `folders` is given, the folder to create it
 * in ("" is the vault root).
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
  /** Offer to create a note or a drawing. */
  kinds?: boolean;
  initialKind?: PageKind;
  onDone: (result: NameResult | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const [folder, setFolder] = useState(initialFolder);
  const [kind, setKind] = useState<PageKind>(initialKind);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={() => onDone(null)}>
      <form
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onDone(value.trim() ? { name: value.trim(), folder, kind } : null);
        }}
      >
        <label>{title}</label>
        {kinds && (
          <div className="segmented kind-choice" role="radiogroup" aria-label="Type de page">
            {(
              [
                ["note", "Note", "doc"],
                ["drawing", "Dessin", "drawing"],
                ["ticket", "Ticket", "ticket"],
              ] as const
            ).map(([value, label, icon]) => (
              <button key={value} type="button" role="radio" aria-checked={kind === value} className={kind === value ? "selected" : ""} onClick={() => setKind(value)}>
                <Icon name={icon} size={14} /> {label}
              </button>
            ))}
          </div>
        )}
        <input ref={input} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onDone(null)} />
        {folders && kind !== "ticket" && (
          <label className="folder-field">
            <span>Dossier</span>
            <select value={folder} onChange={(e) => setFolder(e.target.value)}>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f === "" ? "Racine du vault" : f.split("/").join(" › ")}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="modal-actions">
          <button type="button" onClick={() => onDone(null)}>
            Annuler
          </button>
          <button type="submit">Créer</button>
        </div>
      </form>
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
