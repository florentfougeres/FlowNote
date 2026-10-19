import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { installErrorReporting } from "./errors";
import { callNative, isNative } from "./platform";
import "./styles.css";

installErrorReporting();

// In the native macOS shell, WKWebView ignores window.print(): the shell opens
// the system's print panel on the page (PDF ▸ Enregistrer au format PDF).
if (isNative()) window.print = () => void callNative("print", { title: document.title }).catch(() => {});

// The window itself never scrolls (see base.css): a scrollIntoView() or a
// focus() can still move it, so it is put back at once.
const root = document.getElementById("root")!;
document.addEventListener(
  "scroll",
  (event) => {
    const target = event.target;
    if (target === document || target === document.documentElement || target === document.body || target === root) {
      for (const element of [document.documentElement, document.body, root]) if (element.scrollTop || element.scrollLeft) element.scrollTo(0, 0);
    }
  },
  { capture: true, passive: true },
);

// Excalidraw loads its fonts from here (bundled with the app) instead of a CDN.
(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
