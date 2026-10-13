// @vitest-environment jsdom
// Opens every note of a real vault in the full editor (read only). Run with:
//   VAULT=/path/to/vault npx vitest run src/editor/vault-render.test.ts
import { it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { destroyEditors, openEditor } from "./testUtils";

const vault = process.env.VAULT;

function* notes(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    if (e.isDirectory()) yield* notes(join(dir, e.name));
    else if (e.name.endsWith(".md")) yield join(dir, e.name);
  }
}

it.skipIf(!vault)("every note opens in the editor", () => {
  const failures: string[] = [];
  let count = 0;
  for (const file of notes(vault!)) {
    count++;
    try {
      const { save } = openEditor(readFileSync(file, "utf8"));
      save();
    } catch (error) {
      failures.push(`${relative(vault!, file)}: ${(error as Error).message}\n${(error as Error).stack?.split("\n").slice(1, 4).join("\n")}`);
    } finally {
      destroyEditors();
    }
  }
  console.log(`${count} notes, ${failures.length} échec(s)`);
  for (const f of failures.slice(0, 10)) console.log(f);
});
