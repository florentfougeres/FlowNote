import { useEffect, useRef, useState, type ReactNode } from "react";
import { linkItems, type LinkItem } from "./editor/wikilinks";
import { Icon } from "./Icon";
import { keys } from "./keys";

/** Cmd+P / Cmd+K: open a note by name or by title, or create it; « > » goes to the command palette. */
export function QuickSwitcher({
  files,
  titles,
  iconOf,
  onOpen,
  onCreate,
  onCommands,
  onClose,
}: {
  files: string[];
  /** Pages' titles other than their file name (a `# heading`, a `title`), found as well. */
  titles: Map<string, string[]>;
  /** Icon of a page: its emoji, or the icon of its kind. */
  iconOf: (path: string) => ReactNode;
  onOpen: (path: string) => void;
  onCreate: (name: string) => void;
  /** « > » typed first: the command palette instead, like in VS Code. */
  onCommands?: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const items: LinkItem[] = linkItems(query, files, false, titles).slice(0, 50);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    list.current?.children[index]?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const choose = (item: LinkItem | undefined) => {
    if (!item) return;
    if (item.path) onOpen(item.path);
    else if (item.create) onCreate(item.create);
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal switcher" onMouseDown={(e) => e.stopPropagation()}>
        <div className="switcher-field">
          <Icon name="search" size={16} />
          <input
            autoFocus
            placeholder="Rechercher une page…"
            value={query}
            onChange={(e) => (e.target.value === ">" && onCommands ? onCommands() : setQuery(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, items.length - 1));
              else if (e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
              else if (e.key === "Enter") choose(items[index]);
              else if (e.key === "Escape") onClose();
              else return;
              e.preventDefault();
            }}
          />
        </div>
        <ul ref={list} className="switcher-list">
          {items.map((item, i) => (
            <li key={item.key} className={i === index ? "active" : ""} onMouseEnter={() => setIndex(i)} onMouseDown={() => choose(item)}>
              <span className="switcher-icon">{item.path ? iconOf(item.path) : item.icon}</span>
              <span className="switcher-title">{item.title}</span>
              <span className="switcher-folder">{item.description}</span>
            </li>
          ))}
          {items.length === 0 && <li className="switcher-empty">Aucune page.</li>}
        </ul>
        <footer className="switcher-footer">
          <span className="name-dialog-hint">
            <kbd>↑↓</kbd> naviguer <kbd>↵</kbd> ouvrir <kbd>esc</kbd> fermer
          </span>
          <span>{keys("⌘⇧F")} : chercher dans le texte</span>
        </footer>
      </div>
    </div>
  );
}
