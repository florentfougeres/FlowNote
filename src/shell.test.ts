import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { SHELL_CALL_NAMES } from "./shell";

/**
 * The contract between the app and the native shell (FlowNote Swift): every
 * name the Swift code uses exists on the app's side, and the other way round.
 * Renaming a sidebar handler, a shell call or a state field fails here.
 */

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const files = (dir: string, extension: RegExp): string[] =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) return files(path, extension);
    return extension.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
const swift = files("native/Sources/FlowNote", /\.swift$/).map(read).join("\n");
const web = files("src", /\.tsx?$/).map(read).join("\n");
const names = (text: string, pattern: RegExp) => [...new Set([...text.matchAll(pattern)].map((m) => m[1]))].sort();

describe("the native shell's contract", () => {
  it("every call the shell makes is one the app answers (ShellCalls)", () => {
    const used = names(swift, /\bcall\("([a-zA-Z]+)"/g).concat(names(swift, /flownoteShell\?\.call\('([a-zA-Z]+)'/g));
    expect(used.length).toBeGreaterThan(10);
    expect(used.filter((name) => !(SHELL_CALL_NAMES as readonly string[]).includes(name))).toEqual([]);
  });

  it("every sidebar action is a handler of the web sidebar (Sidebar.tsx)", () => {
    const props = read("src/Sidebar.tsx");
    const used = names(swift, /\.sidebar\("(on[A-Za-z]+)"/g);
    expect(used.length).toBeGreaterThan(3);
    expect(used.filter((name) => !new RegExp(`\\b${name}\\??:`).test(props))).toEqual([]);
  });

  it("every state field the shell reads is sent by the app (ShellState)", () => {
    const declared = read("src/shell.ts");
    const state = declared.slice(declared.indexOf("export interface ShellState"), declared.indexOf("export interface ShellLaunch"));
    const tab = declared.slice(declared.indexOf("export interface ShellTab"), declared.indexOf("export interface ShellState"));
    const used = names(read("native/Sources/FlowNote/WindowModel.swift"), /(?:state|item|live)\["([a-zA-Z]+)"\]/g);
    expect(used.filter((name) => !new RegExp(`\\b${name}\\??:`).test(state + tab) && name !== "path" && name !== "icon" && name !== "title")).toEqual([]);
  });

  it("every callNative() of the app is answered by the shell (WebPage.swift)", () => {
    const used = names(web, /\bcallNative(?:<[^>(]*>)?\("([a-z_]+)"/g);
    expect(used.length).toBeGreaterThan(5);
    expect(used.filter((name) => !swift.includes(`case "${name}"`))).toEqual([]);
  });

  it("every backend command the shell runs exists in the Rust core", () => {
    const listed = read("src-tauri/core/src/backend.rs").split("pub const COMMANDS")[1].split("];")[0];
    const used = names(swift, /Backend\.call\("([a-z_]+)"/g);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !listed.includes(`"${name}"`))).toEqual([]);
  });
});
