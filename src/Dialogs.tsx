import { useEffect, useRef, useState } from "react";

/** Small modal asking for a page name (the webview has no reliable `prompt()`). */
export function NameDialog({ title, initial, onDone }: { title: string; initial: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(initial);
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
          onDone(value.trim() || null);
        }}
      >
        <label>{title}</label>
        <input ref={input} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onDone(null)} />
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
