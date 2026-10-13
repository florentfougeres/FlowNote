/**
 * Read-only fidelity check over a vault:
 *   npm run fidelity -- /path/to/vault
 *
 * For every note it checks that (1) an unedited load/save is byte-identical and
 * (2) every top-level block re-serializes to Markdown with the same meaning.
 * It also counts blocks whose re-serialization differs textually (style drift
 * that would show up in a Git diff if the block were edited).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { schema } from "../src/editor/schema";
import { loadMarkdown, NoteSession, serializeTopLevelBlockWithReport } from "../src/markdown/note";

const IGNORED_DIRS = new Set([".obsidian", ".git", ".trash", "node_modules"]);

function* markdownFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) yield* markdownFiles(join(dir, entry.name));
    } else if (entry.name.endsWith(".md")) {
      yield join(dir, entry.name);
    }
  }
}

const vault = process.argv[2];
if (!vault) {
  console.error("Usage: npm run fidelity -- /path/to/vault");
  process.exit(1);
}

let notes = 0;
let blocks = 0;
const identityFailures: string[] = [];
const crashes: string[] = [];
const inexact: string[] = [];
const drift: string[] = [];

for (const file of markdownFiles(vault)) {
  const name = relative(vault, file);
  const src = readFileSync(file, "utf8");
  notes++;
  try {
    const { doc, layout } = loadMarkdown(src);
    const node = schema.nodeFromJSON(doc);
    if (new NoteSession(layout, node).serialize(node) !== src) identityFailures.push(name);
    layout.origins.forEach((origin, i) => {
      blocks++;
      const report = serializeTopLevelBlockWithReport(doc.content![i], layout.context);
      const line = src.slice(0, src.indexOf(origin.source)).split("\n").length;
      let at = 0;
      while (at < origin.source.length && origin.source[at] === report.markdown[at]) at++;
      const around = (text: string) => JSON.stringify(text.slice(Math.max(0, at - 40), at + 60));
      const entry = `${name}:${line}\n    source: ${around(origin.source)}\n    output: ${around(report.markdown)}`;
      if (!report.exact) inexact.push(entry);
      else if (report.markdown !== origin.source) drift.push(entry);
    });
  } catch (error) {
    crashes.push(`${name}: ${(error as Error).message}`);
  }
}

const pct = (n: number, total: number) => (total ? ((100 * n) / total).toFixed(2) : "0.00");
console.log(`Notes: ${notes}, blocks: ${blocks}`);
console.log(`Unedited save not byte-identical: ${identityFailures.length}`);
console.log(`Crashes: ${crashes.length}`);
console.log(`Blocks whose meaning changes when re-serialized: ${inexact.length} (${pct(inexact.length, blocks)}%)`);
console.log(`Blocks with textual drift when re-serialized: ${drift.length} (${pct(drift.length, blocks)}%)`);
const show = (title: string, list: string[]) => {
  if (list.length === 0) return;
  console.log(`\n== ${title} (first 15)`);
  for (const item of list.slice(0, 15)) console.log(`  ${item}`);
};
show("Not byte-identical", identityFailures);
show("Crashes", crashes);
show("Meaning changes", inexact);
show("Textual drift", drift);
process.exit(identityFailures.length + crashes.length + inexact.length > 0 ? 1 : 0);
