import { useState, type ReactNode } from "react";
import { version } from "../package.json";
import { openUrl } from "./reading/web";
import type { TaskConfig } from "./tasks/config";
import { Icon, type IconName } from "./Icon";
import { keys } from "./keys";
import { isPageSort, type PageSort } from "./pageSort";

export type Theme = "system" | "light" | "dark";
/** Grammalecte (desktop app), the system's spell checker, or none. */
export type SpellChecker = "grammalecte" | "system" | "off";
/** Font of the whole app: the system's, Clarika, Open Sans or Inter. */
export type AppFont = "system" | "clarika" | "open-sans" | "inter";
/** The notes' font: the app's, or one of its own (a serif for reading and writing). */
export type NoteFont = "app" | "serif" | AppFont;
/** The menu of the + button and of `/`: a list with descriptions, or a grid of icons. */
export type BlockMenuStyle = "list" | "grid";

export interface Settings {
  autosave: boolean;
  theme: Theme;
  spellChecker: SpellChecker;
  /** Note of the reading list, relative to the vault. */
  readingList: string;
  /** Read the title of the pages added to the reading list. */
  fetchTitles: boolean;
  /** Size of the whole interface (1: the default size). */
  uiScale: number;
  /** The sidebar and the tabs name pages by their title (else by their file name). */
  showTitles: boolean;
  /** Order of the page tree in the sidebar. */
  pageSort: PageSort;
  /** Bars in the margin beside the blocks changed since the last commit. */
  gitGutter: boolean;
  font: AppFont;
  noteFont: NoteFont;
  blockMenu: BlockMenuStyle;
}

const AUTOSAVE_KEY = "flownote:autosave";
const THEME_KEY = "flownote:theme";
const SPELL_KEY = "flownote:spellchecker";
const READING_KEY = "flownote:reading-list";
const TITLES_KEY = "flownote:fetch-titles";
const SCALE_KEY = "flownote:ui-scale";
const SHOW_TITLES_KEY = "flownote:show-titles";
const PAGE_SORT_KEY = "flownote:page-sort";
const GIT_GUTTER_KEY = "flownote:git-gutter";
const FONT_KEY = "flownote:font";
const NOTE_FONT_KEY = "flownote:note-font";
const BLOCK_MENU_KEY = "flownote:block-menu";

const FONTS: [AppFont, string][] = [
  ["system", "Système"],
  ["clarika", "Clarika"],
  ["open-sans", "Open Sans"],
  ["inter", "Inter"],
];

const NOTE_FONTS: [NoteFont, string][] = [["app", "Comme l'app"], ...FONTS.slice(0, 1), ["serif", "Serif"], ...FONTS.slice(1)];

/** Each font shown in itself in the settings (fonts.css loads the bundled ones). */
const FONT_FAMILIES: Record<Exclude<NoteFont, "app">, string> = {
  system: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  serif: 'ui-serif, "New York", "Iowan Old Style", Georgia, serif',
  clarika: '"Clarika", -apple-system, system-ui, sans-serif',
  "open-sans": '"Open Sans", -apple-system, system-ui, sans-serif',
  inter: '"Inter", -apple-system, system-ui, sans-serif',
};

const BLOCK_MENUS: [BlockMenuStyle, string][] = [
  ["list", "Liste"],
  ["grid", "Grille"],
];

/** Sizes offered for the interface: text, buttons and spacing grow together. */
const UI_SCALES: [number, string][] = [
  [0.9, "Petite"],
  [1, "Normale"],
  [1.1, "Grande"],
  [1.25, "Très grande"],
];

function readScale(): number {
  const value = Number(localStorage.getItem(SCALE_KEY));
  return UI_SCALES.some(([scale]) => scale === value) ? value : 1;
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
      readingList: localStorage.getItem(READING_KEY) ?? "",
      fetchTitles: localStorage.getItem(TITLES_KEY) !== "false",
      uiScale: readScale(),
      showTitles: localStorage.getItem(SHOW_TITLES_KEY) !== "false",
      pageSort: readPageSort(),
      gitGutter: localStorage.getItem(GIT_GUTTER_KEY) === "true",
      font: readFont(),
      noteFont: NOTE_FONTS.find(([value]) => value === localStorage.getItem(NOTE_FONT_KEY))?.[0] ?? "app",
      blockMenu: localStorage.getItem(BLOCK_MENU_KEY) === "grid" ? "grid" : "list",
    };
  } catch {
    return { autosave: true, theme: "system", spellChecker: "grammalecte", readingList: "", fetchTitles: true, uiScale: 1, showTitles: true, pageSort: "name-asc", gitGutter: false, font: "system", noteFont: "app", blockMenu: "list" };
  }
}

