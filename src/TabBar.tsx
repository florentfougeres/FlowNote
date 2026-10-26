import { useState, type ReactNode } from "react";
import { keys } from "./keys";
import { Icon } from "./Icon";

export interface Tab {
  id: string;
  /** Page shown in the tab; null: the dashboard. */
  path: string | null;
  /** Page shown on its right (split view): the pair is one tab. */
  split?: string | null;
  /** Reading mode of each side: nothing can be edited (⌘⇧R). */
  reading?: boolean;
  splitReading?: boolean;
}

/**
 * Open pages, one tab each, in the window's title bar. Drag to reorder, middle-click
 * or × to close; the + opens the dashboard in a new tab. Two pages side by side
 * make one tab, both named in it.
 */
export function TabBar({
  tabs,
  active,
  dirty,
  titleOf,
  iconOf,
  onSelect,
  onClose,
  onNew,
  onReorder,
  onMenu,
}: {
  tabs: Tab[];
  active: string;
  /** The active tab has unsaved changes. */
  dirty: boolean;
  titleOf: (tab: Tab) => string;
  /** Icon of the page: its emoji, or the icon of its kind. */
  iconOf: (tab: Tab) => ReactNode;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onReorder: (id: string, before: string | null) => void;
  /** Right click on a tab. */
  onMenu?: (id: string, anchor: DOMRect) => void;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  return (
    <div className="tab-bar" role="tablist" aria-label="Pages ouvertes" data-tauri-drag-region="deep">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const title = titleOf(tab);
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={`tab${isActive ? " active" : ""}${tab.split ? " split" : ""}${over === tab.id && dragged !== tab.id ? " drop-before" : ""}${dragged === tab.id ? " dragging" : ""}`}
            title={tab.split ? `${tab.path ?? "Accueil"}  |  ${tab.split}` : (tab.path ?? "Accueil")}
            data-kind={tab.path === null ? "home" : tab.path.toLowerCase().endsWith(".excalidraw.md") ? "drawing" : tab.path.toLowerCase().endsWith(".mindmap.md") ? "mindmap" : "note"}
            draggable
            onDragStart={(event) => {
              setDragged(tab.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", title);
            }}
            onDragOver={(event) => {
              if (!dragged) return;
              event.preventDefault();
              setOver(tab.id);
            }}
            onDragLeave={() => setOver((current) => (current === tab.id ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged && dragged !== tab.id) onReorder(dragged, tab.id);
              setDragged(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDragged(null);
              setOver(null);
            }}
            onMouseDown={(event) => {
              if (event.button === 0) onSelect(tab.id);
            }}
            onAuxClick={(event) => event.button === 1 && onClose(tab.id)}
            onContextMenu={(event) => {
              if (!onMenu) return;
              event.preventDefault();
              onMenu(tab.id, new DOMRect(event.clientX, event.clientY - 4, 0, 0));
            }}
          >
            <span className="tab-icon">{iconOf(tab)}</span>
            <span className="tab-title">{title}</span>
            {tab.split && (
              <>
                <span className="tab-split" aria-label="à côté de" />
                <span className="tab-icon">{iconOf({ id: tab.id, path: tab.split })}</span>
                <span className="tab-title">{titleOf({ id: tab.id, path: tab.split })}</span>
              </>
            )}
            {isActive && dirty && <span className="tab-dirty" aria-label="Modifications non enregistrées" />}
            <button
              className="tab-close"
              aria-label={`Fermer ${title}`}
              title={keys("Fermer (⌘W)")}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.id);
              }}
            >
              <Icon name="close" size={10} />
            </button>
          </div>
        );
      })}
      <div
        className={`tab-end${over === "end" ? " drop-before" : ""}`}
        onDragOver={(event) => {
          if (!dragged) return;
          event.preventDefault();
          setOver("end");
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (dragged) onReorder(dragged, null);
          setDragged(null);
          setOver(null);
        }}
      >
        <button className="tab-new" onClick={onNew} aria-label="Nouvel onglet" title={keys("Nouvel onglet (⌘T)")}>
          <Icon name="plus" size={13} />
        </button>
      </div>
    </div>
  );
}
