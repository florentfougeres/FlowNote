import { noteTags } from "../dashboard/stats";
import { readProperties } from "../markdown/frontmatter";
import { dirname } from "./links";

/**
 * Filters of the vault search (⌘⇧F): by tag, folder, property value or
 * modification date. Typed with Obsidian's search syntax (`tag:#projet`,
 * `path:Projets`, `[statut:fait]`, `[statut]`) or picked from the menu; the
 * search then only looks in the notes that pass every filter.
 */
export type SearchFilter =
  | { kind: "tag"; tag: string }
  | { kind: "folder"; folder: string }
  /** `value` null: the property is filled, whatever its value. */
  | { kind: "property"; key: string; value: string | null }
  /** Inclusive local days (YYYY-MM-DD), either end open. */
  | { kind: "modified"; from: string | null; to: string | null; label: string };

/** What the filters look at in one note. */
export interface NoteFacts {
  path: string;
  /** Lowercase, without `#`. */
  tags: string[];
  /** Property values as text (a list gives one per item), by key. */
  properties: Map<string, string[]>;
  /** Modification time (ms), when the vault knows it. */
  mtime: number | null;
}

const FRONTMATTER = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function noteFacts(path: string, text: string, mtime: number | null = null): NoteFacts {
  const properties = new Map<string, string[]>();
  const yaml = FRONTMATTER.exec(text)?.[1];
  if (yaml !== undefined) {
    for (const { key, value } of readProperties(`---\n${yaml.replace(/\r\n/g, "\n")}\n---`).properties) {
      const values = (Array.isArray(value) ? value : value === null ? [] : [String(value)]).map((v) => v.trim()).filter(Boolean);
      properties.set(key, values);
    }
  }
  return { path, tags: [...new Set(noteTags(text).map((t) => t.toLowerCase()))], properties, mtime };
}

/** Local day of a time, YYYY-MM-DD. */
export function localDay(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function passes(note: NoteFacts, filter: SearchFilter): boolean {
  switch (filter.kind) {
    case "tag": {
      // Like Obsidian, a tag also finds its nested tags (#projet finds #projet/site).
      const tag = filter.tag.toLowerCase();
      return note.tags.some((t) => t === tag || t.startsWith(`${tag}/`));
    }
    case "folder":
      return note.path.startsWith(`${filter.folder}/`);
    case "property": {
      const key = [...note.properties.keys()].find((k) => k.toLowerCase() === filter.key.toLowerCase());
      const values = key === undefined ? [] : note.properties.get(key)!;
      return filter.value === null ? values.length > 0 : values.some((v) => v.toLowerCase() === filter.value!.toLowerCase());
    }
    case "modified": {
      if (note.mtime === null) return false;
      const day = localDay(note.mtime);
      return (filter.from === null || day >= filter.from) && (filter.to === null || day <= filter.to);
    }
  }
}

export function matchesFilters(note: NoteFacts, filters: SearchFilter[]): boolean {
  return filters.every((f) => passes(note, f));
}

export function sameFilter(a: SearchFilter, b: SearchFilter): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Text of a filter's chip. */
export function filterLabel(filter: SearchFilter): string {
  switch (filter.kind) {
    case "tag":
      return `#${filter.tag}`;
    case "folder":
      return filter.folder;
    case "property":
      return filter.value === null ? `${filter.key} renseignée` : `${filter.key} : ${filter.value}`;
    case "modified":
      return filter.label;
  }
}

/** Choices of the filter menu: tags by use, folders, properties with their values. */
export function filterChoices(notes: NoteFacts[]): { tags: [string, number][]; folders: string[]; properties: Map<string, string[]> } {
  const tags = new Map<string, number>();
  const folders = new Set<string>();
  const properties = new Map<string, Set<string>>();
  for (const note of notes) {
    for (const tag of note.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    for (let dir = dirname(note.path); dir; dir = dirname(dir)) folders.add(dir);
    for (const [key, values] of note.properties) {
      const known = properties.get(key) ?? new Set<string>();
      for (const v of values) known.add(v);
      properties.set(key, known);
    }
  }
  const byName = (a: string, b: string) => a.localeCompare(b, "fr");
  return {
    tags: [...tags].sort((a, b) => b[1] - a[1] || byName(a[0], b[0])),
    folders: [...folders].sort(byName),
    properties: new Map([...properties].sort((a, b) => byName(a[0], b[0])).map(([k, v]) => [k, [...v].sort(byName)])),
  };
}

/** Quick periods of the date filter, ending today. */
export function modifiedPresets(today = new Date()): Extract<SearchFilter, { kind: "modified" }>[] {
  const daysAgo = (n: number) => localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n, 12).getTime());
  return [
    { kind: "modified", from: daysAgo(0), to: null, label: "Modifiée aujourd'hui" },
    { kind: "modified", from: daysAgo(6), to: null, label: "7 derniers jours" },
    { kind: "modified", from: daysAgo(29), to: null, label: "30 derniers jours" },
    { kind: "modified", from: `${today.getFullYear()}-01-01`, to: null, label: "Cette année" },
  ];
}

const TOKEN = /(^|\s)(tag:#?([^\s#"[\]]+)|path:(?:"([^"]+)"|([^\s"]+))|\[([^\]:]+)(?::\s*(?:"([^"]*)"|([^\]]*)))?\])(?=\s|$)/g;

/**
 * Takes the filters written in the search field out of it. Only tokens
 * followed by a space are taken while typing (`complete` false), so that
 * `tag:#pro` is not a filter before `#projet` is finished; Enter takes them all.
 */
export function extractFilters(input: string, complete = false): { text: string; filters: SearchFilter[] } {
  const filters: SearchFilter[] = [];
  const text = input.replace(TOKEN, (token: string, lead: string, _whole: string, tag?: string, quoted?: string, bare?: string, key?: string, quotedValue?: string, value?: string, offset?: number) => {
    if (!complete && (offset ?? 0) + token.length >= input.length) return token;
    if (tag) filters.push({ kind: "tag", tag: tag.toLowerCase() });
    else if (quoted ?? bare) filters.push({ kind: "folder", folder: (quoted ?? bare)!.replace(/\/+$/, "") });
    else if (key) {
      const v = (quotedValue ?? value)?.trim();
      filters.push({ kind: "property", key: key.trim(), value: v ? v : null });
    }
    return lead;
  });
  return { text: filters.length ? text.replace(/\s{2,}/g, " ").trimStart() : input, filters };
}
