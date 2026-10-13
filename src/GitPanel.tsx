import { useCallback, useEffect, useState } from "react";
import { DiffView } from "./DiffView";
import { ConflictResolver } from "./ConflictResolver";
import { isConflicted, isStaged, isUnstaged, MergeConflictError, statusLabel, type GitApi, type GitFile, type GitStatus } from "./vault/git";
import { basename, dirname } from "./vault/links";

interface Props {
  git: GitApi;
  /** Writes pending editor changes before a commit. */
  beforeCommit: () => Promise<void>;
  onOpenNote: (path: string) => void;
  /** Called after every action that may change the status. */
  onChanged: () => void;
  /** Called after a pull, which may have changed notes on disk. */
  onPulled: () => void;
}

interface Selection {
  file: GitFile;
  staged: boolean;
  /** The file is in conflict: the resolver is shown instead of a diff. */
  conflict?: boolean;
}

export function GitPanel({ git, beforeCommit, onOpenNote, onChanged, onPulled }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [diff, setDiff] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [confirmAbort, setConfirmAbort] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await git.status());
    } catch (error) {
      setFeedback({ error: true, text: String(error) });
    }
  }, [git]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [refresh]);

  // Keep the selected diff current (the file may have changed or moved between sections).
  useEffect(() => {
    if (!selection || !status || selection.conflict) return;
    const file = status.files.find((f) => f.path === selection.file.path);
    if (!file || (selection.staged ? !isStaged(file) : !isUnstaged(file))) {
      setSelection(null);
      setDiff("");
      return;
    }
    let cancelled = false;
    git.diff(file, selection.staged).then(
      (text) => !cancelled && setDiff(text),
      (error) => !cancelled && setDiff(`Erreur : ${String(error)}`),
    );
    return () => {
      cancelled = true;
    };
  }, [git, selection, status]);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
    } catch (error) {
      setFeedback({ error: true, text: String(error) });
    } finally {
      setBusy(false);
      await refresh();
      onChanged();
    }
  };

  const pull = () =>
    act(async () => {
      await beforeCommit();
      try {
        setFeedback({ error: false, text: (await git.pull()) || "Déjà à jour." });
      } catch (error) {
        if (!(error instanceof MergeConflictError)) throw error;
        setFeedback({ error: true, text: "La fusion s'est arrêtée sur des conflits : les fichiers concernés sont marqués U." });
      } finally {
        onPulled();
      }
    });

  const push = () => act(async () => setFeedback({ error: false, text: (await git.push()) || "Envoyé." }));

  const fetchRemote = () => act(() => git.fetch());

  const finishMerge = () =>
    act(async () => {
      setFeedback({ error: false, text: await git.continueMerge() });
      onPulled();
    });

  const abortMerge = () =>
    act(async () => {
      setConfirmAbort(false);
      setSelection(null);
      await git.abortMerge();
      setFeedback({ error: false, text: "Fusion annulée : les fichiers sont revenus à leur état d'avant." });
      onPulled();
    });

  const commit = () =>
    act(async () => {
      await beforeCommit();
      const summary = await git.commit(message);
      setMessage("");
      setFeedback({ error: false, text: summary });
    });

  if (!status) return <div className="git-panel empty">Lecture du dépôt…</div>;
  if (!status.isRepo) return <div className="git-panel empty">Ce vault n'est pas un dépôt Git.</div>;

  const conflicted = status.files.filter(isConflicted);
  const staged = status.files.filter(isStaged);
  const unstaged = status.files.filter(isUnstaged);

  const section = (title: string, files: GitFile[], stagedSection: boolean) => (
    <section className="git-section">
      <header>
        <span>
          {title} <span className="git-count">{files.length}</span>
        </span>
        {files.length > 0 && (
          <button disabled={busy} onClick={() => void act(() => (stagedSection ? git.unstage(files.map((f) => f.path)) : git.stage(files.map((f) => f.path))))}>
            {stagedSection ? "Tout retirer" : "Tout indexer"}
          </button>
        )}
      </header>
      {files.length === 0 && <p className="git-none">{stagedSection ? "Rien d'indexé." : "Aucune modification."}</p>}
      <ul>
        {files.map((file) => {
          const letter = stagedSection ? file.index : file.worktree;
          const selected = selection?.file.path === file.path && selection.staged === stagedSection;
          return (
            <li key={file.path} className={selected ? "git-file selected" : "git-file"} onClick={() => setSelection({ file, staged: stagedSection })}>
              <span className={`git-letter git-${letter === "?" ? "new" : letter}`} title={statusLabel(letter)}>
                {letter === "?" ? "N" : letter}
              </span>
              <span className="git-name" title={file.path}>
                {basename(file.path)}
                <span className="git-folder">{file.origPath ? `← ${file.origPath}` : dirname(file.path)}</span>
              </span>
              <button
                className="git-action"
                disabled={busy}
                title={stagedSection ? "Retirer de l'index" : "Indexer"}
                onClick={(event) => {
                  event.stopPropagation();
                  void act(() => (stagedSection ? git.unstage([file.path]) : git.stage([file.path])));
                }}
              >
                {stagedSection ? "−" : "+"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className="git-panel">
      <div className="git-sidebar">
        <div className="git-branch">
          <span>⎇ {status.branch ?? "HEAD détachée"}</span>
          {status.upstream && (
            <span className="git-sync" title={`Par rapport à ${status.upstream}`}>
              ↑{status.ahead} ↓{status.behind}
            </span>
          )}
        </div>
        <div className="git-remote">
          <button disabled={busy} onClick={() => void pull()} title="git pull (fusion)">
            ↓ Pull
          </button>
          <button disabled={busy} onClick={() => void push()} title="git push">
            ↑ Push
          </button>
          <button disabled={busy} onClick={() => void fetchRemote()} title="git fetch : met à jour ↑↓ sans rien modifier">
            ↻
          </button>
        </div>
        {(status.merging || conflicted.length > 0) && (
          <div className="merge-banner">
            <strong>Fusion en cours</strong>
            <span>
              {conflicted.length > 0
                ? `${conflicted.length} fichier${conflicted.length > 1 ? "s" : ""} en conflit à résoudre.`
                : "Tous les conflits sont résolus."}
            </span>
            <div className="merge-actions">
              <button className="primary" disabled={busy || conflicted.length > 0} onClick={() => void finishMerge()}>
                Terminer la fusion
              </button>
              {confirmAbort ? (
                <>
                  <button disabled={busy} onClick={() => void abortMerge()}>
                    Confirmer l'annulation
                  </button>
                  <button onClick={() => setConfirmAbort(false)}>Garder</button>
                </>
              ) : (
                <button disabled={busy} onClick={() => setConfirmAbort(true)} title="git merge --abort : revient à l'état d'avant la fusion">
                  Annuler la fusion
                </button>
              )}
            </div>
          </div>
        )}
        {conflicted.length > 0 && (
          <section className="git-section">
            <header>
              <span>
                Conflits <span className="git-count">{conflicted.length}</span>
              </span>
            </header>
            <ul>
              {conflicted.map((file) => (
                <li
                  key={file.path}
                  className={selection?.conflict && selection.file.path === file.path ? "git-file selected" : "git-file"}
                  onClick={() => setSelection({ file, staged: false, conflict: true })}
                >
                  <span className="git-letter git-D" title="Conflit">
                    U
                  </span>
                  <span className="git-name" title={file.path}>
                    {basename(file.path)}
                    <span className="git-folder">{dirname(file.path)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!status.merging && (
        <div className="git-commit">
          <textarea
            placeholder="Message de commit"
            value={message}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && message.trim() && staged.length > 0) void commit();
            }}
          />
          <button className="primary" disabled={busy || !message.trim() || staged.length === 0} onClick={() => void commit()}>
            Commiter {staged.length > 0 ? `(${staged.length})` : ""}
          </button>
        </div>
        )}
        {feedback && <p className={feedback.error ? "git-feedback error" : "git-feedback"}>{feedback.text}</p>}
        {section("Indexé", staged, true)}
        {section("Modifications", unstaged, false)}
      </div>
      <div className="git-diff">
        {selection?.conflict ? (
          <ConflictResolver
            key={selection.file.path}
            git={git}
            path={selection.file.path}
            onResolved={() => {
              setSelection(null);
              setFeedback({ error: false, text: `${selection.file.path} est résolu.` });
              void refresh();
              onChanged();
            }}
          />
        ) : selection ? (
          <>
            <header>
              <span className="git-diff-path">
                {selection.file.path} <span className="git-folder">{selection.staged ? "indexé" : "non indexé"}</span>
              </span>
              {selection.file.path.endsWith(".md") && selection.file.worktree !== "D" && <button onClick={() => onOpenNote(selection.file.path)}>Ouvrir la note</button>}
            </header>
            <DiffView diff={diff} />
          </>
        ) : (
          <p className="git-none">Sélectionnez un fichier pour voir ses modifications.</p>
        )}
      </div>
    </div>
  );
}
