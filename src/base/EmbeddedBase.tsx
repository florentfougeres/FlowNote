import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Vault } from "../vault/vault";
import { BaseView } from "./BaseView";

export interface EmbedProps {
  vault: Vault;
  files: string[];
  editable: boolean;
  onOpen: (path: string, newTab: boolean) => void;
  onRenameRow: (path: string, name: string) => Promise<boolean>;
  onChanged: () => void;
  loadImage: (path: string) => Promise<string>;
}

/** A base shown inside a note (`![[Projets.base]]`): read from and written to its file. */
function EmbeddedBase({ path, ...props }: EmbedProps & { path: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const saved = useRef<string | null>(null);
  /** Writes one after the other: each expects the text of the previous one on disk. */
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let live = true;
    props.vault.read(path).then(
      (t) => {
        if (!live) return;
        saved.current = t;
        setText(t);
      },
      (e) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, [props.vault, path]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <p className="dash-muted">Base illisible : {error}</p>;
  if (text === null) return <p className="dash-muted">Lecture de la base…</p>;
  return (
    <BaseView
      {...props}
      path={path}
      source={text}
      embedded
      onSource={(next) => {
        const previous = saved.current ?? "";
        saved.current = next;
        setText(next);
        queue.current = queue.current.then(() => props.vault.write(path, next, previous)).catch((e) => setError(String(e)));
      }}
    />
  );
}

/** Mounts a base in a node view's element; `update` re-renders it with the app's current state. */
export function mountBase(dom: HTMLElement, path: string, props: EmbedProps) {
  const root = createRoot(dom);
  const render = (p: EmbedProps) => root.render(<EmbeddedBase {...p} path={path} />);
  render(props);
  return { update: render, unmount: () => queueMicrotask(() => root.unmount()) };
}
