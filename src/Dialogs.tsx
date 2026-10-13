import { useEffect, useRef, useState } from "react";

/** Small modal asking for a page name (the webview has no reliable `prompt()`). */
export interface NameResult {
  name: string;
  folder: string;
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
  onDone,
}: {
  title: string;
  initial: string;
  folders?: string[];
  folder?: string;
  onDone: (result: NameResult | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const [folder, setFolder] = useState(initialFolder);
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
          onDone(value.trim() ? { name: value.trim(), folder } : null);
        }}
      >
        <label>{title}</label>
        <input ref={input} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onDone(null)} />
        {folders && (
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
