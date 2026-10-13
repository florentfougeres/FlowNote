export interface Settings {
  autosave: boolean;
}

const KEY = "mon-notion:autosave";

export function loadSettings(): Settings {
  try {
    return { autosave: localStorage.getItem(KEY) !== "false" };
  } catch {
    return { autosave: true };
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, String(settings.autosave));
  } catch {
    // Settings simply won't persist.
  }
}

export function SettingsDialog({ settings, vaultName, onChange, onChangeVault, onClose }: { settings: Settings; vaultName: string; onChange: (s: Settings) => void; onChangeVault: () => void; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <strong>Réglages</strong>
          <button autoFocus onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        <label className="setting">
          <input type="checkbox" checked={settings.autosave} onChange={(e) => onChange({ ...settings, autosave: e.target.checked })} />
          <span>
            Enregistrement automatique
            <small>Sinon, enregistrez avec ⌘S. Les modifications en attente sont enregistrées avant de changer de page.</small>
          </span>
        </label>
        <div className="setting">
          <span>
            Vault ouvert : <strong>{vaultName}</strong>
          </span>
          <button onClick={onChangeVault}>Changer de vault…</button>
        </div>
      </div>
    </div>
  );
}
