import type { Editor } from "@tiptap/core";
import { attachmentFolder, DEFAULT_CONFIG, IMAGE_EXTENSIONS, extension, linkTextFor, relativePath, uniquePath, type ObsidianConfig } from "../vault/links";
import type { VaultSnapshot } from "../query/pages";

/**
 * What the editor needs from the vault. The app keeps one mutable bridge per
 * editor and updates it (current note, file list) without recreating the editor.
 */
export interface VaultBridge {
  notePath: string;
  files: string[];
  config: ObsidianConfig;
  /** Object URL for an image of the vault. */
  loadImage(path: string): Promise<string>;
  /** Opens a page (in a new tab with ⌘-click). */
  openPath(path: string, newTab?: boolean): void;
  /** Asks the user for a name (null when cancelled). */
  askName(title: string, initial: string): Promise<string | null>;
  /** Creates a file and adds it to `files`. */
  createFile(path: string, content: string | Uint8Array): Promise<void>;
  /** Shows a base (`![[X.base]]`) in `dom`; returns how to remove it. */
  mountBase?(dom: HTMLElement, path: string): () => void;
  /** Text of a note, for the notes embedded with `![[Note]]`. */
  readNote?(path: string): Promise<string>;
  /** Every note with its dates, for the Dataview and Tasks blocks. */
  queryVault?(): Promise<VaultSnapshot>;
  /** Checks or unchecks a task (0-based line) in its note, from a query's results. */
  toggleTask?(path: string, line: number, done: boolean): Promise<void>;
  /** How many notes embed this one (`![[…]]` inside `![[…]]`), to stop at a depth. */
  embedDepth?: number;
}

export interface BridgeRef {
  current: VaultBridge;
}

export const NULL_BRIDGE: VaultBridge = {
  notePath: "",
  files: [],
  config: DEFAULT_CONFIG,
  loadImage: async () => "",
  openPath: () => {},
  askName: async () => null,
  createFile: async () => {},
};

const MIME: Record<string, string> = { svg: "image/svg+xml", jpg: "image/jpeg" };

export function imageMime(path: string): string {
  const ext = extension(path);
  return MIME[ext] ?? `image/${ext}`;
}

export function isImage(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extension(path));
}

/**
 * Saves dropped or pasted files as attachments (folder from Obsidian settings)
 * and inserts an embed for each at `pos`, like Obsidian does.
 */
export async function insertAttachments(editor: Editor, bridge: VaultBridge, files: { name: string; bytes: Uint8Array }[], pos: number) {
  const nodes = [];
  for (const file of files) {
    const path = uniquePath(attachmentFolder(bridge.notePath, bridge.config), file.name, bridge.files);
    await bridge.createFile(path, file.bytes);
    if (bridge.config.useMarkdownLinks) {
      const src = encodeURI(relativePath(bridge.notePath, path));
      nodes.push(editor.schema.nodes.image.create({ src, alt: file.name, raw: `![${file.name}](${src})` }));
    } else {
      nodes.push(editor.schema.nodes.wikilink.create({ target: linkTextFor(path, bridge.files), alias: null, embed: true }));
    }
  }
  const at = Math.min(pos, editor.state.doc.content.size);
  editor.chain().focus().insertContentAt(at, nodes.map((n) => n.toJSON())).run();
}
