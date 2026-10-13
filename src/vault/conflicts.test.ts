import { describe, expect, it } from "vitest";
import { conflictCount, hasConflictMarkers, parseConflicts, resolveConflicts } from "./conflicts";

const FILE = `# Titre
intro
<<<<<<< HEAD
ma ligne
=======
leur ligne
>>>>>>> origin/main
milieu
<<<<<<< HEAD
a
||||||| base
ancêtre
=======
b
>>>>>>> origin/main
fin
`;

describe("conflict markers", () => {
  it("detects and parses conflicts, with or without the base section", () => {
    expect(hasConflictMarkers(FILE)).toBe(true);
    expect(hasConflictMarkers("Une ligne\n======= pas un marqueur\n")).toBe(false);
    const segments = parseConflicts(FILE);
    expect(conflictCount(segments)).toBe(2);
    expect(segments[1]).toEqual({ kind: "conflict", ours: "ma ligne\n", base: null, theirs: "leur ligne\n", oursLabel: "HEAD", theirsLabel: "origin/main" });
    expect(segments[3]).toMatchObject({ ours: "a\n", base: "ancêtre\n", theirs: "b\n" });
  });

  it("resolves each conflict with the chosen side", () => {
    const segments = parseConflicts(FILE);
    expect(resolveConflicts(segments, ["ours", "theirs"])).toBe("# Titre\nintro\nma ligne\nmilieu\nb\nfin\n");
    expect(resolveConflicts(segments, ["both", "ours"])).toBe("# Titre\nintro\nma ligne\nleur ligne\nmilieu\na\nfin\n");
  });

  it("keeps markers for undecided conflicts and round-trips the file", () => {
    const segments = parseConflicts(FILE);
    expect(resolveConflicts(segments, [undefined, undefined])).toBe(FILE);
    expect(hasConflictMarkers(resolveConflicts(segments, ["ours", undefined]))).toBe(true);
  });

  it("leaves unbalanced markers as text", () => {
    const text = "<<<<<<< HEAD\nsans fin\n";
    expect(parseConflicts(text)).toEqual([{ kind: "text", text }]);
  });
});
