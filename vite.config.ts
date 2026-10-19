/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Excalidraw's fonts, served and bundled locally (the library would otherwise
 * fetch them from a CDN): the app keeps working offline. Xiaolai (12 MB, CJK
 * glyphs only) is left out.
 */
function excalidrawAssets(): Plugin {
  const source = "node_modules/@excalidraw/excalidraw/dist/prod/fonts";
  const base = "excalidraw-assets/fonts";
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (name === "Xiaolai") return [];
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  return {
    name: "excalidraw-assets",
    configureServer(server) {
      server.middlewares.use(`/${base}/`, (req, res, next) => {
        const path = join(source, decodeURIComponent((req.url ?? "").split("?")[0]));
        try {
          if (!path.startsWith(source) || !statSync(path).isFile()) return next();
          res.setHeader("Content-Type", path.endsWith(".woff2") ? "font/woff2" : "application/octet-stream");
          res.end(readFileSync(path));
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const path of files(source)) {
        this.emitFile({ type: "asset", fileName: `${base}/${relative(source, path)}`, source: readFileSync(path) });
      }
    },
  };
}

// Tauri expects a fixed port and must not have the dev server clear its logs.
export default defineConfig({
  plugins: [react(), excalidrawAssets()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // embed.html: one page inside a tab of the native macOS shell (native/).
  build: { rollupOptions: { input: { main: resolve(__dirname, "index.html"), embed: resolve(__dirname, "embed.html") } } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