function readPageSort(): PageSort {
  const saved = localStorage.getItem(PAGE_SORT_KEY);
  return isPageSort(saved) ? saved : "name-asc";
}

/** The chosen font; Clarika was saved as "bear" before 0.21. */
function readFont(): AppFont {
  const saved = localStorage.getItem(FONT_KEY) === "bear" ? "clarika" : localStorage.getItem(FONT_KEY);
  return FONTS.find(([value]) => value === saved)?.[0] ?? "system";
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, String(settings.autosave));
    localStorage.setItem(THEME_KEY, settings.theme);
    localStorage.setItem(SPELL_KEY, settings.spellChecker);
    localStorage.setItem(READING_KEY, settings.readingList);
    localStorage.setItem(TITLES_KEY, String(settings.fetchTitles));
    localStorage.setItem(SCALE_KEY, String(settings.uiScale));
    localStorage.setItem(SHOW_TITLES_KEY, String(settings.showTitles));
    localStorage.setItem(PAGE_SORT_KEY, settings.pageSort);
    localStorage.setItem(GIT_GUTTER_KEY, String(settings.gitGutter));
    localStorage.setItem(FONT_KEY, settings.font);
    localStorage.setItem(NOTE_FONT_KEY, settings.noteFont);
    localStorage.setItem(BLOCK_MENU_KEY, settings.blockMenu);
  } catch {
    // Settings simply won't persist.
  }
}

/**
 * "system" follows macOS; otherwise the chosen palette is forced. In the
 * desktop app the window follows too: its native material (under the
 * sidebar and the tabs) takes the window's appearance, not the page's.
 */
export function applyTheme(theme: Theme, desktop = false) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  if (desktop) {
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(theme === "system" ? null : theme))
      .catch(() => {});
  }
}

/**
 * Size of the interface. The desktop app zooms its web view, like ⌘+ in a
 * browser, so that positions measured by the menus stay right; elsewhere the
 * page is zoomed with CSS.
 */
export function applyScale(scale: number, desktop = false) {
  if (desktop) {
    void import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(scale))
      .catch(() => {});
    return;
  }
  document.documentElement.style.zoom = scale === 1 ? "" : String(scale);
}

/** Fonts (the app's, the notes') and block menu style, as attributes of the root read by the styles (fonts.css, editor-extras.css). */
export function applyLook(font: AppFont, noteFont: NoteFont, blockMenu: BlockMenuStyle) {
  const root = document.documentElement;
  if (font === "system") delete root.dataset.font;
  else root.dataset.font = font;
  if (noteFont === "app") delete root.dataset.noteFont;
  else root.dataset.noteFont = noteFont;
  root.dataset.blockMenu = blockMenu;
}

