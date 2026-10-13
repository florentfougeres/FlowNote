import { useCallback, useEffect, useState, type ReactNode } from "react";
import { isStaged, isUnstaged, parseDiff, statusLabel, type DiffLine, type GitApi, type GitFile, type GitStatus } from "./vault/git";
import { basename, dirname } from "./vault/links";

interface Props {
  git: GitApi;
  /** Writes pending editor changes before a commit. */
  beforeCommit: () => Promise<void>;
  onOpenNote: (path: string) => void;
  /** Called after every action that may change the status. */
  onChanged: () => void;
}

interface Selection {
  file: GitFile;
  staged: boolean;
}

/** Splits a changed line pair into common prefix, changed middle and common suffix (on word boundaries). */
function changedSpan(before: string, after: string): [number, number, number, number] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  while (start > 0 && /\w/u.test(before[start - 1] ?? "")) start--;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  while (end > 0 && /\w/u.test(before[before.length - end] ?? "")) end--;
  return [start, before.length - end, start, after.length - end];
}

function highlight(text: string, from: number, to: number): ReactNode {
  if (from >= to) return text;
  return (
    <>
      {text.slice(0, from)}
      <mark>{text.slice(from, to)}</mark>
      {text.slice(to)}
    </>
  );
}

/** Renders hunk lines, highlighting the changed words of paired deletions/additions. */
function renderLines(lines: DiffLine[]): ReactNode[] {
  const rows: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind === "del") {
      let dels = i;
      while (dels < lines.length && lines[dels].kind === "del") dels++;
      let adds = dels;
      while (adds < lines.length && lines[adds].kind === "add") adds++;
      const removed = lines.slice(i, dels);
      const added = lines.slice(dels, adds);
      const paired = removed.length === added.length;
      removed.forEach((line, k) => {
        const span = paired ? changedSpan(line.text, added[k].text) : null;
        rows.push(row(line, `${i + k}`, span ? highlight(line.text, span[0], span[1]) : line.text));
      });
      added.forEach((line, k) => {
        const span = paired ? changedSpan(removed[k].text, line.text) : null;
        rows.push(row(line, `${dels + k}`, span ? highlight(line.text, span[2], span[3]) : line.text));
      });
      i = adds;
    } else {
      rows.push(row(lines[i], `${i}`, lines[i].text));
      i++;
    }
  }
  return rows;
}

function row(line: DiffLine, key: string, content: ReactNode) {
  const sign = line.kind === "add" ? "+" : line.kind === "del" ? "−" : line.kind === "note" ? "\\" : " ";
  return (
    <tr key={key} className={`diff-${line.kind}`}>
      <td className="diff-number">{line.oldNumber ?? ""}</td>
      <td className="diff-number">{line.newNumber ?? ""}</td>
      <td className="diff-sign">{sign}</td>
      <td className="diff-text">{content}</td>
    </tr>
  );
}

export function GitPanel({ git, beforeCommit, onOpenNote, onChanged }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [diff, setDiff] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);

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
    if (!selection || !status) return;
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

  const commit = () =>
    act(async () => {
      await beforeCommit();
      const summary = await git.commit(message);
      setMessage("");
      setFeedback({ error: false, text: summary });
    });

  if (!status) return <div className="git-panel empty">Lecture du dépôt…</div>;
  if (!status.isRepo) return <div className="git-panel empty">Ce vault n'est pas un dépôt Git.</div>;

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

  const hunks = parseDiff(diff);

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
          {feedback && <p className={feedback.error ? "git-feedback error" : "git-feedback"}>{feedback.text}</p>}
        </div>
        {section("Indexé", staged, true)}
        {section("Modifications", unstaged, false)}
      </div>
      <div className="git-diff">
        {selection ? (
          <>
            <header>
              <span className="git-diff-path">
                {selection.file.path} <span className="git-folder">{selection.staged ? "indexé" : "non indexé"}</span>
              </span>
              {selection.file.path.endsWith(".md") && selection.file.worktree !== "D" && <button onClick={() => onOpenNote(selection.file.path)}>Ouvrir la note</button>}
            </header>
            {hunks.length === 0 ? (
              <p className="git-none">{diff.includes("Binary") ? "Fichier binaire modifié." : "Pas de différence à afficher."}</p>
            ) : (
              <div className="diff-scroll">
                <table className="diff">
                  {hunks.map((hunk, h) => (
                    <tbody key={h}>
                      <tr className="diff-hunk">
                        <td colSpan={4}>{hunk.header}</td>
                      </tr>
                      {renderLines(hunk.lines)}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
          </>
        ) : (
          <p className="git-none">Sélectionnez un fichier pour voir ses modifications.</p>
        )}
      </div>
    </div>
  );
}
