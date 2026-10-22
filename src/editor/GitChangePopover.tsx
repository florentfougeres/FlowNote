import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Node as PMNode } from "@tiptap/pm/model";
import { wordDiff, type GitChange } from "./gitGutter";

const TITLES: Record<GitChange["kind"], string> = { modified: "Modifié", added: "Ajouté", removed: "Supprimé" };

function day(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** A click on a mark of the margin: the committed version beside the current one, and a way back to it. */
export function GitChangePopover({
  change,
  x,
  y,
  dom,
  markdownOf,
  onRestore,
  onClose,
}: {
  change: GitChange;
  x: number;
  y: number;
  /** The editor: typing there closes the popover (its blocks may have moved). */
  dom: HTMLElement;
  /** Markdown of a current block, as it would be written. */
  markdownOf: (node: PMNode) => string;
  onRestore: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !(event.target instanceof Element && event.target.closest(".git-change-popover"))) onClose();
    };
    document.addEventListener("mousedown", close, true);
    document.addEventListener("keydown", close, true);
    dom.addEventListener("input", onClose);
    return () => {
      document.removeEventListener("mousedown", close, true);
      document.removeEventListener("keydown", close, true);
      dom.removeEventListener("input", onClose);
    };
  }, [dom, onClose]);

  const before = change.before.map((b) => b.source ?? markdownOf(b.node)).join("\n\n");
  const after = change.after.map(markdownOf).join("\n\n");
  const parts = wordDiff(before, after);
  const when = day(change.date);
  const plural = (change.kind === "removed" ? change.before : change.after).length > 1;

  return createPortal(
    <div className="block-menu git-change-popover" style={{ left: Math.max(8, Math.min(x, window.innerWidth - 440)), top: Math.max(8, Math.min(y, window.innerHeight - 320)) }}>
      <div className="git-change-title">
        <span className={`git-change-dot ${change.kind}`} />
        {TITLES[change.kind]} depuis le dernier commit{when && <span className="git-change-date"> · {when}</span>}
      </div>
      <pre className="git-change-diff">
        {parts.map((part, i) =>
          part.kind === "same" ? (
            <span key={i}>{part.text}</span>
          ) : part.kind === "removed" ? (
            <del key={i}>{part.text}</del>
          ) : (
            <ins key={i}>{part.text}</ins>
          ),
        )}
      </pre>
      <div className="block-menu-sub">
        <button
          onClick={() => {
            onRestore();
            onClose();
          }}
        >
          {change.kind === "modified" ? "Rétablir la version du commit" : change.kind === "added" ? (plural ? "Retirer ces blocs" : "Retirer ce bloc") : plural ? "Restaurer ces blocs" : "Restaurer ce bloc"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
