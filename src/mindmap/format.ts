/**
 * Mind maps are notes named `Name.mindmap.md`, edited with Mind Elixir and
 * stored in its own format (JSON), like drawings are stored in Excalidraw's:
 *
 *   ---
 *   mindmap-plugin: flownote
 *   ---
 *   (anything: kept as is)
 *   # Mind map
 *   - Idée centrale          ← readable outline, regenerated: what Obsidian shows
 *     - Branche
 *   %%
 *   ```json                  ← the map itself (hidden in Obsidian's reading view)
 *   { "nodeData": { … } }
 *   ```
 *   %%
 *
 * Everything before "# Mind map" is kept verbatim; the rest is regenerated
 * from the map.
 */

export const MINDMAP_SUFFIX = ".mindmap.md";

export const isMindmapPath = (path: string) => path.toLowerCase().endsWith(MINDMAP_SUFFIX);

/** A node of the map, as Mind Elixir stores it (only the fields the file format needs). */
export interface MindNode {
  id: string;
  topic: string;
  children?: MindNode[];
  expanded?: boolean;
  [key: string]: unknown;
}

export interface MindMapData {
  nodeData: MindNode;
  [key: string]: unknown;
}

export interface MindmapFile {
  /** Front matter and free text before "# Mind map", verbatim. */
  prefix: string;
  data: MindMapData;
  eol: "\n" | "\r\n";
}

const DATA_HEADING = /^# Mind map[ \t]*$/m;
const JSON_BLOCK = /```json[ \t]*\r?\n([\s\S]*?)\r?\n```/;

let counter = 0;
const newId = () => `${Date.now().toString(16)}${(counter++).toString(16)}`;

/** A map with only its central idea. */
export function newMindmapData(topic: string): MindMapData {
  return { nodeData: { id: "root", topic: topic || "Idée centrale", children: [] } };
}

/** A new mind map file: the central idea and three branches to start from. */
export function newMindmapFile(title: string): string {
  const data = newMindmapData(title);
  data.nodeData.children = ["Branche 1", "Branche 2", "Branche 3"].map((topic) => ({ id: newId(), topic }));
  return serializeMindmap({ prefix: "---\nmindmap-plugin: flownote\ntags: [mindmap]\n---\n\n", data, eol: "\n" });
}

/** The map in a mind map note; a note without data (or broken JSON) gives a map named after it. */
export function parseMindmap(markdown: string, fallbackTopic = "Idée centrale"): MindmapFile {
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const heading = DATA_HEADING.exec(markdown);
  const prefix = heading ? markdown.slice(0, heading.index) : markdown.endsWith("\n") || markdown === "" ? markdown : markdown + eol;
  let data: MindMapData | null = null;
  const json = heading ? JSON_BLOCK.exec(markdown.slice(heading.index)) : null;
  if (json) {
    try {
      const parsed = JSON.parse(json[1]) as MindMapData;
      if (parsed && typeof parsed.nodeData?.topic === "string") data = parsed;
    } catch {
      // unreadable: start from a fresh map (the file is only rewritten on a change)
    }
  }
  return { prefix, data: data ?? newMindmapData(fallbackTopic), eol };
}

/** Plain text of a topic (Mind Elixir topics are text; line breaks become spaces). */
const plain = (topic: string) => topic.replace(/\s+/g, " ").trim() || "…";

/** The readable outline: one list item per node. */
export function outline(node: MindNode, depth = 0): string[] {
  return [`${"  ".repeat(depth)}- ${plain(node.topic)}`, ...(node.children ?? []).flatMap((child) => outline(child, depth + 1))];
}

export function serializeMindmap({ prefix, data, eol }: MindmapFile): string {
  // The theme follows the app (light or dark): it is not part of the map.
  const { theme: _theme, ...stored } = data;
  const lines = ["# Mind map", "", ...outline(data.nodeData), "", "%%", "```json", JSON.stringify(stored, null, 2), "```", "%%", ""];
  const separator = prefix === "" || prefix.endsWith("\n\n") || prefix.endsWith("\r\n\r\n") ? "" : eol;
  return prefix + separator + lines.join("\n").replace(/\n/g, eol);
}
