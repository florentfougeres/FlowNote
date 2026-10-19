import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The contract between the web app and its backend: every command it calls
 * exists on the other side. A renamed or removed command fails here, not in
 * the hands of a user.
 */

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

function sources(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

const code = sources("src").map((path) => ({ path, text: read(path) }));
const called = (pattern: RegExp) => [...new Set(code.flatMap(({ text }) => [...text.matchAll(pattern)].map((m) => m[1])))].sort();

describe("the backend contract", () => {
  it("every command of backend() is dispatched by the Rust core", () => {
    const listed = read("src-tauri/core/src/backend.rs").split("pub const COMMANDS")[1].split("];")[0];
    const commands = new Set([...listed.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
    const used = called(/\bbackend(?:<[^>(]*>)?\("([a-z_]+)"/g);
    expect(used.length).toBeGreaterThan(30);
    expect(used.filter((name) => !commands.has(name))).toEqual([]);
  });

  it("every direct Tauri command is registered by the Tauri app", () => {
    const registered = read("src-tauri/src/lib.rs").split("generate_handler![")[1].split("]")[0];
    const used = called(/\binvoke(?:<[^>(]*>)?\("([a-z_]+)"/g);
    expect(used.filter((name) => !registered.includes(name))).toEqual([]);
  });
});
