import { parseDocument } from "yaml";

/**
 * A dashboard page (`Name.dashboard.md`): a Markdown note whose `## Titre`
 * sections are widgets on a 12-column grid. The positions live in the front
 * matter, `flownote-dashboard: { Titre: [x, y, w, h] }`; the sections stay
 * plain Markdown (queries, charts, embeds…), readable in Obsidian.
 */
export const DASHBOARD_SUFFIX = ".dashboard.md";
export const isDashboardPath = (path: string) => path.toLowerCase().endsWith(DASHBOARD_SUFFIX);

export const COLUMNS = 12;
const KEY = "flownote-dashboard";

export interface Widget {
  title: string;
  /** The section's text after its `## Titre` line, as written. */
  body: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Dashboard {
  /** Front matter text between the `---` lines, or null. */
  frontmatter: string | null;
  /** Text before the first `##`. */
  preamble: string;
  widgets: Widget[];
}

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseDashboard(text: string): Dashboard {
  const front = FRONT.exec(text);
  const frontmatter = front ? front[1] : null;
  const rest = front ? text.slice(front[0].length) : text;
  const layout = new Map<string, number[]>();
  if (frontmatter !== null) {
    const map = (parseDocument(frontmatter).toJS() as Record<string, unknown> | null)?.[KEY];
    if (map && typeof map === "object")
      for (const [title, value] of Object.entries(map as Record<string, unknown>))
        if (Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === "number")) layout.set(title, value as number[]);
  }
  // Split on `## ` lines outside code fences.
  const parts: { title: string | null; lines: string[] }[] = [{ title: null, lines: [] }];
  let fence: string | null = null;
  for (const line of rest.split("\n")) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && (fence === null || marker.startsWith(fence))) fence = fence === null ? marker : null;
    const heading = fence === null && !marker ? /^## (.*)$/.exec(line) : null;
    if (heading) parts.push({ title: heading[1].trim(), lines: [] });
    else parts[parts.length - 1].lines.push(line);
  }
  let next = 0;
  const widgets = parts.slice(1).map((part, i): Widget => {
    const [x, y, w, h] = layout.get(part.title!) ?? [(i % 2) * 6, next, 6, 6];
    next = Math.max(next, y + h);
    return { title: part.title!, body: part.lines.join("\n"), x, y, w, h };
  });
  return { frontmatter, preamble: parts[0].lines.join("\n"), widgets };
}

export function serializeDashboard(board: Dashboard): string {
  const doc = parseDocument(board.frontmatter ?? "");
  const layout = doc.createNode(Object.fromEntries(board.widgets.map((w) => [w.title, [w.x, w.y, w.w, w.h]])));
  for (const item of layout.items) (item.value as { flow: boolean }).flow = true;
  doc.set(KEY, layout);
  const sections = board.widgets.map((w) => `## ${w.title}\n${w.body}`);
  return `---\n${doc.toString({ flowCollectionPadding: false }).trimEnd()}\n---\n${[board.preamble, ...sections].join("\n")}`;
}

/** Pushes widgets down until none overlap; `first` keeps its place. */
export function settle(widgets: Widget[], first: number): Widget[] {
  const order = widgets.map((_, i) => i).sort((a, b) => (a === first ? -1 : b === first ? 1 : widgets[a].y - widgets[b].y || widgets[a].x - widgets[b].x));
  const placed: Widget[] = [];
  const result = [...widgets];
  for (const i of order) {
    const w = { ...widgets[i] };
    const hit = () => placed.find((p) => w.x < p.x + p.w && p.x < w.x + w.w && w.y < p.y + p.h && p.y < w.y + w.h);
    for (let p = hit(); p; p = hit()) w.y = p.y + p.h;
    placed.push(w);
    result[i] = w;
  }
  return result;
}

export function newDashboardFile(): string {
  return serializeDashboard({
    frontmatter: null,
    preamble: "",
    widgets: [],
  });
}
