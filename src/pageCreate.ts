import { BASE_SUFFIX, newBaseFile } from "./base/baseFile";
import { DRAWING_SUFFIX, newDrawingFile } from "./drawing/format";
import { MINDMAP_SUFFIX, newMindmapFile } from "./mindmap/format";
import type { PageKind } from "./pageKinds";
import { newPresentationFile } from "./presentation/format";
import { ticketInfo } from "./ticket/agenda";
import { newTicketFile, nextTicketId } from "./ticket/format";
import { linkTextFor, sanitizeName, subpageFolder, uniquePath } from "./vault/links";
import type { Vault, VaultEntry } from "./vault/vault";

export interface NewPage {
  kind: PageKind;
  name: string;
  /** Folder of the page (tickets go to `ticketsFolder` instead). */
  folder: string;
  ticketsFolder: string;
}

/** Notes of the tree that are tickets. */
export function ticketPathsOf(tree: VaultEntry[]): Set<string> {
  const found = new Set<string>();
  const walk = (entries: VaultEntry[]) => entries.forEach((e) => (e.ticket ? found.add(e.path) : e.children && walk(e.children)));
  walk(tree);
  return found;
}

/**
 * Path and content of a new page: tickets numbered in their folder
 * ("Tickets/12 - Titre.md"), the other kinds with their suffix.
 */
export async function planPage(vault: Vault, files: string[], tickets: Iterable<string>, page: NewPage): Promise<{ path: string; content: string }> {
  const title = sanitizeName(page.name) || "Sans titre";
  const { kind } = page;
  if (kind === "ticket") {
    const usedIds = await Promise.all([...tickets].map((p) => vault.read(p).then((text) => ticketInfo(p, text).id ?? 0, () => 0)));
    const id = nextTicketId(files, page.ticketsFolder, usedIds);
    return { path: uniquePath(page.ticketsFolder, `${id} - ${title}.md`, files), content: newTicketFile(id) };
  }
  const suffix = kind === "drawing" ? DRAWING_SUFFIX : kind === "mindmap" ? MINDMAP_SUFFIX : kind === "base" ? BASE_SUFFIX : ".md";
  const path = uniquePath(page.folder, `${title}${suffix}`, files);
  // A base's rows are the notes of the folder named after it, next to it (like sub-pages).
  const content =
    kind === "base"
      ? newBaseFile(subpageFolder(path))
      : kind === "drawing"
        ? newDrawingFile()
        : kind === "mindmap"
          ? newMindmapFile(title)
          : kind === "presentation"
            ? newPresentationFile(title)
            : `# ${title}\n`;
  return { path, content };
}

/** Links a new sub-page at the end of its parent. */
export async function linkFromParent(vault: Vault, parent: string, path: string, files: string[]) {
  const content = await vault.read(parent);
  const separator = content === "" ? "" : content.endsWith("\n") ? "\n" : "\n\n";
  await vault.write(parent, `${content}${separator}[[${linkTextFor(path, files)}]]\n`, content);
}
