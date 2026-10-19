import { Dashboard } from "../Dashboard";
import { docsBridge } from "../docs/docsBridge";
import DOCUMENTATION from "../docs/documentation.md?raw";
import { NoteEditor } from "../editor/NoteEditor";
import { GitPanel } from "../GitPanel";
import { GraphPage } from "../graph/GraphPage";
import { ReadingView } from "../reading/ReadingView";
import { PageIcon } from "../Sidebar";
import type { TicketColumn } from "../ticket/board";
import { TicketsView } from "../ticket/TicketsView";
import { callNative } from "../vault/nativeVault";
import type { Vault, VaultEntry } from "../vault/vault";

/** Views of the app shown in a tab of the native shell instead of a page (`flownote:…`). */
export const SHELL_VIEWS = ["flownote:home", "flownote:tickets", "flownote:graph", "flownote:reading", "flownote:git", "flownote:docs"];

export function ShellView({
  view,
  vault,
  files,
  tree,
  dark,
  readingList,
  onOpen,
  onChanged,
  beforeCommit,
  readingVersion,
  onAddLink,
  columns,
  onColumns,
}: {
  view: string;
  vault: Vault;
  files: string[];
  tree: VaultEntry[];
  dark: boolean;
  readingList: string;
  onOpen: (path: string, newTab: boolean) => void;
  /** Files changed (git, tickets, reading list): the tree is read again. */
  onChanged: () => void;
  /** Writes the open page before a commit. */
  beforeCommit: () => Promise<void>;
  /** Changes when a link was added to the reading list. */
  readingVersion: number;
  onAddLink: () => void;
  columns: TicketColumn[];
  onColumns: (columns: TicketColumn[]) => void;
}) {
  const shell = (command: string, args: Record<string, unknown> = {}) => void callNative(command, args).catch(() => {});
  const entry = (path: string) => findEntry(tree, path);
  switch (view) {
    case "flownote:tickets":
      return (
        <div className="embed-view">
          <TicketsView vault={vault} files={files} columns={columns} onColumns={onColumns} onOpen={onOpen} onCreate={() => shell("new_page", { kind: "ticket" })} onChanged={onChanged} />
        </div>
      );
    case "flownote:graph":
      return (
        <div className="embed-view">
          <GraphPage vault={vault} files={files} onOpen={onOpen} />
        </div>
      );
    case "flownote:reading":
      return (
        <div className="embed-view">
          <ReadingView vault={vault} path={readingList} version={readingVersion} onAdd={onAddLink} onOpenNote={onOpen} onChanged={onChanged} />
        </div>
      );
    case "flownote:git":
      return vault.git ? (
        <div className="embed-view embed-git">
          <GitPanel git={vault.git} beforeCommit={beforeCommit} onOpenNote={(path) => onOpen(path, false)} onChanged={onChanged} onPulled={onChanged} onDiscarded={onChanged} />
        </div>
      ) : (
        <div className="embed-empty">Ce vault n'est pas un dépôt Git.</div>
      );
    case "flownote:docs":
      return (
        <div className="embed-view page docs-page">
          <NoteEditor key={`docs-${dark}`} source={DOCUMENTATION} onMarkdown={() => {}} bridge={docsBridge(dark)} editable={false} properties={false} />
        </div>
      );
    default:
      return (
        <div className="embed-view">
          <Dashboard
            vault={vault}
            files={files}
            iconOf={(path) => {
              const found = entry(path);
              return <PageIcon path={path} icon={found?.icon} ticket={found?.ticket} presentation={found?.presentation} />;
            }}
            onOpen={onOpen}
            onCreate={(kind) => shell("new_page", { kind })}
            onOpenGit={() => onOpen("flownote:git", false)}
            onSearch={() => shell("search")}
            onOpenTickets={(newTab) => onOpen("flownote:tickets", newTab)}
            onOpenGraph={(newTab) => onOpen("flownote:graph", newTab)}
            readingList={readingList}
            readingVersion={readingVersion}
            onOpenReading={(newTab) => onOpen("flownote:reading", newTab)}
            onAddLink={onAddLink}
          />
        </div>
      );
  }
}

function findEntry(entries: VaultEntry[], path: string): VaultEntry | null {
  for (const entry of entries) {
    if (entry.path === path) return entry;
    const found = entry.children ? findEntry(entry.children, path) : null;
    if (found) return found;
  }
  return null;
}
