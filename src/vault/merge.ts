import { Document, isMap, isSeq, parseDocument } from "yaml";
import { splitFrontmatter } from "../markdown/frontmatter";
import { rewriteLinks, rewriteMergedLinks, subpageFolder } from "./links";
import { readAllNotes, type Vault } from "./vault";
import type { RenameResult } from "./pageOps";

/**
 * Merging a note into another, as Obsidian's note composer does: its text
 * goes at the end of the other under a heading with its title, its
 * properties join the other's, the links to it follow, and it goes to the
 * trash. The inverse of extracting part of a note (editor/extract.ts).
 */

/** Notes that merge: Markdown notes, not drawings, mind maps or dashboards. */
export const isMergeable = (path: string) => /\.md$/i.test(path) && !/\.(?:excalidraw|mindmap|dashboard)\.md$/i.test(path);

function split(text: string): { yaml: string | null; body: string } {
  return splitFrontmatter(text) ?? { yaml: null, body: text };
}

/** The title of a note: its first `# heading`, otherwise its name. */
export function mergedTitle(text: string, name: string): string {
  const first = split(text).body.replace(/^\s+/, "").split("\n", 1)[0];
  return /^# +\S/.test(first) ? first.replace(/^# +/, "").replace(/\s+#*\s*$/, "") : name;
}

/** The body without its leading `# title`, every heading one level down (it now sits under a `##`), code left alone. */
function nested(body: string): string {
  const text = body.replace(/^\s+/, "").replace(/^# +\S[^\n]*\n?/, "");
  let fence: string | null = null;
  return text
    .split("\n")
    .map((line) => {
      const marker = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
      if (marker) fence = fence === null ? marker[1][0] : marker[1][0] === fence ? null : fence;
      return fence === null && !marker && /^#{1,5} /.test(line) ? `#${line}` : line;
    })
    .join("\n")
    .trim();
}

/** The target's properties with those of the source it lacks; lists of both (tags, aliases…) joined. Untouched when the source has none. */
function mergedProperties(target: string | null, source: string | null): string | null {
  if (!source?.trim()) return target;
  const from = parseDocument(source);
  const into = target?.trim() ? parseDocument(target) : new Document({});
  if (from.errors.length || into.errors.length || !isMap(from.contents) || !isMap(into.contents)) return target;
  let changed = false;
  for (const pair of from.contents.items) {
    const key = String((pair.key as { value?: unknown })?.value ?? pair.key);
    const value = from.get(key);
    const current = into.get(key, true);
    if (current === undefined) {
      into.set(key, into.createNode((value as { toJSON?: () => unknown })?.toJSON?.() ?? value));
      changed = true;
    } else if (isSeq(current) && isSeq(value)) {
      const known = new Set(current.items.map((i) => JSON.stringify((i as { toJSON?: () => unknown }).toJSON?.() ?? i)));
      for (const item of value.items) {
        const plain = (item as { toJSON?: () => unknown }).toJSON?.() ?? item;
        if (known.has(JSON.stringify(plain))) continue;
        current.items.push(into.createNode(plain));
        changed = true;
      }
    }
  }
  return changed ? into.toString({ lineWidth: 0, flowCollectionPadding: false }).replace(/\n+$/, "") : target;
}

/** The target's text once the source is merged into it, under `## title`. */
export function mergedText(target: string, source: string, title: string): string {
  const into = split(target);
  const from = split(source);
  const yaml = mergedProperties(into.yaml, from.yaml);
  const head = yaml === into.yaml ? target.slice(0, target.length - into.body.length) : `---\n${yaml}\n---\n`;
  const body = nested(from.body);
  const before = into.body.replace(/\s+$/, "");
  return `${head}${before}${before ? "\n\n" : ""}## ${title}\n${body ? `\n${body}\n` : ""}`;
}

/**
 * Merges the note `source` into the note `target`: the target gets its text
 * and properties, every link to the source points to its new heading, then
 * the source is removed (to the trash in the desktop app). A note with
 * sub-pages is not merged.
 */
export async function mergePage(vault: Vault, source: string, target: string): Promise<RenameResult> {
  if (source === target) throw new Error("Une note ne se fusionne pas avec elle-même.");
  const files = await vault.files();
  if (files.some((f) => f.startsWith(`${subpageFolder(source)}/`))) throw new Error("Cette note a des sous-pages : déplacez-les avant de la fusionner.");
  const [sourceText, targetText] = await Promise.all([vault.read(source), vault.read(target)]);
  const name = source.slice(source.lastIndexOf("/") + 1).replace(/\.md$/i, "");
  const title = mergedTitle(sourceText, name);
  // The source's relative links, from the target's folder.
  const moved = rewriteLinks(sourceText, { oldNotePath: source, newNotePath: target, filesBefore: files, filesAfter: files, renames: new Map() }) ?? sourceText;
  const merged = mergedText(targetText, moved, title);
  await vault.write(target, rewriteMergedLinks(merged, target, files, source, target, title) ?? merged, targetText);
  const updatedNotes = [target];
  for (const [path, content] of await readAllNotes(vault, files)) {
    if (path === source || path === target) continue;
    const next = rewriteMergedLinks(content, path, files, source, target, title);
    if (next === null) continue;
    await vault.write(path, next, content);
    updatedNotes.push(path);
  }
  await vault.remove(source);
  return { path: target, updatedNotes };
}
