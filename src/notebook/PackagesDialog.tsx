import { useEffect, useState } from "react";
import { readDependencies } from "./deps";

/**
 * Python packages of a notebook: the vault's (pyproject.toml at its root,
 * shared by every notebook) and the notebook's own (its front matter).
 */
export function PackagesDialog({
  vaultDeps,
  notebookDeps,
  onAdd,
  onRemoveNotebookDep,
  onClose,
}: {
  vaultDeps: Promise<string[]>;
  notebookDeps: string[];
  /** Resolves to an error message, or null when added. */
  onAdd: (requirement: string, target: "vault" | "notebook") => Promise<string | null>;
  onRemoveNotebookDep: (requirement: string) => void;
  onClose: () => void;
}) {
  const [vault, setVault] = useState<string[] | null>(null);
  const [requirement, setRequirement] = useState("");
  const [target, setTarget] = useState<"vault" | "notebook">("notebook");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void vaultDeps.then(setVault, () => setVault([]));
  }, [vaultDeps]);

  const add = async () => {
    const value = requirement.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    const failure = await onAdd(value, target);
    setBusy(false);
    if (failure) setError(failure);
    else {
      setRequirement("");
      if (target === "vault") setVault((v) => [...(v ?? []), value]);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="modal packages-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <strong>Paquets Python</strong>
          <button onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        <form
          className="packages-add"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input autoFocus placeholder="Nom du paquet, ex. plotly ou pandas>=2" value={requirement} onChange={(e) => setRequirement(e.target.value)} spellCheck={false} disabled={busy} />
          <div className="segmented" role="radiogroup" aria-label="Ajouter à">
            <button type="button" role="radio" aria-checked={target === "notebook"} className={target === "notebook" ? "selected" : ""} onClick={() => setTarget("notebook")}>
              Ce notebook
            </button>
            <button type="button" role="radio" aria-checked={target === "vault"} className={target === "vault" ? "selected" : ""} onClick={() => setTarget("vault")}>
              Tout le vault
            </button>
          </div>
          <button type="submit" className="primary" disabled={busy || !requirement.trim()}>
            {busy ? (
              <>
                <span className="spinner" aria-hidden="true" /> Installation…
              </>
            ) : (
              "Ajouter"
            )}
          </button>
        </form>
        <small className="packages-hint">
          {target === "notebook"
            ? "Écrit dans le notebook (comme marimo) : installé automatiquement à son lancement, aussi dans marimo."
            : "Ajouté au pyproject.toml du vault avec uv : disponible dans tous les notebooks."}
        </small>
        {error && <p className="git-feedback error">{error}</p>}
        <section className="packages-list">
          <h3>Ce notebook</h3>
          {notebookDeps.length === 0 ? (
            <p className="git-none">Aucun paquet propre à ce notebook.</p>
          ) : (
            <ul>
              {notebookDeps.map((dep) => (
                <li key={dep}>
                  <code>{dep}</code>
                  <button className="package-remove" onClick={() => onRemoveNotebookDep(dep)} aria-label={`Retirer ${dep}`} title="Retirer">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <h3>Tout le vault</h3>
          {vault === null ? (
            <p className="git-none">Lecture…</p>
          ) : vault.length === 0 ? (
            <p className="git-none">Aucun (environnement pas encore créé).</p>
          ) : (
            <ul>
              {vault.map((dep) => (
                <li key={dep}>
                  <code>{dep}</code>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Dependencies listed in the vault's pyproject.toml. */
export const vaultDependencies = (pyprojectToml: string) => readDependencies(pyprojectToml);
