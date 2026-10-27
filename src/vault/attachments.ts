import { attachmentFolder, basename, dirname, linkedFiles, type ObsidianConfig } from "./links";
import { readAllNotes, type Vault } from "./vault";

/**
 * The attachments of a note (images, PDF… next to it) follow it: moved with
 * it, offered for the trash with it. Those that no page uses any more are
 * listed on the dashboard.
 */

const PAGE = /\.(?:md|base|canvas)$/i;

/** Every page with its text: the notes (`notes` when already read), and the canvases and bases, which can name files too. */
export async function readPages(vault: Vault, files: string[], notes?: [string, string][]): Promise<[string, string][]> {
  const others = files.filter((f) => /\.(?:base|canvas)$/i.test(f));
  return [...(notes ?? (await readAllNotes(vault, files))), ...(await Promise.all(others.map(async (f): Promise<[string, string]> => [f, await vault.read(f).catch(() => "")])))];
}

/** The setting gives each note's folder its attachments (FlowNote's `attachments` next to the note, or Obsidian's `./…`), not one folder for the vault. */
export function attachmentsBesideNotes(config: ObsidianConfig): boolean {
  const setting = config.attachmentFolderPath.trim();
  return setting === "" || setting === "/" || setting === "." || setting.startsWith("./");
}

/** The text names the file in any way (a link, HTML, a canvas, a property): a cautious "used". */
function mentions(text: string, path: string): boolean {
  const name = basename(path);
  return text.includes(name) || text.includes(encodeURI(name)) || text.includes(encodeURIComponent(name));
}

/**
 * The attachments that belong to the note at `notePath`: files it links to
 * or embeds, kept in its own attachment folder, that no other page names.
 * None with an attachment folder for the whole vault.
 */
export function ownAttachments(notePath: string, pages: [string, string][], files: string[], config: ObsidianConfig): string[] {
  const text = pages.find(([path]) => path === notePath)?.[1];
  if (text === undefined || !attachmentsBesideNotes(config)) return [];
  const folder = attachmentFolder(notePath, config);
  return linkedFiles(text, notePath, files).filter((file) => !PAGE.test(file) && dirname(file) === folder && !pages.some(([path, other]) => path !== notePath && mentions(other, file)));
}

/** Attachments that no page names, sorted. */
export function unusedAttachments(pages: [string, string][], files: string[]): string[] {
  const used = new Set<string>();
  for (const [path, text] of pages) for (const file of linkedFiles(text, path, files)) used.add(file);
  // A name not linked may still be written elsewhere (HTML, a canvas, a property): one search through all the text, for the few left.
  const all = pages.map(([, text]) => text).join("\n");
  return files.filter((file) => !PAGE.test(file) && !used.has(file) && !mentions(all, file)).sort((a, b) => a.localeCompare(b, "fr"));
}
