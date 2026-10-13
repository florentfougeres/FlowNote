import { useEffect, useMemo, useState } from "react";
import { conflictCount, hasConflictMarkers, parseConflicts, resolveConflicts, type Choice, type Segment } from "./vault/conflicts";
import type { ConflictVersions, GitApi } from "./vault/git";

interface Props {
  git: GitApi;
  path: string;
  onResolved: () => void;
}

/** Lines shown around each conflict; longer unchanged text is folded. */
const CONTEXT_LINES = 2;

function Context({ text }: { text: string }) {
  const lines = text.replace(/\n$/, "").split("\n");
  if (lines.length <= CONTEXT_LINES * 2 + 1) return <pre className="conflict-context">{text}</pre>;
  return (
    <pre className="conflict-context">
      {lines.slice(0, CONTEXT_LINES).join("\n")}
      {"\n"}
      <span className="conflict-fold">… {lines.length - CONTEXT_LINES * 2} lignes identiques …</span>
      {"\n"}
      {lines.slice(-CONTEXT_LINES).join("\n")}
    </pre>
  );
}

/**
 * Resolves one conflicted file: keep a whole side, choose a side per conflict,
 * or edit the text by hand. Nothing is written until the file is marked resolved.
 */
export function ConflictResolver({ git, path, onResolved }: Props) {
  const [versions, setVersions] = useState<ConflictVersions | null>(null);
  const [choices, setChoices] = useState<(Choice | undefined)[]>([]);
  const [manual, setManual] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setVersions(null);
    setManual(null);
    setError("");
    git.conflict(path).then(
      (v) => {
        if (cancelled) return;
        setVersions(v);
        setChoices([]);
      },
      (e) => !cancelled && setError(String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [git, path]);

  const segments: Segment[] = useMemo(() => parseConflicts(versions?.working ?? ""), [versions]);
  const count = conflictCount(segments);
  const decided = choices.filter(Boolean).length;

  const resolve = async (content: string | null) => {
    if (content !== null && hasConflictMarkers(content)) {
      setError("Le texte contient encore des marqueurs de conflit (<<<<<<<, =======, >>>>>>>).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await git.resolve(path, content);
      onResolved();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error && !versions) return <p className="git-feedback error">{error}</p>;
  if (!versions) return <p className="git-none">Chargement du conflit…</p>;

  const header = (
    <header className="conflict-header">
      <span className="git-diff-path">
        {path} <span className="git-folder">en conflit</span>
      </span>
    </header>
  );

  // One side deleted the file, the other changed it.
  if (versions.ours === null || versions.theirs === null) {
    const kept = versions.ours ?? versions.theirs;
    return (
      <div className="conflict">
        {header}
        <p>{versions.ours === null ? "Vous avez supprimé ce fichier ; l'autre branche l'a modifié." : "L'autre branche a supprimé ce fichier ; vous l'avez modifié."}</p>
        <div className="conflict-actions">
          <button disabled={busy} onClick={() => void resolve(kept)}>
            Garder le fichier modifié
          </button>
          <button disabled={busy} onClick={() => void resolve(null)}>
            Supprimer le fichier
          </button>
        </div>
        {error && <p className="git-feedback error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="conflict">
      {header}
      <div className="conflict-actions">
        <button disabled={busy} onClick={() => void resolve(versions.ours)}>
          Garder ma version
        </button>
        <button disabled={busy} onClick={() => void resolve(versions.theirs)}>
          Garder la leur
        </button>
        <button disabled={busy} onClick={() => setManual(manual === null ? resolveConflicts(segments, choices) : null)}>
          {manual === null ? "Édition manuelle" : "Revenir aux blocs"}
        </button>
      </div>
      {error && <p className="git-feedback error">{error}</p>}

      {manual !== null ? (
        <div className="conflict-manual">
          <textarea value={manual} onChange={(e) => setManual(e.target.value)} spellCheck={false} rows={Math.min(30, manual.split("\n").length + 2)} />
          <button className="primary" disabled={busy} onClick={() => void resolve(manual)}>
            Marquer comme résolu
          </button>
        </div>
      ) : count === 0 ? (
        <p className="git-none">Pas de marqueur de conflit lisible dans ce fichier : gardez une version ou éditez-le à la main.</p>
      ) : (
        <>
          {segments.map((segment, i) => {
            if (segment.kind === "text") return <Context key={i} text={segment.text} />;
            const n = segments.slice(0, i).filter((s) => s.kind === "conflict").length;
            const choice = choices[n];
            const choose = (c: Choice) => setChoices((current) => Object.assign([...current], { [n]: c }));
            return (
              <div key={i} className="conflict-block">
                <div className="conflict-sides">
                  <div className={choice === "ours" || choice === "both" ? "conflict-side chosen" : "conflict-side"}>
                    <div className="conflict-label">Ma version</div>
                    <pre>{segment.ours || "(vide)"}</pre>
                  </div>
                  <div className={choice === "theirs" || choice === "both" ? "conflict-side chosen" : "conflict-side"}>
                    <div className="conflict-label">Leur version {segment.theirsLabel && <span className="git-folder">{segment.theirsLabel}</span>}</div>
                    <pre>{segment.theirs || "(vide)"}</pre>
                  </div>
                </div>
                <div className="conflict-choice">
                  {(["ours", "theirs", "both"] as Choice[]).map((c) => (
                    <button key={c} className={choice === c ? "selected" : ""} onClick={() => choose(c)}>
                      {c === "ours" ? "La mienne" : c === "theirs" ? "La leur" : "Les deux"}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="conflict-footer">
            <span>
              {decided}/{count} conflit{count > 1 ? "s" : ""} tranché{decided > 1 ? "s" : ""}
            </span>
            <button className="primary" disabled={busy || decided < count} onClick={() => void resolve(resolveConflicts(segments, choices))}>
              Marquer comme résolu
            </button>
          </div>
        </>
      )}
    </div>
  );
}
