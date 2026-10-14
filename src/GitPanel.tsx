import { useCallback, useEffect, useState } from "react";
import { DiffView } from "./DiffView";
import { ConflictResolver } from "./ConflictResolver";
import { Icon } from "./Icon";
import { explainGitError, fetchResult, pullResult, pushResult, syncSummary } from "./vault/gitMessages";
import { autoCommitMessage, isConflicted, isUntracked, isStaged, isUnstaged, MergeConflictError, statusLabel, type GitApi, type GitFile, type GitStatus } from "./vault/git";
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
  /** Files whose changes were discarded: the open note must show the disk version. */
  onDiscarded: (paths: string[]) => void;
}

interface Selection {
  file: GitFile;
  staged: boolean;
  /** The file is in conflict: the resolver is shown instead of a diff. */
  conflict?: boolean;
}

export function GitPanel({ git, beforeCommit, onOpenNote, onChanged, onPulled, onDiscarded }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [diff, setDiff] = useState("");
  const [message, setMessage] = useState("");
  /** The operation running, shown on its button; every other action waits. */
  const [running, setRunning] = useState<Operation | null>(null);
  const busy = running !== null;
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmAbort, setConfirmAbort] = useState(false);
  /** Files whose discard waits for confirmation (one row, or the whole section). */
  const [confirmDiscard, setConfirmDiscard] = useState<{ paths: string[]; all: boolean } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await git.status());
    } catch (error) {
      const raw = String(error).replace(/^Error: /, "");
      setFeedback({ kind: "error", text: explainGitError(raw), details: raw });
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

  // A success message goes away by itself; an error stays until the next action.
  useEffect(() => {
    if (feedback?.kind !== "success") return;
    const timer = window.setTimeout(() => setFeedback(null), 6000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const act = async (operation: Operation, action: () => Promise<unknown>) => {
    if (running) return; // a second click while it runs does nothing
    setRunning(operation);
    setFeedback(null);
    try {
      await action();
    } catch (error) {
      const raw = String(error).replace(/^Error: /, "");
      setFeedback({ kind: "error", text: explainGitError(raw), details: raw });
    } finally {
      setRunning(null);
      await refresh();
      onChanged();
    }
  };

  const pull = () =>
    act("pull", async () => {
      await beforeCommit();
      const behind = status?.behind ?? 0;
      try {
        await git.pull();
        setFeedback({ kind: "success", text: pullResult(behind, status?.upstream) });
      } catch (error) {
        if (!(error instanceof MergeConflictError)) throw error;
        setFeedback({ kind: "error", text: "La fusion s'est arrêtée sur des conflits : résolvez les fichiers marqués U, puis terminez la fusion." });
      } finally {
        onPulled();
      }
    });

  const push = () =>
    act("push", async () => {
      const ahead = status?.ahead ?? 0;
      const upstream = status?.upstream;
      await git.push();
      setFeedback({ kind: "success", text: pushResult(ahead, upstream) });
    });

  const fetchRemote = () =>
    act("fetch", async () => {
      await git.fetch();
      const fresh = await git.status();
      setFeedback({ kind: "success", text: fetchResult(fresh.behind, fresh.upstream) });
    });

  const finishMerge = () =>
    act("merge", async () => {
      await git.continueMerge();
      setFeedback({ kind: "success", text: "Fusion terminée et commitée." });
      onPulled();
    });

  const abortMerge = () =>
    act("merge", async () => {
      setConfirmAbort(false);
      setSelection(null);
      await git.abortMerge();
      setFeedback({ kind: "success", text: "Fusion annulée : les fichiers sont revenus à leur état d'avant." });
      onPulled();
    });

  /** Back to the last indexed version (new files go to the trash). The open note is saved first, then reloaded. */
  const discard = (files: GitFile[]) =>
    act("discard", async () => {
      setConfirmDiscard(null);
      await beforeCommit();
      await git.discard(files.map((f) => f.path));
      const created = files.filter(isUntracked).length;
      const one = files.length === 1 ? basename(files[0].path) : null;
      setFeedback({
        kind: "success",
        text: one
          ? created
            ? `${one} a été mis à la corbeille.`
            : `Les modifications de ${one} ont été annulées.`
          : `Modifications de ${files.length} fichiers annulées${created ? ` (${created} nouveau${created > 1 ? "x" : ""} à la corbeille)` : ""}.`,
      });
      onDiscarded(files.map((f) => f.path));
    });

  // An empty message gets an automatic one (date, notes, "made with FlowNote").
  const commit = () =>
    act("commit", async () => {
      await beforeCommit();
      const files = (status?.files ?? []).filter(isStaged).map((f) => f.path);
      const used = message.trim() ? message : autoCommitMessage(files);
      await git.commit(used);
      setMessage("");
      setFeedback({
        kind: "success",
        text: `Commit créé : « ${used.split("\n")[0]} ».${status?.upstream ? " Faites un Push pour l'envoyer." : ""}`,
      });
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
          <span className="git-section-actions">
            {!stagedSection && (
              <button
                className="git-icon-button git-discard"
                disabled={busy}
                title="Tout annuler"
                aria-label="Annuler toutes les modifications"
                onClick={() => setConfirmDiscard({ paths: files.map((f) => f.path), all: true })}
              >
                <Icon name="undo" size={14} />
              </button>
            )}
            <button
              className="git-icon-button"
              disabled={busy}
              title={stagedSection ? "Tout retirer de l'index" : "Tout indexer"}
              aria-label={stagedSection ? "Tout retirer de l'index" : "Tout indexer"}
              onClick={() => void act("stage", () => (stagedSection ? git.unstage(files.map((f) => f.path)) : git.stage(files.map((f) => f.path))))}
            >
              <Icon name={stagedSection ? "minus" : "plus"} size={14} />
            </button>
          </span>
        )}
      </header>
      {!stagedSection && confirmDiscard?.all && (
        <DiscardConfirm
          text={`Annuler les modifications de ${files.length} fichier${files.length > 1 ? "s" : ""} ? Cette action est définitive${files.some(isUntracked) ? " (les nouveaux fichiers vont à la corbeille)" : ""}.`}
          onConfirm={() => void discard(files)}
          onCancel={() => setConfirmDiscard(null)}
        />
      )}
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
              {!stagedSection && (
                <button
                  className="git-action git-discard"
                  disabled={busy}
                  title={isUntracked(file) ? "Supprimer ce nouveau fichier (corbeille)" : "Annuler les modifications de ce fichier"}
                  aria-label="Annuler les modifications"
                  onClick={(event) => {
                    event.stopPropagation();
                    setConfirmDiscard({ paths: [file.path], all: false });
                  }}
                >
                  <Icon name="undo" size={13} />
                </button>
              )}
              <button
                className="git-action"
                disabled={busy}
                title={stagedSection ? "Retirer de l'index" : "Indexer"}
                onClick={(event) => {
                  event.stopPropagation();
                  void act("stage", () => (stagedSection ? git.unstage([file.path]) : git.stage([file.path])));
                }}
              >
                <Icon name={stagedSection ? "minus" : "plus"} size={13} />
              </button>
            </li>
          );
          // Confirmation right under the row being discarded.
        }).flatMap((row, i) => {
          const file = files[i];
          if (stagedSection || confirmDiscard?.all || confirmDiscard?.paths[0] !== file.path) return [row];
          return [
            row,
            <li key={`${file.path}-confirm`} className="git-confirm-row">
              <DiscardConfirm
                text={isUntracked(file) ? `Mettre le nouveau fichier ${basename(file.path)} à la corbeille ?` : `Annuler les modifications de ${basename(file.path)} ? Cette action est définitive.`}
                onConfirm={() => void discard([file])}
                onCancel={() => setConfirmDiscard(null)}
              />
            </li>,
          ];
        })}
      </ul>
    </section>
  );

  return (
    <div className="git-panel">
      <div className="git-sidebar">
        <div className="git-branch">
          <span>⎇ {status.branch ?? "HEAD détachée"}</span>
        </div>
        <p className={status.ahead > 0 || status.behind > 0 ? "git-sync-summary pending" : "git-sync-summary"}>{syncSummary(status.upstream, status.ahead, status.behind)}</p>
        <div className="git-remote">
          <RemoteButton
            label="Pull"
            runningLabel="Récupération…"
            arrow="↓"
            count={status.behind}
            running={running === "pull"}
            disabled={busy}
            highlight={status.behind > 0}
            title="Récupérer les commits du dépôt distant et les fusionner (git pull)"
            onClick={() => void pull()}
          />
          <RemoteButton
            label="Push"
            runningLabel="Envoi…"
            arrow="↑"
            count={status.ahead}
            running={running === "push"}
            disabled={busy || (Boolean(status.upstream) && status.ahead === 0)}
            highlight={status.ahead > 0}
            title={status.upstream && status.ahead === 0 ? "Rien à envoyer : commitez d'abord vos modifications" : "Envoyer vos commits vers le dépôt distant (git push)"}
            onClick={() => void push()}
          />
          <RemoteButton
            label="Vérifier"
            runningLabel="Vérification…"
            arrow="↻"
            count={0}
            running={running === "fetch"}
            disabled={busy}
            highlight={false}
            title="Regarder s'il y a du nouveau sur le dépôt distant, sans rien modifier (git fetch)"
            onClick={() => void fetchRemote()}
          />
        </div>
        {feedback && <FeedbackBanner feedback={feedback} onClose={() => setFeedback(null)} />}
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
            placeholder="Message de commit (facultatif : sinon date, heure et notes modifiées)"
            value={message}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && staged.length > 0) void commit();
            }}
          />
          <button className="primary" disabled={busy || staged.length === 0} onClick={() => void commit()}>
            {running === "commit" ? (
              <>
                <span className="spinner" aria-hidden="true" /> Commit…
              </>
            ) : (
              <>Commiter {staged.length > 0 ? `(${staged.length})` : ""}</>
            )}
          </button>
        </div>
        )}
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
              setFeedback({ kind: "success", text: `${selection.file.path} est résolu.` });
              void refresh();
              onChanged();
            }}
          />
        ) : selection ? (
          <>
            <header>
              <span className="git-diff-path" title={selection.file.path}>
                <span className="git-diff-name">{basename(selection.file.path)}</span>
                <span className="git-diff-tag">{selection.staged ? "Indexé" : "Non indexé"}</span>
              </span>
              {selection.file.path.endsWith(".md") && selection.file.worktree !== "D" && (
                <button className="git-icon-button" onClick={() => onOpenNote(selection.file.path)} title="Ouvrir la note" aria-label="Ouvrir la note">
                  <Icon name="open" size={14} />
                </button>
              )}
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

type Operation = "pull" | "push" | "fetch" | "commit" | "merge" | "stage" | "discard";

interface Feedback {
  kind: "success" | "error";
  text: string;
  /** Raw Git output, shown on demand. */
  details?: string;
}

function RemoteButton(props: {
  label: string;
  runningLabel: string;
  arrow: string;
  count: number;
  running: boolean;
  disabled: boolean;
  highlight: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button className={props.highlight ? "git-remote-button highlight" : "git-remote-button"} disabled={props.disabled} onClick={props.onClick} title={props.title} aria-busy={props.running}>
      {props.running ? <span className="spinner" aria-hidden="true" /> : <span aria-hidden="true">{props.arrow}</span>}
      {props.running ? props.runningLabel : props.label}
      {!props.running && props.count > 0 && <span className="git-count">{props.count}</span>}
    </button>
  );
}

function FeedbackBanner({ feedback, onClose }: { feedback: Feedback; onClose: () => void }) {
  return (
    <div className={`git-feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>
      <span className="git-feedback-icon" aria-hidden="true">
        {feedback.kind === "success" ? "✓" : "!"}
      </span>
      <div className="git-feedback-body">
        <span>{feedback.text}</span>
        {feedback.details && (
          <details>
            <summary>Détails</summary>
            <pre>{feedback.details}</pre>
          </details>
        )}
      </div>
      <button className="git-feedback-close" onClick={onClose} aria-label="Fermer">
        ×
      </button>
    </div>
  );
}

function DiscardConfirm({ text, onConfirm, onCancel }: { text: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="git-discard-confirm" role="alertdialog" onClick={(e) => e.stopPropagation()}>
      <span>{text}</span>
      <span className="git-discard-buttons">
        <button onClick={onCancel} autoFocus>
          Garder
        </button>
        <button className="danger" onClick={onConfirm}>
          Annuler les modifications
        </button>
      </span>
    </div>
  );
}
