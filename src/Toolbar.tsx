import type { ReactNode } from "react";
import { keys } from "./keys";
import { Icon, type IconName } from "./Icon";

/**
 * Unified window toolbar: icon buttons grouped in translucent capsules
 * (darker in dark mode), the page location in the middle.
 */

export function ToolButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  badge,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  badge?: number;
}) {
  return (
    <button className={active ? "tool-button active" : "tool-button"} onClick={onClick} disabled={disabled} title={keys(label)} aria-label={keys(label)} aria-pressed={active}>
      <Icon name={icon} />
      {badge ? <span className="tool-badge">{badge > 99 ? "99+" : badge}</span> : null}
    </button>
  );
}

export function ToolGroup({ children }: { children: ReactNode }) {
  return <div className="tool-group">{children}</div>;
}

export function Toolbar({ left, center, right }: { left: ReactNode; center: ReactNode; right: ReactNode }) {
  return (
    <header className="toolbar" data-tauri-drag-region>
      <div className="toolbar-side">{left}</div>
      <div className="toolbar-center" data-tauri-drag-region>
        {center}
      </div>
      <div className="toolbar-side toolbar-right">{right}</div>
    </header>
  );
}
