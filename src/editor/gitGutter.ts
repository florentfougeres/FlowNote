import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { loadMarkdown } from "../markdown/note";

/**
 * Changes since the last commit, in the margin (option of the settings): a
 * bar beside each block added or changed compared with the note's version in
 * Git, a mark where blocks were removed. A click on a mark shows the committed
 * version and puts it back. Blocks are compared whole, as the file is
 * rewritten block by block.
 */

/** A run of blocks that differ: committed blocks `base` became the current blocks `current` (indexes), starting at current block `at`. */
export interface BlockGroup {
  at: number;
  base: number[];
  current: number[];
}

/** Groups of differing blocks between the committed version and the current one (each block as a comparable key). */
export function blockGroups(base: string[], current: string[]): BlockGroup[] {
  let start = 0;
  while (start < base.length && start < current.length && base[start] === current[start]) start++;
  let endBase = base.length;
  let endCurrent = current.length;
  while (endBase > start && endCurrent > start && base[endBase - 1] === current[endCurrent - 1]) {
    endBase--;
    endCurrent--;
  }
  // Longest common subsequence of the differing middle.
  const b = base.slice(start, endBase);
  const c = current.slice(start, endCurrent);
  const lcs: number[][] = Array.from({ length: b.length + 1 }, () => new Array<number>(c.length + 1).fill(0));
  for (let i = b.length - 1; i >= 0; i--) for (let j = c.length - 1; j >= 0; j--) lcs[i][j] = b[i] === c[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const groups: BlockGroup[] = [];
  let group: BlockGroup | null = null;
  let i = 0;
  let j = 0;
  while (i < b.length || j < c.length) {
    if (i < b.length && j < c.length && b[i] === c[j]) {
      group = null;
      i++;
      j++;
      continue;
    }
    if (!group) groups.push((group = { at: start + j, base: [], current: [] }));
    if (j < c.length && (i >= b.length || lcs[i][j + 1] >= lcs[i + 1][j])) group.current.push(start + j++);
    else group.base.push(start + i++);
  }
  return groups;
}

/** How a current block differs: paired one to one with removed blocks it is changed, beyond them it is new. */
export function blockChange(group: BlockGroup, block: number): "modified" | "added" {
  return group.current.indexOf(block) < group.base.length ? "modified" : "added";
}

export interface WordPart {
  text: string;
  kind: "same" | "removed" | "added";
}

/** Word by word differences between two texts (spaces kept with the words). */
export function wordDiff(before: string, after: string): WordPart[] {
  const a = before.match(/\s+|[^\s]+/g) ?? [];
  const b = after.match(/\s+|[^\s]+/g) ?? [];
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const parts: WordPart[] = [];
  const push = (text: string, kind: WordPart["kind"]) => {
    const last = parts[parts.length - 1];
    if (last?.kind === kind) last.text += text;
    else parts.push({ text, kind });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push(a[i++], "same");
      j++;
      // What was removed comes before what replaced it.
    } else if (j < b.length && (i >= a.length || lcs[i][j + 1] > lcs[i + 1][j])) push(b[j++], "added");
    else push(a[i++], "removed");
  }
  return parts;
}

/** The note as in the last commit. */
export interface GitBase {
  text: string;
  /** Date of the commit (ISO). */
  date: string;
}

interface Committed {
  keys: string[];
  nodes: PMNode[];
  /** Exact text of each committed block, to write it back unchanged. */
  sources: string[] | null;
  date: string;
}

interface GutterState {
  committed: Committed | null;
  groups: BlockGroup[];
  decorations: DecorationSet;
}

export const gitGutterKey = new PluginKey<GutterState>("gitGutter");

/** Key of a block: unchanged blocks keep their node, so their key is computed once. */
const keys = new WeakMap<PMNode, string>();
function keyOf(node: PMNode): string {
  let key = keys.get(node);
  if (key === undefined) {
    key = JSON.stringify(node.toJSON());
    keys.set(node, key);
  }
  return key;
}

function blocksOf(doc: PMNode): PMNode[] {
  const blocks: PMNode[] = [];
  doc.forEach((node) => blocks.push(node));
  return blocks;
}

/** Position of each top-level block, plus the end of the document. */
export function blockStarts(doc: PMNode): number[] {
  const starts: number[] = [];
  let pos = 0;
  doc.forEach((node) => {
    starts.push(pos);
    pos += node.nodeSize;
  });
  starts.push(pos);
  return starts;
}

