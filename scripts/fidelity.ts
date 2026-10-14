/**
 * Read-only fidelity check over a vault (see src/markdown/fidelity.ts):
 *   npm run fidelity -- /path/to/vault
 */
import { checkVault } from "../src/markdown/fidelity";

const vault = process.argv[2];
if (!vault) {
  console.error("Usage: npm run fidelity -- /path/to/vault");
  process.exit(1);
}

const { notes, blocks, identityFailures, crashes, inexact, drift } = checkVault(vault);
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
