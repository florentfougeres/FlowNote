import { compressToBase64, decompressFromBase64 } from "lz-string";

/**
 * Drawings are stored like the Obsidian Excalidraw plugin stores them
 * (`Name.excalidraw.md`): a Markdown note holding the scene as JSON, so they
 * open in Obsidian with that plugin (and stay readable as text without it).
 *
 *   ---
 *   excalidraw-plugin: parsed
 *   ---
 *   (anything: kept as is)
 *   # Excalidraw Data
 *   ## Text Elements      ← text of each text element, " ^<id>"
 *   ## Embedded Files     ← "<fileId>: [[image.png]]"
 *   %%
 *   ## Drawing
 *   ```json               ← or ```compressed-json (read only; FlowNote writes plain JSON)
 *   { "type": "excalidraw", "elements": [...], ... }
 *   ```
 *   %%
 *
 * Everything before "# Excalidraw Data" is kept verbatim, as well as an
 * "## Element Links" section; the rest is regenerated from the scene.
 */

export const DRAWING_SUFFIX = ".excalidraw.md";

export const isDrawingPath = (path: string) => path.toLowerCase().endsWith(DRAWING_SUFFIX);

/** "Dossier/Schéma.excalidraw.md" → "Schéma". */
export const drawingName = (path: string) => (path.split("/").pop() ?? path).slice(0, -DRAWING_SUFFIX.length);

/** Minimal views of Excalidraw's types: the file format only needs these fields. */
export interface SceneElement {
  id: string;
  type: string;
  isDeleted?: boolean;
  text?: string;
  originalText?: string;
  fileId?: string | null;
  [key: string]: unknown;
}

export interface Scene {
  elements: SceneElement[];
  appState: Record<string, unknown>;
  /** Images, by file id (dataURL); kept in the vault as attachments, not in the JSON. */
  files: Record<string, { id: string; mimeType: string; dataURL: string; created?: number }>;
}

export interface DrawingFile {
  /** Front matter and free text before "# Excalidraw Data", verbatim. */
  prefix: string;
  scene: Scene;
  /** fileId → link target of the image ("Pasted image.png", or a URL). */
  embedded: Map<string, string>;
  /** "## Element Links" section, verbatim (empty when absent). */
  elementLinks: string;
  /** The drawing data was compressed (plugin default); FlowNote writes it back as plain JSON. */
  compressed: boolean;
  /** Line ending of the file, kept when writing. */
  eol: "\n" | "\r\n";
}

const HINT =
  "==⚠ Dessin FlowNote / Excalidraw : ouvrez-le avec le plugin Obsidian « Excalidraw » (menu « Plus d'options » → vue Excalidraw). ⚠==";

/** A new, empty drawing. */
export function newDrawingFile(): string {
  return serializeDrawing({
    prefix: `---\n\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n\n---\n${HINT}\n\n\n`,
    scene: { elements: [], appState: {}, files: {} },
    embedded: new Map(),
    elementLinks: "",
    compressed: false,
    eol: "\n",
  });
}

const DATA_HEADING = /^# Excalidraw Data[ \t]*$/m;

/** Reads a drawing note; throws if it holds no drawing data. */
export function parseDrawing(text: string): DrawingFile {
  const eol: "\n" | "\r\n" = text.includes("\r\n") ? "\r\n" : "\n";
  const source = eol === "\n" ? text : text.replace(/\r\n/g, "\n");
  const heading = DATA_HEADING.exec(source);
  const prefix = heading ? source.slice(0, heading.index) : source.slice(0, source.search(/^%%[ \t]*\n## Drawing/m) >>> 0);
  const data = heading ? source.slice(heading.index) : source.slice(prefix.length);

  const block = /## Drawing[ \t]*\n```(compressed-json|json)[ \t]*\n([\s\S]*?)\n```/.exec(data);
  if (!block) throw new Error("Ce fichier ne contient pas de données de dessin Excalidraw.");
  const compressed = block[1] === "compressed-json";
  const json = compressed ? decompressFromBase64(block[2].replace(/\s+/g, "")) : block[2];
  if (json === null || json === undefined || json === "") throw new Error("Données de dessin compressées illisibles.");
  const raw = JSON.parse(json) as Partial<Scene> & { elements?: SceneElement[] };

  const embedded = new Map<string, string>();
  const embeddedSection = section(data, "Embedded Files");
  for (const line of embeddedSection.split("\n")) {
    const match = /^([0-9a-zA-Z_-]+):\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    const link = /^!?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/.exec(match[2]);
    embedded.set(match[1], link ? link[1] : match[2]);
  }

  return {
    prefix,
    scene: { elements: raw.elements ?? [], appState: raw.appState ?? {}, files: {} },
    embedded,
    elementLinks: section(data, "Element Links"),
    compressed,
    eol,
  };
}

/** Body of a "## <name>" section of the data part (up to the next "##" heading or "%%"). */
function section(data: string, name: string): string {
  const match = new RegExp(`^## ${name}[ \\t]*\\n([\\s\\S]*?)(?=^##? |^%%|$(?![\\s\\S]))`, "m").exec(data);
  return match ? match[1].trim() : "";
}

/** Only what describes the drawing itself (no scroll position, zoom or open menus: no noisy diffs). */
function persistedAppState(appState: Record<string, unknown>) {
  const kept: Record<string, unknown> = { gridSize: appState.gridSize ?? null, viewBackgroundColor: appState.viewBackgroundColor ?? "#ffffff" };
  if (appState.gridModeEnabled) kept.gridModeEnabled = true;
  return kept;
}

export function serializeDrawing(file: DrawingFile): string {
  const elements = file.scene.elements.filter((e) => !e.isDeleted);
  const texts = elements
    .filter((e) => e.type === "text" && typeof (e.originalText ?? e.text) === "string")
    .map((e) => `${String(e.originalText ?? e.text)} ^${e.id}\n`);
  const usedFiles = new Set(elements.map((e) => e.fileId).filter((id): id is string => typeof id === "string"));
  const embedded = [...file.embedded].filter(([id]) => usedFiles.has(id)).map(([id, target]) => `${id}: ${/^[a-z]+:\/\//i.test(target) ? target : `[[${target}]]`}\n`);
  const json = JSON.stringify({ type: "excalidraw", version: 2, source: "FlowNote", elements, appState: persistedAppState(file.scene.appState), files: {} }, null, 2);

  let out = file.prefix;
  if (out && !out.endsWith("\n")) out += "\n";
  out += "# Excalidraw Data\n\n## Text Elements\n";
  out += texts.map((t) => `${t}\n`).join("");
  if (file.elementLinks) out += `## Element Links\n${file.elementLinks}\n\n`;
  if (embedded.length) out += `## Embedded Files\n${embedded.join("")}\n`;
  out += `%%\n## Drawing\n\`\`\`json\n${json}\n\`\`\`\n%%`;
  return file.eol === "\r\n" ? out.replace(/\n/g, "\r\n") : out;
}

/** For tests and tools: the plugin's compressed form of a scene JSON. */
export const compressScene = (json: string) => compressToBase64(json);
