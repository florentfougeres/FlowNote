import { useState } from "react";
import { Icon, type IconName } from "./Icon";

interface Props {
  /** Folders of the recently opened vaults (desktop app). */
  recent: string[];
  /** Null when this browser cannot open a folder. */
  onOpenVault: (() => void) | null;
  onOpenRecent: (root: string) => void;
  onForgetRecent: (root: string) => void;
  onTryDemo: () => void;
  status: string;
}

const FEATURES: [IconName, string, string][] = [
  ["doc", "Vos fichiers restent les vôtres", "Chaque note reste un fichier Markdown, lisible et modifiable dans Obsidian."],
  ["blocks", "L'édition par blocs", "Menu /, glisser-déposer, tableaux, callouts."],
  ["branch", "Versionné avec Git", "Historique, commit, pull et push sans quitter vos notes."],
];

const folderName = (root: string) => root.split("/").filter(Boolean).pop() ?? root;
const shortPath = (root: string) => root.replace(/^\/Users\/[^/]+/, "~");

/** First screen: what FlowNote is, then open a vault (or a recent one, or the demo). */
export function Welcome({ recent, onOpenVault, onOpenRecent, onForgetRecent, onTryDemo, status }: Props) {
  const [list, setList] = useState(recent);
  return (
    <div className="welcome">
      <div className="welcome-drag" data-tauri-drag-region />
      <main className="welcome-card">
        <img className="welcome-icon" src="/icon.png" alt="" width={112} height={112} />
        <h1>Bienvenue dans FlowNote</h1>
        <p className="welcome-lead">L'édition par blocs, directement sur votre vault Obsidian.</p>

        <ul className="welcome-features">
          {FEATURES.map(([icon, title, text]) => (
            <li key={title}>
              <span className="welcome-feature-icon">
                <Icon name={icon} size={18} />
              </span>
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
            </li>
          ))}
        </ul>

        <div className="welcome-actions">
          {onOpenVault ? (
            <button className="welcome-primary" onClick={onOpenVault} autoFocus>
              <Icon name="folder" size={16} />
              Ouvrir un vault Obsidian…
            </button>
          ) : (
            <p className="welcome-warning">Ce navigateur ne permet pas d'ouvrir un dossier. Utilisez Chrome, ou l'application FlowNote.</p>
          )}
          <button className="welcome-secondary" onClick={onTryDemo}>
            Essayer avec un exemple
          </button>
        </div>

        {list.length > 0 && (
          <section className="welcome-recent" aria-label="Vaults récents">
            <h2>Récents</h2>
            <ul>
              {list.map((root) => (
                <li key={root}>
                  <button className="welcome-recent-open" onClick={() => onOpenRecent(root)} title={root}>
                    <Icon name="folder" size={16} />
                    <span className="welcome-recent-name">{folderName(root)}</span>
                    <span className="welcome-recent-path">{shortPath(root)}</span>
                  </button>
                  <button
                    className="welcome-recent-forget"
                    aria-label={`Retirer ${folderName(root)} des récents`}
                    title="Retirer de la liste"
                    onClick={() => {
                      onForgetRecent(root);
                      setList((l) => l.filter((r) => r !== root));
                    }}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {status && <p className="welcome-warning">{status}</p>}

        <p className="welcome-hint">
          Un vault est simplement un dossier qui contient vos notes <code>.md</code>. Pas encore de vault ? Choisissez ou créez n'importe quel dossier : il deviendra le vôtre. Le dossier <code>.obsidian</code> n'est jamais modifié.
        </p>
      </main>
    </div>
  );
}
