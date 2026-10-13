import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isStaged, isUnstaged, memoryGit, parseDiff, unifiedDiff } from "./git";

/** Hunks of `git diff --no-index` for two texts (the reference implementation). */
function gitDiff(before: string, after: string): string {
  const dir = mkdtempSync(join(tmpdir(), "mon-notion-diff-"));
  try {
    writeFileSync(join(dir, "a"), before);
    writeFileSync(join(dir, "b"), after);
    try {
      execFileSync("git", ["diff", "--no-index", "--no-color", "a", "b"], { cwd: dir, encoding: "utf8" });
      return "";
    } catch (error) {
      return (error as { stdout: string }).stdout; // exit code 1: files differ
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// git may append a "function context" line after the hunk header: ignore it.
const hunksOnly = (diff: string) => diff.slice(diff.indexOf("@@")).replace(/^(@@ [^@]+ @@).*$/gm, "$1");

describe("parseDiff", () => {
  it("reads hunks with line numbers", () => {
    const hunks = parseDiff(gitDiff("un\ndeux\ntrois\n", "un\n2\ntrois\nquatre\n"));
    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines).toEqual([
      { kind: "ctx", text: "un", oldNumber: 1, newNumber: 1 },
      { kind: "del", text: "deux", oldNumber: 2 },
      { kind: "add", text: "2", newNumber: 2 },
      { kind: "ctx", text: "trois", oldNumber: 3, newNumber: 3 },
      { kind: "add", text: "quatre", newNumber: 4 },
    ]);
  });

  it("keeps the 'no newline at end of file' note", () => {
    const hunks = parseDiff(gitDiff("a\n", "a\nb"));
    expect(hunks[0].lines.at(-1)).toEqual({ kind: "note", text: "No newline at end of file" });
  });
});

describe("unifiedDiff matches git", () => {
  const cases: [string, string][] = [
    ["un\ndeux\ntrois\n", "un\n2\ntrois\n"],
    ["", "nouveau\nfichier\n"],
    ["a\nb\nc\n", ""],
    [Array.from({ length: 30 }, (_, i) => `l${i}`).join("\n") + "\n", Array.from({ length: 30 }, (_, i) => (i === 3 || i === 25 ? `L${i}` : `l${i}`)).join("\n") + "\n"],
  ];
  for (const [before, after] of cases) {
    it(JSON.stringify([before.slice(0, 20), after.slice(0, 20)]), () => {
      expect(hunksOnly(unifiedDiff(before, after, "x"))).toBe(hunksOnly(gitDiff(before, after)));
    });
  }
});

describe("memoryGit", () => {
  it("status, stage, unstage and commit", async () => {
    const files = new Map<string, string | Uint8Array>([["a.md", "un\n"]]);
    const git = memoryGit(files);
    expect((await git.status()).files).toEqual([]);

    files.set("a.md", "un\ndeux\n");
    files.set("b.md", "nouveau\n");
    let status = await git.status();
    expect(status.files).toEqual([
      { path: "a.md", index: " ", worktree: "M" },
      { path: "b.md", index: "?", worktree: "?" },
    ]);
    expect(parseDiff(await git.diff(status.files[0], false))[0].lines.some((l) => l.kind === "add" && l.text === "deux")).toBe(true);

    await git.stage(["a.md", "b.md"]);
    status = await git.status();
    expect(status.files.map((f) => [f.path, isStaged(f), isUnstaged(f)])).toEqual([
      ["a.md", true, false],
      ["b.md", true, false],
    ]);
    await git.unstage(["b.md"]);
    expect((await git.status()).files[1].index).toBe("?");

    await expect(git.commit(" ")).rejects.toThrow();
    expect(await git.commit("Ajoute deux")).toContain("Ajoute deux");
    status = await git.status();
    expect(status.files).toEqual([{ path: "b.md", index: "?", worktree: "?" }]);
    expect(status.ahead).toBe(1);
  });
});

describe("history", () => {
  it("memoryGit lists the commits that changed a note and shows old versions", async () => {
    const files = new Map<string, string | Uint8Array>([["a.md", "v1\n"], ["b.md", "x\n"]]);
    const git = memoryGit(files);
    files.set("a.md", "v2\n");
    await git.stage(["a.md"]);
    await git.commit("Deuxième version");
    files.set("b.md", "y\n");
    await git.stage(["b.md"]);
    await git.commit("Autre note");
    const log = await git.log("a.md");
    expect(log.map((c) => c.subject)).toEqual(["Deuxième version", "Version initiale"]);
    expect(await git.show(log[1].hash, "a.md")).toBe("v1\n");
  });

  it("diffs long notes quickly and numbers hunks correctly", () => {
    const lines = Array.from({ length: 20000 }, (_, i) => `ligne ${i}`);
    const changed = [...lines];
    changed[15000] = "modifiée";
    const started = performance.now();
    const diff = unifiedDiff(lines.join("\n") + "\n", changed.join("\n") + "\n", "x");
    expect(performance.now() - started).toBeLessThan(200);
    expect(diff).toContain("@@ -14998,7 +14998,7 @@");
    expect(hunksOnly(diff)).toBe(hunksOnly(gitDiff(lines.join("\n") + "\n", changed.join("\n") + "\n")));
  });
});