/** A choice of font as tiles, each written in its own font. */
function FontPicker<T extends NoteFont>({ label, fonts, value, appFont, onChange }: { label: string; fonts: [T, string][]; value: T; appFont: AppFont; onChange: (font: T) => void }) {
  return (
    <div className="font-picker" role="radiogroup" aria-label={label}>
      {fonts.map(([font, name]) => (
        <button key={font} role="radio" aria-checked={value === font} className={value === font ? "selected" : ""} onClick={() => onChange(font)}>
          <span className="font-picker-sample" style={{ fontFamily: FONT_FAMILIES[font === "app" ? appFont : (font as Exclude<NoteFont, "app">)] }} aria-hidden="true">
            Ag
          </span>
          {name}
        </button>
      ))}
    </div>
  );
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

type Category = "general" | "editor" | "tasks" | "reading" | "vault" | "about";

const CATEGORIES: { id: Category; label: string; icon: IconName }[] = [
  { id: "general", label: "Général", icon: "sliders" },
  { id: "editor", label: "Éditeur", icon: "spelling" },
  { id: "tasks", label: "Tâches", icon: "task" },
  { id: "reading", label: "Liens", icon: "bookmark" },
  { id: "vault", label: "Vault", icon: "folder" },
  { id: "about", label: "À propos", icon: "info" },
];

const REPOSITORY = "https://github.com/florentfougeres/FlowNote";

const CATEGORY_KEY = "flownote:settings-category";

function readCategory(): Category {
  try {
    const saved = localStorage.getItem(CATEGORY_KEY);
    return CATEGORIES.find((c) => c.id === saved)?.id ?? "general";
  } catch {
    return "general";
  }
}

/** A row of a settings card: its label and explanation, its control on the right. */
function Row({ label, help, children, column = false }: { label: string; help?: ReactNode; children: ReactNode; column?: boolean }) {
  return (
    <div className={column ? "settings-row column" : "settings-row"}>
      <div className="settings-row-text">
        <span>{label}</span>
        {help && <small>{help}</small>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

/** An on/off switch, like macOS's. */
function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={checked ? "switch on" : "switch"} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

/**
 * The settings as a page in a tab: categories on the left, their settings
 * in cards on the right. Every change applies and is saved at once.
 */
export function SettingsPage({
  settings,
  vaultName,
  grammarAvailable,
  tasks,
  onChange,
  onChangeVault,
}: {
  settings: Settings;
  vaultName: string;
  grammarAvailable: boolean;
  /** The tasks' settings, read from TaskNotes. */
  tasks: TaskConfig;
  onChange: (s: Settings) => void;
  onChangeVault: () => void;
}) {
  const [category, setCategory] = useState<Category>(readCategory);
  const choose = (id: Category) => {
    setCategory(id);
    try {
      localStorage.setItem(CATEGORY_KEY, id);
    } catch {
      // not remembered
    }
  };
  const spellCheckers: [SpellChecker, string][] = [
    ...(grammarAvailable ? ([["grammalecte", "Grammalecte"]] as [SpellChecker, string][]) : []),
    ["system", grammarAvailable ? "macOS" : "Navigateur"],
    ["off", "Désactivé"],
  ];
  // Grammalecte needs the desktop app: elsewhere its choice falls back to the system checker.
  const current: SpellChecker = !grammarAvailable && settings.spellChecker === "grammalecte" ? "system" : settings.spellChecker;
  const title = CATEGORIES.find((c) => c.id === category)?.label;

  return (
    <div className="settings-page">
      <nav className="settings-nav" aria-label="Catégories de réglages">
        <h1>Réglages</h1>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={category === c.id ? "selected" : ""} aria-current={category === c.id ? "page" : undefined} onClick={() => choose(c.id)}>
            <Icon name={c.icon} size={15} />
            {c.label}
          </button>
        ))}
      </nav>
      <div className="settings-content">
        <h2>{title}</h2>
        {category === "general" && (
          <section className="settings-card">
            <Row label="Apparence" help="Système suit le mode clair ou sombre de macOS.">
              <div className="segmented" role="radiogroup" aria-label="Apparence">
                {THEMES.map(([value, label]) => (
                  <button key={value} role="radio" aria-checked={settings.theme === value} className={settings.theme === value ? "selected" : ""} onClick={() => onChange({ ...settings, theme: value })}>
                    {label}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Taille de l'interface" help="Agrandit ou réduit le texte, les boutons et les marges de toute l'app.">
              <div className="segmented" role="radiogroup" aria-label="Taille de l'interface">
                {UI_SCALES.map(([value, label]) => (
                  <button key={value} role="radio" aria-checked={settings.uiScale === value} className={settings.uiScale === value ? "selected" : ""} onClick={() => onChange({ ...settings, uiScale: value })}>
                    {label}
                  </button>
                ))}
              </div>
            </Row>
            <Row column label="Police de l'app" help="Les menus, la barre latérale, les onglets, les vues. Clarika est douce et arrondie.">
              <FontPicker label="Police de l'app" fonts={FONTS} value={settings.font} appFont={settings.font} onChange={(font) => onChange({ ...settings, font })} />
            </Row>
            <Row column label="Police des notes" help="Le titre et le texte des notes. Un serif se lit bien sur les longs textes.">
              <FontPicker label="Police des notes" fonts={NOTE_FONTS} value={settings.noteFont} appFont={settings.font} onChange={(noteFont) => onChange({ ...settings, noteFont })} />
            </Row>
            <Row label="Enregistrement automatique" help={keys("Sinon, enregistrez avec ⌘S. Les modifications en attente sont enregistrées avant de changer de page.")}>
              <Switch checked={settings.autosave} label="Enregistrement automatique" onChange={(autosave) => onChange({ ...settings, autosave })} />
            </Row>
          </section>
        )}
        {category === "editor" && (
          <section className="settings-card">
            <Row label="Correcteur" help={SPELL_HELP[current]}>
              <div className="segmented" role="radiogroup" aria-label="Correcteur">
                {spellCheckers.map(([value, label]) => (
                  <button key={value} role="radio" aria-checked={current === value} className={current === value ? "selected" : ""} onClick={() => onChange({ ...settings, spellChecker: value })}>
                    {label}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Menu des blocs" help="Le menu du bouton + et de /, en liste avec les descriptions ou en grille d'icônes, plus compacte.">
              <div className="segmented" role="radiogroup" aria-label="Menu des blocs">
                {BLOCK_MENUS.map(([value, label]) => (
                  <button key={value} role="radio" aria-checked={settings.blockMenu === value} className={settings.blockMenu === value ? "selected" : ""} onClick={() => onChange({ ...settings, blockMenu: value })}>
                    {label}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Modifications dans la marge" help="Une barre à gauche des blocs ajoutés (verte) ou modifiés (bleue) depuis le dernier commit, un trait rouge là où des blocs ont été supprimés. Vault Git seulement.">
              <Switch checked={settings.gitGutter} label="Modifications dans la marge" onChange={(gitGutter) => onChange({ ...settings, gitGutter })} />
            </Row>
          </section>
        )}
        {category === "tasks" && (
          <>
            <p className="settings-caption">
              {tasks.fromPlugin
                ? "Les tâches suivent les réglages du plugin TaskNotes de ce vault (lus dans .obsidian, jamais modifiés). Changez-les dans Obsidian."
                : "Les tâches suivent le format du plugin TaskNotes, avec ses réglages par défaut : installez-le dans Obsidian pour les changer."}
            </p>
            <section className="settings-card">
              <Row label="Dossier des nouvelles tâches">
                <code className="settings-value">{tasks.folder || "Racine du vault"}</code>
              </Row>
              <Row label="Une tâche porte" help={tasks.identification === "tag" ? "Les notes avec ce tag dans leurs propriétés, où qu'elles soient." : "Les notes avec cette propriété."}>
                <code className="settings-value">{tasks.identification === "tag" ? `#${tasks.tag}` : `${tasks.property.name}: ${tasks.property.value}`}</code>
              </Row>
            </section>
            <section className="settings-card">
              <Row label="Statuts" help="Les colonnes du tableau, dans cet ordre." column>
                <div className="task-tags">
                  {tasks.statuses.map((s) => (
                    <span key={s.value} className="task-tag neutral">
                      <span className="board-dot" style={{ background: s.color }} /> {s.label}
                      {s.done && <Icon name="check" size={12} label="statut terminé" />}
                    </span>
                  ))}
                </div>
              </Row>
              <Row label="Priorités" column>
                <div className="task-tags">
                  {tasks.priorities.map((p) => (
                    <span key={p.value} className="task-tag neutral">
                      <span className="board-dot" style={{ background: p.color }} /> {p.label}
                    </span>
                  ))}
                </div>
              </Row>
            </section>
          </>
        )}
        {category === "reading" && (
          <section className="settings-card">
            <Row label="Note des liens" help="La note où sont rangés les liens (articles, vidéos, outils…), par thème : une section par thème. Vide : Liens.md, ou Lectures.md si le vault en a déjà une.">
              <input
                className="setting-text"
                value={settings.readingList}
                placeholder="Liens.md"
                aria-label="Liste de lectures"
                onChange={(e) => onChange({ ...settings, readingList: e.target.value.trim().replace(/^\/+/, "") })}
                onBlur={() => !settings.readingList.endsWith(".md") && settings.readingList && onChange({ ...settings, readingList: `${settings.readingList}.md` })}
              />
            </Row>
            <Row label="Titre automatique des liens" help="En ajoutant un lien, l'app lit le titre de la page (une seule requête vers ce site). Sinon, le lien reste tel quel.">
              <Switch checked={settings.fetchTitles} label="Titre automatique des liens" onChange={(fetchTitles) => onChange({ ...settings, fetchTitles })} />
            </Row>
          </section>
        )}
        {category === "vault" && (
          <section className="settings-card">
            <Row label="Vault ouvert" help={vaultName}>
              <button onClick={onChangeVault}>Changer de vault…</button>
            </Row>
          </section>
        )}
        {category === "about" && (
          <section className="settings-card">
            <Row label="Version" help="L'édition par blocs, directement sur votre vault Obsidian.">
              <span className="settings-value">FlowNote {version}</span>
            </Row>
            <Row label="Nouveautés" help="Ce qui a changé à chaque version.">
              <button onClick={() => openUrl(`${REPOSITORY}/blob/main/CHANGELOG.md`)}>Voir le journal des versions</button>
            </Row>
            <Row label="Code source" help="Sous licence MIT.">
              <button onClick={() => openUrl(REPOSITORY)}>Ouvrir sur GitHub</button>
            </Row>
          </section>
        )}
      </div>
    </div>
  );
}

