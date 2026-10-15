import { describe, expect, it } from "vitest";
import { withNoteCache } from "./noteCache";
import { createMemoryVault, readAllNotes, type Vault } from "./vault";

/** A memory vault counting its full reads. */
function counted(files: Record<string, string>) {
  const inner = createMemoryVault("Test", files);
  const counts = { all: 0 };
  const vault: Vault = Object.assign(Object.create(inner) as Vault, {
    readNotes: async () => {
      counts.all++;
      const notes = (await inner.files()).filter((f) => f.endsWith(".md"));
      return Promise.all(notes.map(async (f): Promise<[string, string]> => [f, await inner.read(f)]));
    },
  });
  return { vault: withNoteCache(vault), counts };
}

const sorted = (notes: [string, string][]) => [...notes].sort(([a], [b]) => (a < b ? -1 : 1));

describe("withNoteCache", () => {
  it("reads every note once, follows the app's own changes, reads again after a clear", async () => {
    const { vault, counts } = counted({ "a.md": "A", "Dossier/b.md": "B", "img.png": "" });
    const files = await vault.files();
    expect(sorted(await readAllNotes(vault, files))).toEqual([["Dossier/b.md", "B"], ["a.md", "A"]]);

    await vault.write("a.md", "A2", "A");
    await vault.create("c.md", "C");
    await vault.rename("Dossier", "Classeur");
    expect(sorted(await readAllNotes(vault, files))).toEqual([["Classeur/b.md", "B"], ["a.md", "A2"], ["c.md", "C"]]);
    await vault.remove("Classeur");
    expect(sorted(await readAllNotes(vault, files))).toEqual([["a.md", "A2"], ["c.md", "C"]]);
    expect(counts.all).toBe(1);

    vault.clearNoteCache();
    await readAllNotes(vault, files);
    expect(counts.all).toBe(2);
    // Everything else is the vault's own.
    expect(vault.name).toBe("Test");
    expect(await vault.read("c.md")).toBe("C");
  });
});
