// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { destroyEditors, openEditor, type } from "./testUtils";

afterEach(destroyEditors);

/** A large realistic note: ~6000 blocks, ~400 KB of Markdown. */
function bigNote(): string {
  const parts: string[] = ["---\ntags: [perf]\n---\n"];
  for (let i = 0; i < 1500; i++) {
    parts.push(`## Section ${i}`);
    parts.push(`Un paragraphe avec du **gras**, un [[Lien ${i}]], un #tag/${i} et du \`code\` pour la section ${i}.`);
    parts.push(`- élément ${i}\n- autre élément avec ==surligné==\n  - imbriqué`);
    parts.push(`> [!note] Callout ${i}\n> Contenu du callout.`);
  }
  return parts.join("\n\n") + "\n";
}

describe("performance on a large note", () => {
  it("typing stays fast", () => {
    const src = bigNote();
    const started = performance.now();
    const { editor, save } = openEditor(src);
    const openMs = performance.now() - started;
    const timings: number[] = [];
    for (const char of "abcdefghij") {
      const t = performance.now();
      type(editor, char);
      save();
      timings.push(performance.now() - t);
    }
    timings.sort((a, b) => a - b);
    const median = timings[Math.floor(timings.length / 2)];
    console.log(`taille=${Math.round(src.length / 1024)} Ko, ouverture=${openMs.toFixed(0)} ms, frappe+sérialisation médiane=${median.toFixed(1)} ms, max=${timings.at(-1)!.toFixed(1)} ms`);
    expect(save().endsWith("abcdefghij\n")).toBe(true);
    expect(median).toBeLessThan(50);
    // Opening ~6000 blocks in jsdom takes seconds on slow CI machines; the keystroke budget is what matters.
  }, 60_000);
});
