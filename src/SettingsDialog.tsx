export type Theme = "system" | "light" | "dark";
/** Grammalecte (desktop app), the system's spell checker, or none. */
export type SpellChecker = "grammalecte" | "system" | "off";

export interface Settings {
  autosave: boolean;
  theme: Theme;
  spellChecker: SpellChecker;
}

const AUTOSAVE_KEY = "flownote:autosave";
const THEME_KEY = "flownote:theme";
const SPELL_KEY = "flownote:spellchecker";
/** Former on/off setting of Grammalecte, read once to keep the user's choice. */
const LEGACY_GRAMMAR_KEY = "flownote:grammar";

function readSpellChecker(): SpellChecker {
  const value = localStorage.getItem(SPELL_KEY);
  if (value === "grammalecte" || value === "system" || value === "off") return value;
  return localStorage.getItem(LEGACY_GRAMMAR_KEY) === "false" ? "system" : "grammalecte";
}

export function loadSettings(): Settings {
  try {
    const theme = localStorage.getItem(THEME_KEY);
    return {
      autosave: localStorage.getItem(AUTOSAVE_KEY) !== "false",
      theme: theme === "light" || theme === "dark" ? theme : "system",
      spellChecker: readSpellChecker(),
    };
  } catch {
    return { autosave: true, theme: "system", spellChecker: "grammalecte" };
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, String(settings.autosave));
    localStorage.setItem(THEME_KEY, settings.theme);
    localStorage.setItem(SPELL_KEY, settings.spellChecker);
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

const SPELL_HELP: Record<SpellChecker, string> = {
  grammalecte: "Grammaire et orthographe en français, entièrement sur votre Mac. Cliquez sur un mot souligné pour voir les suggestions.",
  system: "Le correcteur orthographique du système, dans les langues réglées sur votre Mac. Suggestions au clic droit.",
  off: "Aucun mot n'est souligné.",
};

const THEMES: [Theme, string][] = [
  ["system", "Système"],
  ["light", "Clair"],
  ["dark", "Sombre"],
];

export function SettingsDialog({
  settings,
  vaultName,
  grammarAvailable,
  onChange,
  onChangeVault,
  onClose,
}: {
  settings: Settings;
  vaultName: string;
  grammarAvailable: boolean;
  onChange: (s: Settings) => void;
  onChangeVault: () => void;
  onClose: () => void;
}) {
  const spellCheckers: [SpellChecker, string][] = [
    ...(grammarAvailable ? ([["grammalecte", "Grammalecte"]] as [SpellChecker, string][]) : []),
    ["system", grammarAvailable ? "macOS" : "Navigateur"],
    ["off", "Désactivé"],
  ];
  // Grammalecte needs the desktop app: elsewhere its choice falls back to the system checker.
  const current: SpellChecker = !grammarAvailable && settings.spellChecker === "grammalecte" ? "system" : settings.spellChecker;
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
        <div className="setting setting-column">
          <span>Correcteur</span>
          <div className="segmented" role="radiogroup" aria-label="Correcteur">
            {spellCheckers.map(([value, label]) => (
              <button key={value} role="radio" aria-checked={current === value} className={current === value ? "selected" : ""} onClick={() => onChange({ ...settings, spellChecker: value })}>
                {label}
              </button>
            ))}
          </div>
          <small>{SPELL_HELP[current]}</small>
        </div>
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
