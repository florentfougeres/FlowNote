import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../ErrorBoundary";
import { installErrorReporting } from "../errors";
import { callNative } from "../vault/nativeVault";
import { EmbedPage, type ShellSettings } from "./EmbedPage";
import "../styles.css";
import "./embed.css";

installErrorReporting();
(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";

/** What the shell gives a new tab: the vault's name, the page to show and the settings. */
interface ShellState {
  vaultName: string;
  path: string | null;
  settings: ShellSettings;
}

void callNative<ShellState>("shell_state").then((state) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <EmbedPage vaultName={state.vaultName} initialPath={state.path} initialSettings={state.settings} />
      </ErrorBoundary>
    </StrictMode>,
  );
});
