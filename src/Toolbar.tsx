import { useContext, useId, useLayoutEffect, type ReactNode } from "react";
import { NativeToolsContext, ToolGroupContext } from "./nativeTools";
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
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  disabled?: boolean;
  badge?: number;
}) {
  const native = useContext(NativeToolsContext);
  const group = useContext(ToolGroupContext);
  const id = useId();
  // In the native shell, the button is drawn by the shell (in its place in the page's order).
  useLayoutEffect(() => {
    native?.set(id, { icon, label: keys(label), active, disabled, group: group ?? undefined, run: onClick });
  });
  useLayoutEffect(() => (native ? () => native.remove(id) : undefined), [native, id]);
  if (native) return <span hidden data-native-tool={id} />;
  return (
    <button className={active ? "tool-button active" : "tool-button"} onClick={onClick} disabled={disabled} title={keys(label)} aria-label={keys(label)} aria-pressed={active}>
      <Icon name={icon} />
      {badge ? <span className="tool-badge">{badge > 99 ? "99+" : badge}</span> : null}
    </button>
  );
}

export function ToolGroup({ children }: { children: ReactNode }) {
  const id = useId();
  return (
    <ToolGroupContext.Provider value={id}>
      <div className="tool-group">{children}</div>
    </ToolGroupContext.Provider>
  );
}

export function Toolbar({ left, center, right }: { left: ReactNode; center: ReactNode; right: ReactNode }) {
  return (
    <header className="toolbar" data-tauri-drag-region="deep">
      <div className="toolbar-side">{left}</div>
      <div className="toolbar-center">
        {center}
      </div>
      <div className="toolbar-side toolbar-right">{right}</div>
    </header>
  );
}
