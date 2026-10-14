import { useState } from "react";
import { DEFAULT_COLUMNS, normalizeColumns, statusFor, type TicketColumn } from "./ticket/board";
import { Icon } from "./Icon";
import { keys } from "./keys";

export type Theme = "system" | "light" | "dark";
/** Grammalecte (desktop app), the system's spell checker, or none. */
export type SpellChecker = "grammalecte" | "system" | "off";

export interface Settings {
  autosave: boolean;
  theme: Theme;
  spellChecker: SpellChecker;
  /** Folder of the tickets, relative to the vault. */
  ticketsFolder: string;
  /** Columns of the tickets board (values of `status`). */
  ticketColumns: TicketColumn[];
  /** Note of the reading list, relative to the vault. */
  readingList: string;
  /** Read the title of the pages added to the reading list. */
  fetchTitles: boolean;
}

const AUTOSAVE_KEY = "flownote:autosave";
const THEME_KEY = "flownote:theme";
const SPELL_KEY = "flownote:spellchecker";
const TICKETS_KEY = "flownote:tickets-folder";
const COLUMNS_KEY = "flownote:ticket-columns";
const READING_KEY = "flownote:reading-list";
const TITLES_KEY = "flownote:fetch-titles";

function readColumns(): TicketColumn[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? "null");
    if (Array.isArray(parsed)) return normalizeColumns(parsed.filter((c): c is TicketColumn => typeof c?.status === "string" && typeof c?.label === "string"));
  } catch {
    // default columns
  }
  return DEFAULT_COLUMNS;
}
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
      ticketsFolder: localStorage.getItem(TICKETS_KEY) ?? "Tickets",
      ticketColumns: readColumns(),
      readingList: localStorage.getItem(READING_KEY) || "Lectures.md",
      fetchTitles: localStorage.getItem(TITLES_KEY) !== "false",
    };
  } catch {
    return { autosave: true, theme: "system", spellChecker: "grammalecte", ticketsFolder: "Tickets", ticketColumns: DEFAULT_COLUMNS, readingList: "Lectures.md", fetchTitles: true };
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, String(settings.autosave));
    localStorage.setItem(THEME_KEY, settings.theme);
    localStorage.setItem(SPELL_KEY, settings.spellChecker);
    localStorage.setItem(TICKETS_KEY, settings.ticketsFolder);
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(settings.ticketColumns));
    localStorage.setItem(READING_KEY, settings.readingList);
    localStorage.setItem(TITLES_KEY, String(settings.fetchTitles));
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
            <small>{keys("Sinon, enregistrez avec ⌘S. Les modifications en attente sont enregistrées avant de changer de page.")}</small>
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
        <label className="setting">
          <span>
            Dossier des tickets
            <small>Les nouveaux tickets y sont créés et numérotés (« 12 - Titre.md »).</small>
          </span>
          <input
            className="setting-text"
            value={settings.ticketsFolder}
            placeholder="Racine du vault"
            onChange={(e) => onChange({ ...settings, ticketsFolder: e.target.value.trim().replace(/^\/+|\/+$/g, "") })}
          />
        </label>
        <label className="setting">
          <span>
            Liste de lectures
            <small>La note où sont rangés les liens à lire, par thème (une section par thème).</small>
          </span>
          <input
            className="setting-text"
            value={settings.readingList}
            placeholder="Lectures.md"
            onChange={(e) => onChange({ ...settings, readingList: e.target.value.trim().replace(/^\/+/, "") })}
            onBlur={() => !settings.readingList.endsWith(".md") && settings.readingList && onChange({ ...settings, readingList: `${settings.readingList}.md` })}
          />
        </label>
        <label className="setting">
          <input type="checkbox" checked={settings.fetchTitles} onChange={(e) => onChange({ ...settings, fetchTitles: e.target.checked })} />
          <span>
            Titre automatique des liens
            <small>En ajoutant un lien, l'app lit le titre de la page (une seule requête vers ce site). Sinon, le lien reste tel quel.</small>
          </span>
        </label>
        <ColumnsSetting columns={settings.ticketColumns} onChange={(ticketColumns) => onChange({ ...settings, ticketColumns })} />
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

/**
 * Columns of the tickets board. The first and last ones are the open and
 * closed states (only their titles change); the ones between can be added,
 * renamed, moved and removed. Renaming keeps the `status` value already
 * written in the tickets.
 */
function ColumnsSetting({ columns, onChange }: { columns: TicketColumn[]; onChange: (columns: TicketColumn[]) => void }) {
  const [draft, setDraft] = useState("");
  const update = (next: TicketColumn[]) => onChange(normalizeColumns(next));
  const rename = (i: number, label: string) => onChange(columns.map((c, j) => (j === i ? { ...c, label } : c)));
  const move = (i: number, step: number) => {
    const next = [...columns];
    [next[i], next[i + step]] = [next[i + step], next[i]];
    update(next);
  };
  const add = () => {
    const label = draft.trim();
    if (!label) return;
    update([...columns.slice(0, -1), { status: statusFor(label, columns), label }, columns[columns.length - 1]]);
    setDraft("");
  };
  return (
    <div className="setting setting-column">
      <span>
        Colonnes du tableau des tickets
        <small>La première ouvre le ticket, la dernière le ferme. La valeur entre crochets est écrite dans « status » du ticket.</small>
      </span>
      <ol className="columns-setting">
        {columns.map((c, i) => {
          const fixed = i === 0 || i === columns.length - 1;
          return (
            <li key={c.status}>
              <input value={c.label} aria-label={`Titre de la colonne ${c.status}`} onChange={(e) => rename(i, e.target.value)} onBlur={() => update(columns)} />
              <code>[{c.status}]</code>
              <button disabled={fixed || i === 1} onClick={() => move(i, -1)} aria-label="Monter" title="Monter">
                <Icon name="chevronUp" size={12} />
              </button>
              <button disabled={fixed || i === columns.length - 2} onClick={() => move(i, 1)} aria-label="Descendre" title="Descendre">
                <Icon name="chevronDown" size={12} />
              </button>
              <button disabled={fixed} onClick={() => update(columns.filter((_, j) => j !== i))} aria-label="Supprimer la colonne" title="Supprimer (ses tickets iront dans la première colonne)">
                <Icon name="trash" size={12} />
              </button>
            </li>
          );
        })}
      </ol>
      <div className="columns-add">
        <input value={draft} placeholder="Nouvelle colonne (ex. En revue)" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button onClick={add} disabled={!draft.trim()}>
          Ajouter
        </button>
      </div>
    </div>
  );
}
