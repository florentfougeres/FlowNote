/**
 * Presentations are notes with `marp: true` in their properties. This module
 * stays light (no Marp): the vault tree and the graph use it.
 */

import { splitFrontmatter } from "../markdown/frontmatter";

/** True when the front matter says `marp: true`. */
export function isPresentationMarkdown(markdown: string): boolean {
  const yaml = splitFrontmatter(markdown)?.yaml;
  return yaml !== undefined && /^marp[ \t]*:[ \t]*["']?true["']?[ \t]*$/m.test(yaml);
}

/** A new presentation: a title slide and a content slide. */
export function newPresentationFile(title: string): string {
  return [
    "---",
    "marp: true",
    "theme: default",
    "paginate: true",
    "---",
    "",
    `# ${title}`,
    "",
    "Sous-titre",
    "",
    "---",
    "",
    "## Première partie",
    "",
    "- Un point",
    "- Un autre point",
    "",
    "<!-- Notes de l'orateur : elles ne s'affichent que dans la vue présentateur. -->",
    "",
  ].join("\n");
}
