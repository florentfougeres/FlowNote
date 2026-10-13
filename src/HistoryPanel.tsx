import { useEffect, useState } from "react";
import { DiffView } from "./DiffView";
import { unifiedDiff, type GitApi, type GitCommit } from "./vault/git";

const relative = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

export function relativeDate(iso: string, now = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return "à l'instant";
}

interface Props {
  git: GitApi;
  path: string;
  /** Content of the note as currently saved. */
  current: string;
  onRestore: (content: string) => Promise<void>;
  onClose: () => void;
}

/** Versions of a note from Git, compared with the current content; a version can be restored. */
export function HistoryPanel({ git, path, current, onRestore, onClose }: Props) {
  const [commits, setCommits] = useState<GitCommit[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<GitCommit | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCommits(null);
    setSelected(null);
    git.log(path).then(
      (list) => !cancelled && setCommits(list),
      (e) => !cancelled && setError(String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [git, path]);

  useEffect(() => {
    setVersion(null);
    setConfirming(false);
    if (!selected) return;
    let cancelled = false;
    git.show(selected.hash, selected.path).then(
      (text) => !cancelled && setVersion(text),
      (e) => !cancelled && setError(String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [git, selected]);

  return (
    <aside className="history-panel">
      <header>
        <strong>Historique</strong>
        <button onClick={onClose} aria-label="Fermer l'historique">
          ✕
        </button>
      </header>
      {error && <p className="git-feedback error">{error}</p>}
      {commits === null && !error && <p className="git-none">Chargement…</p>}
      {commits?.length === 0 && <p className="git-none">Cette note n'a encore jamais été commitée.</p>}
      <ul className="history-list">
        {commits?.map((commit) => (
          <li key={commit.hash} className={selected?.hash === commit.hash ? "selected" : ""} onClick={() => setSelected(commit)}>
            <span className="history-subject">{commit.subject}</span>
            <span className="history-meta" title={new Date(commit.date).toLocaleString("fr-FR")}>
              {relativeDate(commit.date)} · {commit.author} · {commit.short}
              {commit.path !== path && <span> · alors « {commit.path} »</span>}
            </span>
          </li>
        ))}
      </ul>
      {selected && version !== null && (
        <div className="history-preview">
          <div className="history-actions">
            {version === current ? (
              <span className="git-none">Identique à la version actuelle.</span>
            ) : confirming ? (
              <>
                <span>Remplacer le contenu actuel par cette version ?</span>
                <button
                  className="primary"
                  onClick={() => {
                    setConfirming(false);
                    void onRestore(version);
                  }}
                >
                  Restaurer
                </button>
                <button onClick={() => setConfirming(false)}>Annuler</button>
              </>
            ) : (
              <button onClick={() => setConfirming(true)}>Restaurer cette version</button>
            )}
          </div>
          <p className="history-legend">
            <span className="diff-del">− cette version</span> <span className="diff-add">+ actuelle</span>
          </p>
          <DiffView diff={unifiedDiff(version, current, path)} empty="Aucune différence avec la version actuelle." />
        </div>
      )}
    </aside>
  );
}
