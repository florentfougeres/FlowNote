import { useCallback, useRef, useState, type ReactNode } from "react";
import { keys } from "./keys";
import { Icon } from "./Icon";

/** Narrowest Git panel, also its default width. */
const GIT_MIN_WIDTH = 300;

/**
 * Open state and width of the Git drawer. It stays mounted while it slides out,
 * so it leaves the way it came in. `onOpen` runs when it opens.
 */
export function useGitDrawer(onOpen: () => void) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [width, setWidth] = useState(() => {
    try {
      return Number(localStorage.getItem("flownote:git-width")) || GIT_MIN_WIDTH;
    } catch {
      return GIT_MIN_WIDTH;
    }
  });
  const [resizing, setResizing] = useState(false);
  const openRef = useRef(false);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const toggle = useCallback((next?: boolean) => {
    const value = next ?? !openRef.current;
    openRef.current = value;
    if (!value) return setOpen(false);
    onOpenRef.current();
    // Mount closed, then open on the next frame so the drawer slides in.
    setMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => openRef.current && setOpen(true)));
  }, []);

  /** Drag on the drawer's left edge; the width is remembered. */
  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let current = startWidth;
    setResizing(true);
    const move = (e: PointerEvent) => {
      current = Math.round(Math.min(Math.max(startX - e.clientX + startWidth, GIT_MIN_WIDTH), window.innerWidth * 0.7));
      setWidth(current);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizing(false);
      try {
        localStorage.setItem("flownote:git-width", String(current));
      } catch {
        // not remembered
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return { open, mounted, width, resizing, toggle, startResize, unmount: () => setMounted(false) };
}

export function GitDrawer({ drawer, children }: { drawer: ReturnType<typeof useGitDrawer>; children: ReactNode }) {
  if (!drawer.mounted) return null;
  return (
    <aside
      className={`git-drawer${drawer.open ? " open" : ""}${drawer.resizing ? " resizing" : ""}`}
      style={{ width: drawer.open ? drawer.width : 0 }}
      aria-label="Gestionnaire Git"
      onTransitionEnd={(e) => e.target === e.currentTarget && !drawer.open && drawer.unmount()}
    >
      <div className="git-drawer-resize" onPointerDown={drawer.startResize} role="separator" aria-orientation="vertical" aria-label="Redimensionner le panneau Git" />
      <div className="git-drawer-inner" style={{ width: drawer.width }}>
        <div className="git-drawer-header">
          <span>Git</span>
          <button onClick={() => drawer.toggle(false)} aria-label="Fermer le panneau Git" title={keys("Fermer (⌘⇧G)")}>
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="git-drawer-body">{children}</div>
      </div>
    </aside>
  );
}
