import { invoke } from "@tauri-apps/api/core";

/** Git manager API, implemented by the Tauri backend (system git) or in memory for the demo. */

export interface GitFile {
  path: string;
  origPath?: string;
  /** Porcelain letters: "M", "A", "D", "R", "C", "U", "?" or " ". */
  index: string;
  worktree: string;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
}

export interface GitApi {
  status(): Promise<GitStatus>;
  diff(file: GitFile, staged: boolean): Promise<string>;
  stage(paths: string[]): Promise<void>;
  unstage(paths: string[]): Promise<void>;
  /** Returns git's one-line summary of the new commit. */
  commit(message: string): Promise<string>;
}

export const isUntracked = (f: GitFile) => f.index === "?";
export const isStaged = (f: GitFile) => f.index !== " " && f.index !== "?";
export const isUnstaged = (f: GitFile) => f.worktree !== " ";

const LABELS: Record<string, string> = { M: "Modifié", A: "Ajouté", D: "Supprimé", R: "Renommé", C: "Copié", U: "Conflit", "?": "Nouveau" };
export const statusLabel = (letter: string) => LABELS[letter] ?? letter;

export function tauriGit(root: string): GitApi {
  return {
    status: () => invoke<GitStatus>("git_status", { root }),
    diff: (file, staged) => invoke<string>("git_diff", { root, path: file.path, staged, untracked: isUntracked(file) }),
    stage: (paths) => invoke("git_stage", { root, paths }),
    unstage: (paths) => invoke("git_unstage", { root, paths }),
    commit: (message) => invoke<string>("git_commit", { root, message }),
  };
}

// ---------------------------------------------------------------------------
// Unified diffs

export interface DiffLine {
  kind: "add" | "del" | "ctx" | "note";
  text: string;
  oldNumber?: number;
  newNumber?: number;
}

export interface Hunk {
  header: string;
  lines: DiffLine[];
}

/** Parses `git diff` output (one file) into hunks with line numbers. */
export function parseDiff(diff: string): Hunk[] {
  const hunks: Hunk[] = [];
  let hunk: Hunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  for (const line of diff.split("\n")) {
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (header) {
      hunk = { header: line, lines: [] };
      hunks.push(hunk);
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith("+")) hunk.lines.push({ kind: "add", text: line.slice(1), newNumber: newLine++ });
    else if (line.startsWith("-")) hunk.lines.push({ kind: "del", text: line.slice(1), oldNumber: oldLine++ });
    else if (line.startsWith(" ")) hunk.lines.push({ kind: "ctx", text: line.slice(1), oldNumber: oldLine++, newNumber: newLine++ });
    else if (line.startsWith("\\")) hunk.lines.push({ kind: "note", text: line.slice(2) });
  }
  return hunks;
}

/** Minimal line diff (LCS) producing unified-diff text, used by the in-memory git. */
export function unifiedDiff(before: string, after: string, path: string, context = 3): string {
  const a = before === "" ? [] : before.replace(/\n$/, "").split("\n");
  const b = after === "" ? [] : after.replace(/\n$/, "").split("\n");
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  // Each operation remembers how many old/new lines precede it.
  const ops: { kind: " " | "-" | "+"; text: string; oldBefore: number; newBefore: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const position = { oldBefore: i, newBefore: j };
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ kind: " ", text: a[i], ...position });
      i++;
      j++;
    } else if (i < a.length && (j >= b.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      // Deletions before insertions, like git.
      ops.push({ kind: "-", text: a[i], ...position });
      i++;
    } else {
      ops.push({ kind: "+", text: b[j], ...position });
      j++;
    }
  }
  const changed = ops.map((op, k) => (op.kind !== " " ? k : -1)).filter((k) => k >= 0);
  if (changed.length === 0) return "";
  let out = `--- a/${path}\n+++ b/${path}\n`;
  let start = 0;
  while (start < changed.length) {
    let end = start;
    while (end + 1 < changed.length && changed[end + 1] - changed[end] <= context * 2) end++;
    const slice = ops.slice(Math.max(0, changed[start] - context), Math.min(ops.length, changed[end] + context + 1));
    const oldCount = slice.filter((op) => op.kind !== "+").length;
    const newCount = slice.filter((op) => op.kind !== "-").length;
    // An empty side is numbered after the line preceding the hunk.
    const oldStart = slice[0].oldBefore + (oldCount ? 1 : 0);
    const newStart = slice[0].newBefore + (newCount ? 1 : 0);
    out += `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n`;
    for (const op of slice) out += `${op.kind}${op.text}\n`;
    start = end + 1;
  }
  return out;
}

/**
 * In-memory git over a map of files, for the demo vault: HEAD and index are
 * snapshots of the contents.
 */
export function memoryGit(contents: Map<string, string | Uint8Array>): GitApi {
  const text = (v: string | Uint8Array | undefined) => (v === undefined ? undefined : typeof v === "string" ? v : new TextDecoder().decode(v));
  const snapshot = () => new Map([...contents].map(([k, v]) => [k, text(v)!]));
  let head = snapshot();
  let index = snapshot();
  let commits = 0;
  const letter = (from: Map<string, string>, to: Map<string, string | undefined>, path: string) => {
    const before = from.get(path);
    const after = to.get(path);
    if (before === after) return " ";
    if (before === undefined) return "A";
    if (after === undefined) return "D";
    return "M";
  };
  return {
    status: async () => {
      const work = new Map([...contents].map(([k, v]) => [k, text(v)]));
      const paths = [...new Set([...head.keys(), ...index.keys(), ...work.keys()])].sort();
      const files: GitFile[] = [];
      for (const path of paths) {
        if (!head.has(path) && !index.has(path)) {
          files.push({ path, index: "?", worktree: "?" });
          continue;
        }
        const x = letter(head, index, path);
        const y = letter(index, work, path);
        if (x !== " " || y !== " ") files.push({ path, index: x, worktree: y });
      }
      return { isRepo: true, branch: "main", upstream: "origin/main", ahead: commits, behind: 0, files };
    },
    diff: async (file, staged) => {
      const work = text(contents.get(file.path)) ?? "";
      if (isUntracked(file)) return unifiedDiff("", work, file.path);
      return staged ? unifiedDiff(head.get(file.path) ?? "", index.get(file.path) ?? "", file.path) : unifiedDiff(index.get(file.path) ?? "", work, file.path);
    },
    stage: async (paths) => {
      for (const path of paths) {
        const value = text(contents.get(path));
        if (value === undefined) index.delete(path);
        else index.set(path, value);
      }
    },
    unstage: async (paths) => {
      for (const path of paths) {
        const value = head.get(path);
        if (value === undefined) index.delete(path);
        else index.set(path, value);
      }
    },
    commit: async (message) => {
      if (!message.trim()) throw new Error("Le message de commit est vide.");
      head = new Map(index);
      commits++;
      return `[main ${String(commits).padStart(7, "0")}] ${message.split("\n")[0]}`;
    },
  };
}
