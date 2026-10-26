/**
 * Templates, as Obsidian's core plugin: notes of the folder set in
 * `.obsidian/templates.json` (read only). A new page can start from one, and
 * `/modèle` inserts one in a note. `{{title}}`, `{{date}}` and `{{time}}`
 * are filled in, with the date and time formats of the settings or written
 * after a colon (`{{date:dddd D MMMM}}`), in Obsidian's (Moment's) tokens.
 */

export interface TemplatesConfig {
  folder: string;
  dateFormat: string;
  timeFormat: string;
}

/** The settings, or null when no templates folder is set (the feature is then hidden). */
export function readTemplatesConfig(json: string): TemplatesConfig | null {
  let raw: { folder?: unknown; dateFormat?: unknown; timeFormat?: unknown };
  try {
    raw = JSON.parse(json) ?? {};
  } catch {
    return null;
  }
  const folder = typeof raw.folder === "string" ? raw.folder.trim().replace(/^\/+|\/+$/g, "") : "";
  if (!folder) return null;
  const text = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value : fallback);
  return { folder, dateFormat: text(raw.dateFormat, "YYYY-MM-DD"), timeFormat: text(raw.timeFormat, "HH:mm") };
}

/** The templates: the notes of the folder (sub-folders included), by name. */
export function templateFiles(config: TemplatesConfig | null, files: string[]): string[] {
  if (!config) return [];
  const prefix = `${config.folder}/`;
  return files.filter((f) => f.startsWith(prefix) && f.endsWith(".md")).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

/** A template's name in the menus: its path in the folder, without `.md`. */
export function templateName(config: TemplatesConfig, path: string): string {
  return path.slice(config.folder.length + 1).replace(/\.md$/, "");
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** A date in Moment's tokens (the ones Obsidian's formats use); text in [brackets] is kept as is. */
export function formatDate(date: Date, format: string): string {
  const month = (style: "long" | "short") => date.toLocaleDateString("fr-FR", { month: style }).replace(".", "");
  const weekday = (style: "long" | "short") => date.toLocaleDateString("fr-FR", { weekday: style }).replace(".", "");
  const h12 = date.getHours() % 12 || 12;
  const tokens: Record<string, () => string> = {
    YYYY: () => String(date.getFullYear()),
    YY: () => pad(date.getFullYear() % 100),
    MMMM: () => month("long"),
    MMM: () => month("short"),
    MM: () => pad(date.getMonth() + 1),
    M: () => String(date.getMonth() + 1),
    DD: () => pad(date.getDate()),
    D: () => String(date.getDate()),
    dddd: () => weekday("long"),
    ddd: () => weekday("short"),
    HH: () => pad(date.getHours()),
    H: () => String(date.getHours()),
    hh: () => pad(h12),
    h: () => String(h12),
    mm: () => pad(date.getMinutes()),
    m: () => String(date.getMinutes()),
    ss: () => pad(date.getSeconds()),
    s: () => String(date.getSeconds()),
    A: () => (date.getHours() < 12 ? "AM" : "PM"),
    a: () => (date.getHours() < 12 ? "am" : "pm"),
  };
  return format.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a/g, (token, literal: string | undefined) =>
    literal !== undefined ? literal : tokens[token](),
  );
}

/** The template with `{{title}}`, `{{date}}`, `{{time}}` (and `{{date:format}}`, `{{time:format}}`) filled in. */
export function fillTemplate(text: string, title: string, now: Date, config: TemplatesConfig): string {
  return text.replace(/\{\{\s*(title|date|time)(?::([^}]*))?\s*\}\}/gi, (_match, name: string, format: string | undefined) => {
    const key = name.toLowerCase();
    if (key === "title") return title;
    return formatDate(now, format?.trim() || (key === "date" ? config.dateFormat : config.timeFormat));
  });
}

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * A new page from a template: the template filled in, starting with
 * `# Title` like any new page (after its properties), unless it has its own
 * first-level heading there.
 */
export function noteFromTemplate(text: string, title: string, now: Date, config: TemplatesConfig): string {
  const filled = fillTemplate(text, title, now, config);
  const front = FRONT_MATTER.exec(filled)?.[0] ?? "";
  const body = filled.slice(front.length).replace(/^\s*\n/, "");
  if (body.startsWith("# ")) return filled.endsWith("\n") ? filled : `${filled}\n`;
  const rest = body ? `\n${body.endsWith("\n") ? body : `${body}\n`}` : "";
  return `${front}# ${title}\n${rest}`;
}

/** What `/modèle` inserts in a note: the template filled in, without its properties. */
export function templateBody(text: string, title: string, now: Date, config: TemplatesConfig): string {
  return fillTemplate(text, title, now, config).replace(FRONT_MATTER, "").replace(/^\s*\n/, "");
}
