import { useEffect, useState } from "react";
import type { GitApi } from "../vault/git";
import type { GitBase } from "../editor/gitGutter";

/**
 * A note as in the last commit, for the marks of the changes in the margin;
 * null when the option is off, outside Git, or for a note never committed.
 * Read again when `version` changes (the app's count of changed files, which
 * moves with commits and pulls).
 */
export function useGitBase(git: GitApi | null | undefined, path: string | null | undefined, enabled: boolean, version: unknown): GitBase | null {
  const [base, setBase] = useState<{ path: string; base: GitBase | null } | null>(null);
  useEffect(() => {
    if (!enabled || !git || !path?.endsWith(".md")) return;
    let cancelled = false;
    void (async () => {
      let committed: GitBase | null = null;
      try {
        const head = await git.lastCommit();
        if (head) committed = { text: await git.show(head.hash, path), date: head.date };
      } catch {
        // Never committed (or not readable): no marks.
      }
      if (!cancelled) setBase({ path, base: committed });
    })();
    return () => {
      cancelled = true;
    };
  }, [git, path, enabled, version]);
  // Another note's version is never shown while this one is being read.
  return enabled && base !== null && base.path === path ? base.base : null;
}
