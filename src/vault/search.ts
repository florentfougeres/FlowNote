import type { Vault } from "./vault";

/** One occurrence of the query in a note. */
export interface SearchHit {
  path: string;
  /** 0-based line number in the file. */
  line: number;
  text: string;
  /** Start and end of the match in `text`. */
  from: number;
  to: number;
}

export const SEARCH_LIMIT = 500;

/** Occurrences of `query` in one line (several per line are reported separately). */
export function matchesIn(text: string, query: string, caseSensitive: boolean): [number, number][] {
  if (!query) return [];
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  // Lowercasing can change lengths (rare Unicode cases): fall back to whole-line hits.
  if (haystack.length !== text.length) return haystack.includes(needle) ? [[0, 0]] : [];
  const found: [number, number][] = [];
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) found.push([at, at + needle.length]);
  return found;
}

function hitsOf(path: string, lines: [number, string][], query: string, caseSensitive: boolean): SearchHit[] {
  return lines.flatMap(([line, text]) => matchesIn(text, query, caseSensitive).map(([from, to]) => ({ path, line, text, from, to })));
}

/** Searches every note of the vault; results grouped by file, in path order. */
export async function searchVault(vault: Vault, query: string, caseSensitive = false, limit = SEARCH_LIMIT): Promise<SearchHit[]> {
  if (!query.trim()) return [];
  if (vault.search) {
    const files = await vault.search(query, caseSensitive, limit);
    return files.flatMap((file) => hitsOf(file.path, file.lines, query, caseSensitive));
  }
  const hits: SearchHit[] = [];
  const notes = (await vault.files()).filter((path) => path.endsWith(".md"));
  for (const path of notes) {
    let text: string;
    try {
      text = await vault.read(path);
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/).map((line, n) => [n, line] as [number, string]);
    hits.push(...hitsOf(path, lines, query, caseSensitive));
    if (hits.length >= limit) break;
  }
  return hits.slice(0, limit);
}
