import { useEffect, useRef, useState, type ReactNode } from "react";
import { linkItems, type LinkItem } from "./editor/wikilinks";

/** Cmd+P / Cmd+K: open a note by name, or create it. */
export function QuickSwitcher({
  files,
  iconOf,
  onOpen,
  onCreate,
  onClose,
}: {
  files: string[];
  /** Icon of a page: its emoji, or the icon of its kind. */
  iconOf: (path: string) => ReactNode;
  onOpen: (path: string) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const items: LinkItem[] = linkItems(query, files, false).slice(0, 50);

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
        <input
          autoFocus
          placeholder="Rechercher une page…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, items.length - 1));
            else if (e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
            else if (e.key === "Enter") choose(items[index]);
            else if (e.key === "Escape") onClose();
            else return;
            e.preventDefault();
          }}
        />
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
      </div>
    </div>
  );
}
