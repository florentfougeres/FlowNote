/**
 * Read-only fidelity check over a vault: for every note, (1) an unedited
 * load/save must be byte-identical and (2) every top-level block must
 * re-serialize to Markdown with the same meaning. Blocks whose re-serialization
 * differs only textually are counted as drift (it would show up in a Git diff
 * if the block were edited).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { schema } from "../editor/schema";
import { loadMarkdown, NoteSession, serializeTopLevelBlockWithReport } from "./note";

const IGNORED_DIRS = new Set([".obsidian", ".git", ".trash", "node_modules"]);

export function* markdownFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) yield* markdownFiles(join(dir, entry.name));
    } else if (entry.name.endsWith(".md")) {
      yield join(dir, entry.name);
    }
  }
}

export interface FidelityReport {
  notes: number;
  blocks: number;
  identityFailures: string[];
  crashes: string[];
  inexact: string[];
  drift: string[];
}

export function checkVault(vault: string): FidelityReport {
  const report: FidelityReport = { notes: 0, blocks: 0, identityFailures: [], crashes: [], inexact: [], drift: [] };
  for (const file of markdownFiles(vault)) {
    const name = relative(vault, file);
    const src = readFileSync(file, "utf8");
    report.notes++;
    try {
      const { doc, layout } = loadMarkdown(src);
      const node = schema.nodeFromJSON(doc);
      if (new NoteSession(layout, node).serialize(node) !== src) report.identityFailures.push(name);
      layout.origins.forEach((origin, i) => {
        report.blocks++;
        const block = serializeTopLevelBlockWithReport(doc.content![i], layout.context);
        const line = src.slice(0, src.indexOf(origin.source)).split("\n").length;
        let at = 0;
        while (at < origin.source.length && origin.source[at] === block.markdown[at]) at++;
        const around = (text: string) => JSON.stringify(text.slice(Math.max(0, at - 40), at + 60));
        const entry = `${name}:${line}\n    source: ${around(origin.source)}\n    output: ${around(block.markdown)}`;
        if (!block.exact) report.inexact.push(entry);
        else if (block.markdown !== origin.source) report.drift.push(entry);
      });
    } catch (error) {
      report.crashes.push(`${name}: ${(error as Error).message}`);
    }
  }
  return report;
}
