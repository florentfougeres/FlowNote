import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { NoteEditor } from "../NoteEditor";
import type { VaultBridge } from "../bridge";
import { embedSection } from "../../markdown/sections";

/**
 * A note shown inside another (`![[Note]]`, `![[Note#Titre]]`, `![[Note#^id]]`):
 * its text, read only, drawn by the note editor. An embed inside an embed
 * is drawn too, down to a few levels (a note embedding itself stops there).
 */
function NoteEmbed({ path, subpath, bridge }: { path: string; subpath: string; bridge: VaultBridge }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    bridge.readNote!(path).then(
      (markdown) => {
        if (!live) return;
        const part = embedSection(markdown, subpath);
        if (part === null) setError(`« ${subpath} » introuvable dans la note.`);
        // Block ids (` ^id`) are markers, not text: hidden like in Obsidian's reading view.
        else setText(part.replace(/[ \t]\^[\w-]+[ \t]*$/gm, ""));
      },
      (e: unknown) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, [path, subpath, bridge]);
  // The embedded note's links resolve from its own folder, one level deeper.
  const inner = useMemo(
    () =>
      Object.create(bridge, {
        notePath: { value: path },
        embedDepth: { value: (bridge.embedDepth ?? 0) + 1 },
      }) as VaultBridge,
    [bridge, path],
  );
  if (error) return <p className="embed-note-message">{error}</p>;
  if (text === null) return <p className="embed-note-message">Lecture…</p>;
  return <NoteEditor source={text} onMarkdown={() => {}} bridge={inner} editable={false} properties={false} />;
}

/** Mounts an embedded note in a node view's element; returns how to remove it. */
export function mountNoteEmbed(dom: HTMLElement, path: string, subpath: string, bridge: VaultBridge): () => void {
  const root = createRoot(dom);
  root.render(<NoteEmbed path={path} subpath={subpath} bridge={bridge} />);
  return () => queueMicrotask(() => root.unmount());
}
