import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { keys } from "./keys";

interface TitlebarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  /** Pointer over the sidebar button while the sidebar is hidden: it shows over the page. */
  onPeek: (shown: boolean) => void;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  /** The tab bar, after the buttons. */
  children: ReactNode;
}

/**
 * The window's top bar: sidebar and history buttons, then the tabs. "deep":
 * the window moves from any empty spot of the bar, not only from the bar
 * itself (Tauri leaves buttons, fields and tabs alone).
 */
export function Titlebar(props: TitlebarProps) {
  const { sidebarOpen } = props;
  return (
    <header className="titlebar" data-tauri-drag-region="deep">
      <div className="titlebar-controls">
        <button
          className="titlebar-button"
          onClick={props.onToggleSidebar}
          onMouseEnter={() => !sidebarOpen && props.onPeek(true)}
          onMouseLeave={() => !sidebarOpen && props.onPeek(false)}
          aria-label={sidebarOpen ? "Masquer la barre latérale" : "Afficher la barre latérale"}
          title={keys(sidebarOpen ? "Masquer la barre latérale (⌘\\)" : "Afficher la barre latérale (⌘\\)")}
        >
          <Icon name="sidebar" size={16} />
        </button>
        <button className="titlebar-button" onClick={props.onBack} disabled={!props.canBack} aria-label="Page précédente" title={keys("Page précédente (⌘[)")}>
          <Icon name="chevronLeft" size={16} />
        </button>
        <button className="titlebar-button" onClick={props.onForward} disabled={!props.canForward} aria-label="Page suivante" title={keys("Page suivante (⌘])")}>
          <Icon name="chevronRight" size={16} />
        </button>
      </div>
      {props.children}
    </header>
  );
}
