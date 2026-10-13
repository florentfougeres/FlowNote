import type { PMJSON, PMMark } from "./types";

/**
 * Reduces a document to what a reader sees, dropping attributes that only record
 * Markdown style (markers, fences, raw sources of re-buildable nodes). Two
 * fragments with equal normal forms render identically in Obsidian.
 */

const SIGNIFICANT_ATTRS: Record<string, string[]> = {
  heading: ["level"],
  codeBlock: ["language"],
  list: ["ordered"],
  listItem: ["checked"],
  callout: ["calloutType", "fold"],
  wikilink: ["target", "alias", "embed"],
  image: ["src", "alt", "title"],
  inlineRaw: ["source"],
  rawBlock: ["source"],
};

const UNMARKED = new Set(["softBreak", "hardBreak"]);

function markKey(m: PMMark): string {
  if (m.type === "link") return `link(${String(m.attrs?.href ?? "")}|${String(m.attrs?.title ?? "")})`;
  return m.type;
}

function marksKey(n: PMJSON): string {
  if (UNMARKED.has(n.type)) return "";
  return (n.marks ?? []).map(markKey).sort().join(",");
}

export type Normal = { text: string; marks: string } | { type: string; attrs: Record<string, unknown>; marks: string; content: Normal[] };

export function normalize(nodes: PMJSON[]): Normal[] {
  const out: Normal[] = [];
  const kept = nodes.length > 1 ? nodes.filter((n) => !(n.type === "paragraph" && !n.content?.length)) : nodes;
  for (const n of kept) {
    if (n.type === "text") {
      const marks = marksKey(n);
      const previous = out[out.length - 1];
      if (previous && "text" in previous && previous.marks === marks) previous.text += n.text ?? "";
      else out.push({ text: n.text ?? "", marks });
      continue;
    }
    const attrs: Record<string, unknown> = {};
    for (const name of SIGNIFICANT_ATTRS[n.type] ?? []) attrs[name] = n.attrs?.[name] ?? null;
    if (n.type === "list" && n.attrs?.ordered) attrs.start = n.attrs.start ?? 1;
    out.push({ type: n.type, attrs, marks: marksKey(n), content: normalize(n.content ?? []) });
  }
  return out;
}

export function equivalent(a: PMJSON[], b: PMJSON[]): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
