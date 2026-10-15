import type { Vault } from "./vault";

/**
 * A vault whose notes are read in full once, for the views that read them
 * all (dashboard, graph, tickets, bases, backlinks): `readNotes` is served
 * from memory. The app's own writes, creations, renames and removals keep the
 * copy up to date as they go through; `clearNoteCache` forgets it when files
 * may have changed elsewhere (Obsidian, git).
 */
export type CachedVault = Vault & { clearNoteCache(): void };

export function withNoteCache(vault: Vault): CachedVault {
  let texts: Map<string, string> | null = null;
  let loading: Promise<Map<string, string>> | null = null;
  /** Bumped by a clear: a read started before is not kept. */
  let generation = 0;

  const readAll = async (): Promise<Map<string, string>> => {
    if (vault.readNotes) return new Map(await vault.readNotes());
    const notes = (await vault.files()).filter((f) => f.endsWith(".md"));
    return new Map(await Promise.all(notes.map(async (f): Promise<[string, string]> => [f, await vault.read(f).catch(() => "")])));
  };
  const load = (): Promise<Map<string, string>> => {
    if (texts) return Promise.resolve(texts);
    if (!loading) {
      const started = generation;
      loading = readAll().then((read) => {
        if (started === generation) {
          texts = read;
          loading = null;
        }
        return read;
      });
    }
    return loading;
  };
  const clear = () => {
    generation++;
    texts = null;
    loading = null;
  };
  const inside = (path: string, target: string) => path === target || path.startsWith(`${target}/`);

  const overrides: Partial<CachedVault> = {
    readNotes: async () => [...(await load())],
    write: async (path, content, expected) => {
      await vault.write(path, content, expected);
      if (path.endsWith(".md")) texts?.set(path, content);
    },
    create: async (path, content) => {
      await vault.create(path, content);
      if (path.endsWith(".md") && typeof content === "string") texts?.set(path, content);
    },
    rename: async (from, to) => {
      await vault.rename(from, to);
      if (!texts) return;
      // A copy: entries are moved while going through them.
      for (const [path, text] of Array.from(texts)) {
        if (!inside(path, from)) continue;
        texts.delete(path);
        texts.set(to + path.slice(from.length), text);
      }
    },
    remove: async (path) => {
      await vault.remove(path);
      if (texts) for (const note of Array.from(texts.keys())) if (inside(note, path)) texts.delete(note);
    },
    clearNoteCache: clear,
  };
  return new Proxy(vault, {
    get(target, property) {
      if (Object.hasOwn(overrides, property)) return overrides[property as keyof CachedVault];
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as CachedVault;
}
