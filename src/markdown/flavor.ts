/**
 * Optional Markdown flavours on top of Obsidian's. MkDocs Material (and
 * Zensical, ProperDocs) adds admonitions (`!!! note`), content tabs
 * (`=== "Tab"`) and inline syntax (`++ctrl++`, icons, attribute lists…). Off
 * by default: the setting is read when a note is parsed and displayed.
 */

let mkdocs = false;

export function setMkdocsSyntax(on: boolean) {
  mkdocs = on;
}

export function mkdocsSyntax(): boolean {
  return mkdocs;
}
