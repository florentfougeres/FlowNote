import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { normalizeText } from "./editor/menu";
import { keys as platformKeys } from "./keys";

export interface Command {
  id: string;
  label: string;
  /** Where the command belongs, shown after it (Page, Vue, Git…). */
  section: string;
  keys?: string;
  icon?: IconName;
  run: () => void;
}

const RECENT_KEY = "flownote:palette-recent";

function recentIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function remember(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentIds().filter((r) => r !== id)].slice(0, 8)));
  } catch {
    // The order of recent commands simply won't persist.
  }
}

/** ⌘⇧P (or « > » in ⌘P): every action of the app, by name, the recent ones first. */
export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const found = useMemo(() => {
    const words = normalizeText(query).split(/\s+/).filter(Boolean);
    const matching = commands.filter((c) => {
      const text = normalizeText(`${c.label} ${c.section}`);
      return words.every((w) => text.includes(w));
    });
    const recent = recentIds();
    const rank = (c: Command) => {
      const at = recent.indexOf(c.id);
      return at < 0 ? recent.length : at;
    };
    const starts = (c: Command) => Number(!normalizeText(c.label).startsWith(words[0] ?? ""));
    // Recent commands first; then those whose name starts with what is typed.
    return matching.sort((a, b) => rank(a) - rank(b) || starts(a) - starts(b));
  }, [commands, query]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    list.current?.children[index]?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    remember(command.id);
    onClose();
    command.run();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal switcher command-palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="switcher-field">
          <Icon name="sliders" size={16} />
          <input
            autoFocus
            placeholder="Commande…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, found.length - 1));
              else if (e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
              else if (e.key === "Enter") run(found[index]);
              else if (e.key === "Escape") onClose();
              else return;
              e.preventDefault();
            }}
            spellCheck={false}
          />
        </div>
        <ul ref={list} className="switcher-list">
          {found.map((command, i) => (
            <li key={command.id} className={i === index ? "active" : ""} onMouseEnter={() => setIndex(i)} onMouseDown={() => run(command)}>
              <span className="switcher-icon">{command.icon && <Icon name={command.icon} size={15} />}</span>
              <span className="switcher-title">{command.label}</span>
              <span className="command-section">{command.section}</span>
              {command.keys && <kbd className="command-keys">{platformKeys(command.keys)}</kbd>}
            </li>
          ))}
          {found.length === 0 && <li className="switcher-empty">Aucune commande.</li>}
        </ul>
        <footer className="switcher-footer">
          <span className="name-dialog-hint">
            <kbd>↑↓</kbd> naviguer <kbd>↵</kbd> exécuter <kbd>esc</kbd> fermer
          </span>
          <span>
            {found.length} commande{found.length > 1 ? "s" : ""}
          </span>
        </footer>
      </div>
    </div>
  );
}
