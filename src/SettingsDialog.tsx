export type Theme = "system" | "light" | "dark";

export interface Settings {
  autosave: boolean;
  theme: Theme;
}

const AUTOSAVE_KEY = "flownote:autosave";
const THEME_KEY = "flownote:theme";

export function loadSettings(): Settings {
  try {
    const theme = localStorage.getItem(THEME_KEY);
    return {
      autosave: localStorage.getItem(AUTOSAVE_KEY) !== "false",
      theme: theme === "light" || theme === "dark" ? theme : "system",
    };
  } catch {
    return { autosave: true, theme: "system" };
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, String(settings.autosave));
    localStorage.setItem(THEME_KEY, settings.theme);
  } catch {
    // Settings simply won't persist.
  }
}

/** "system" follows macOS; otherwise the chosen palette is forced. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

const THEMES: [Theme, string][] = [
  ["system", "Système"],
  ["light", "Clair"],
  ["dark", "Sombre"],
];

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
          <span>Apparence</span>
          <div className="segmented" role="radiogroup" aria-label="Apparence">
            {THEMES.map(([value, label]) => (
              <button key={value} role="radio" aria-checked={settings.theme === value} className={settings.theme === value ? "selected" : ""} onClick={() => onChange({ ...settings, theme: value })}>
                {label}
              </button>
            ))}
          </div>
        </div>
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
