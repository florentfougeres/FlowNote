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

export interface GitCommit {
  hash: string;
  short: string;
  author: string;
  /** ISO 8601. */
  date: string;
  subject: string;
  /** Path of the note in that commit (it may have been renamed since). */
  path: string;
}

/** Error raised by `pull` when the merge stopped on conflicts. */
export class MergeConflictError extends Error {}

export interface GitApi {
  status(): Promise<GitStatus>;
  diff(file: GitFile, staged: boolean): Promise<string>;
  stage(paths: string[]): Promise<void>;
  unstage(paths: string[]): Promise<void>;
  /** Returns git's one-line summary of the new commit. */
  commit(message: string): Promise<string>;
  fetch(): Promise<void>;
  /** Merges the upstream branch (no rebase). Throws MergeConflictError on conflicts. */
  pull(): Promise<string>;
  push(): Promise<string>;
  /** History of a note, newest first, following renames. */
  log(path: string): Promise<GitCommit[]>;
  /** Content of a file at a commit. */
  show(hash: string, path: string): Promise<string>;
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
    fetch: () => invoke("git_fetch", { root }),
    pull: async () => {
      try {
        return await invoke<string>("git_pull", { root });
      } catch (error) {
        const message = String(error);
        if (message.startsWith("CONFLICT:")) throw new MergeConflictError(message.slice("CONFLICT:".length));
        throw new Error(message);
      }
    },
    push: () => invoke<string>("git_push", { root }),
    log: (path) => invoke<GitCommit[]>("git_log", { root, path, limit: 200 }),
    show: (hash, path) => invoke<string>("git_show", { root, hash, path }),
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
  const allA = before === "" ? [] : before.replace(/\n$/, "").split("\n");
  const allB = after === "" ? [] : after.replace(/\n$/, "").split("\n");
  // Only the differing middle needs the quadratic LCS table; common lines around it are kept as context.
  let head = 0;
  while (head < allA.length && head < allB.length && allA[head] === allB[head]) head++;
  let tail = 0;
  while (tail < allA.length - head && tail < allB.length - head && allA[allA.length - 1 - tail] === allB[allB.length - 1 - tail]) tail++;
  const keepHead = Math.max(0, head - context);
  const keepTail = Math.max(0, tail - context);
  const a = allA.slice(keepHead, allA.length - keepTail);
  const b = allB.slice(keepHead, allB.length - keepTail);
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
    const oldStart = keepHead + slice[0].oldBefore + (oldCount ? 1 : 0);
    const newStart = keepHead + slice[0].newBefore + (newCount ? 1 : 0);
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
  const history: { commit: GitCommit; files: Map<string, string> }[] = [
    { commit: { hash: "0".repeat(40), short: "0000000", author: "Démo", date: new Date(Date.now() - 86400000).toISOString(), subject: "Version initiale", path: "" }, files: head },
  ];
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
      const short = String(commits).padStart(7, "0");
      history.unshift({ commit: { hash: short.padEnd(40, "0"), short, author: "Vous", date: new Date().toISOString(), subject: message.split("\n")[0], path: "" }, files: head });
      return `[main ${short}] ${message.split("\n")[0]}`;
    },
    fetch: async () => {},
    pull: async () => "Déjà à jour.",
    push: async () => {
      commits = 0;
      return "Envoyé vers origin/main.";
    },
    log: async (path) => {
      // Commits where the note changed compared with the previous one.
      return history
        .filter((entry, i) => entry.files.has(path) && entry.files.get(path) !== history[i + 1]?.files.get(path))
        .map((entry) => ({ ...entry.commit, path }));
    },
    show: async (hash, path) => history.find((entry) => entry.commit.hash === hash)?.files.get(path) ?? "",
  };
}
