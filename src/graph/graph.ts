import { noteLinkTargets } from "../dashboard/stats";
import { isDrawingPath } from "../drawing/format";
import { isTicketMarkdown } from "../ticket/format";
import { noteIcon } from "../vault/icon";
import { extension, linkPath, noteTitle, resolveLink } from "../vault/links";

/**
 * Graph of the vault, like Obsidian's: a node per note, an edge per link
 * between two notes (in either direction, counted once). Links to notes that
 * do not exist yet give "missing" nodes. Nothing is stored: the graph is
 * computed from the notes' text.
 */

export type GraphNodeKind = "note" | "ticket" | "drawing" | "missing";

export interface GraphNode {
  /** Note path, or "missing:<name>" for a link to a note that does not exist. */
  id: string;
  title: string;
  kind: GraphNodeKind;
  icon: string | null;
  /** Number of links to and from the node. */
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface VaultGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildGraph(notes: [string, string][], files: string[]): VaultGraph {
  const nodes = new Map<string, GraphNode>();
  for (const [path, text] of notes) {
    const kind: GraphNodeKind = isDrawingPath(path) ? "drawing" : isTicketMarkdown(text) ? "ticket" : "note";
    nodes.set(path, { id: path, title: noteTitle(path), kind, icon: kind === "drawing" ? null : noteIcon(text), degree: 0 });
  }
  const edges = new Map<string, GraphEdge>();
  for (const [path, text] of notes) {
    if (isDrawingPath(path)) continue; // drawing data is JSON, not prose
    for (const target of noteLinkTargets(text)) {
      const resolved = resolveLink(target, files, path);
      let to: string;
      if (resolved) {
        if (!nodes.has(resolved)) continue; // attachments (images, PDF…) are not in the graph
        to = resolved;
      } else {
        const file = linkPath(target).split("/").pop()!;
        // A missing attachment (image, PDF…) is not a note to write.
        if (!file || (/^[a-z0-9]{1,5}$/.test(extension(file)) && !/\.md$/i.test(file))) continue;
        const name = file.replace(/\.md$/i, "");
        to = `missing:${name.toLowerCase()}`;
        if (!nodes.has(to)) nodes.set(to, { id: to, title: name, kind: "missing", icon: null, degree: 0 });
      }
      if (to === path) continue;
      const key = path < to ? `${path}\n${to}` : `${to}\n${path}`;
      if (edges.has(key)) continue;
      edges.set(key, { source: path, target: to });
      nodes.get(path)!.degree++;
      nodes.get(to)!.degree++;
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** The graph without some nodes (and their edges). */
export function filterGraph(graph: VaultGraph, keep: (node: GraphNode) => boolean): VaultGraph {
  const nodes = graph.nodes.filter(keep);
  const ids = new Set(nodes.map((n) => n.id));
  return { nodes, edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
}