function compute(doc: PMNode, committed: Committed | null): GutterState {
  if (!committed) return { committed, groups: [], decorations: DecorationSet.empty };
  const blocks = blocksOf(doc);
  const groups = blockGroups(committed.keys, blocks.map(keyOf));
  const starts = blockStarts(doc);
  const decorations: Decoration[] = [];
  groups.forEach((group, index) => {
    for (const block of group.current) {
      decorations.push(Decoration.node(starts[block], starts[block] + blocks[block].nodeSize, { class: `git-${blockChange(group, block)}`, "data-git-group": String(index) }));
    }
    if (group.current.length === 0) {
      decorations.push(
        Decoration.widget(
          starts[group.at],
          () => {
            const mark = document.createElement("span");
            mark.className = "git-removed";
            mark.dataset.gitGroup = String(index);
            mark.title = "Bloc supprimé depuis le dernier commit";
            return mark;
          },
          { side: -1, key: `removed-${index}-${group.base.join(",")}`, ignoreSelection: true },
        ),
      );
    }
  });
  return { committed, groups, decorations: DecorationSet.create(doc, decorations) };
}

/** Sets the note as in the last commit, or null to hide the marks. */
export function setGitBase(state: EditorState, base: GitBase | null): Transaction {
  let committed: Committed | null = null;
  if (base) {
    const { doc, layout } = loadMarkdown(base.text);
    // Through the schema, like the editor's own nodes (default attributes filled in).
    const nodes = (doc.content ?? []).map((json) => state.schema.nodeFromJSON(json));
    committed = { keys: nodes.map(keyOf), nodes, sources: layout.origins.length === nodes.length ? layout.origins.map((o) => o.source) : null, date: base.date };
  }
  return state.tr.setMeta(gitGutterKey, committed).setMeta("addToHistory", false);
}

/** A group of changes, with what is needed to show and undo it. */
export interface GitChange {
  kind: "modified" | "added" | "removed";
  date: string;
  /** Committed blocks of the group, with their exact text when known. */
  before: { node: PMNode; source: string | null }[];
  /** Current blocks of the group. */
  after: PMNode[];
  /** Range of the current blocks (empty at the insertion point for removed blocks). */
  from: number;
  to: number;
}

export function gitChange(state: EditorState, index: number): GitChange | null {
  const gutter = gitGutterKey.getState(state);
  const group = gutter?.groups[index];
  if (!gutter?.committed || !group) return null;
  const { committed } = gutter;
  const starts = blockStarts(state.doc);
  const blocks = blocksOf(state.doc);
  const after = group.current.map((i) => blocks[i]);
  const from = starts[group.current[0] ?? group.at];
  const to = group.current.length ? starts[group.current[group.current.length - 1] + 1] : from;
  return {
    kind: group.current.length === 0 ? "removed" : group.base.length === 0 ? "added" : "modified",
    date: committed.date,
    before: group.base.map((i) => ({ node: committed.nodes[i], source: committed.sources?.[i] ?? null })),
    after,
    from,
    to,
  };
}

/** Puts the committed blocks of a change back in place of the current ones. */
export function undoGitChange(state: EditorState, change: GitChange): Transaction {
  const nodes = change.before.map((b) => b.node);
  // A document is never left without a block.
  if (nodes.length === 0 && change.from === 0 && change.to === state.doc.content.size) return state.tr.replaceWith(0, change.to, state.schema.nodes.paragraph.create());
  return nodes.length ? state.tr.replaceWith(change.from, change.to, nodes) : state.tr.delete(change.from, change.to);
}

export function gitGutterPlugin() {
  return new Plugin<GutterState>({
    key: gitGutterKey,
    state: {
      init: () => ({ committed: null, groups: [], decorations: DecorationSet.empty }),
      apply(tr, state, _old, next) {
        const committed = tr.getMeta(gitGutterKey) as Committed | null | undefined;
        if (committed !== undefined) return compute(next.doc, committed);
        if (!tr.docChanged || !state.committed) return state;
        return compute(next.doc, state.committed);
      },
    },
    props: {
      decorations: (state) => gitGutterKey.getState(state)?.decorations,
    },
  });
}
