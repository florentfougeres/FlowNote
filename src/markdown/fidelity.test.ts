// @vitest-environment jsdom
// Fidelity over the sample vault in fixtures/vault: every note must survive an
// unedited load/save byte for byte, also through the full editor.
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { checkVault, markdownFiles } from "./fidelity";
import { destroyEditors, openEditor } from "../editor/testUtils";

const vault = resolve(__dirname, "../../fixtures/vault");

describe("sample vault", () => {
  afterEach(destroyEditors);

  it("no note changes, crashes or loses meaning when saved unedited", () => {
    const report = checkVault(vault);
    expect(report.notes).toBeGreaterThan(10);
    expect(report.identityFailures).toEqual([]);
    expect(report.crashes).toEqual([]);
    expect(report.inexact).toEqual([]);
  });

  it("every note opens in the editor and saves byte-identical", () => {
    const changed: string[] = [];
    for (const file of markdownFiles(vault)) {
      const source = readFileSync(file, "utf8");
      const { save } = openEditor(source);
      if (save() !== source) changed.push(relative(vault, file));
      destroyEditors();
    }
    expect(changed).toEqual([]);
  });
});
