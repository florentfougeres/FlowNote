import { useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, exportToSvg, getSceneVersion, MainMenu } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, BinaryFileData } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import type { VaultBridge } from "../editor/bridge";
import { attachmentFolder, linkTextFor, resolveLink, uniquePath } from "../vault/links";
import { parseDrawing, serializeDrawing, type DrawingFile, type SceneElement } from "./format";

/** Tools shown in FlowNote's toolbar while a drawing is open. */
export type DrawingTool = "selection" | "hand" | "rectangle" | "diamond" | "ellipse" | "arrow" | "line" | "freedraw" | "text" | "image" | "eraser";

export interface DrawingControls {
  setTool(tool: DrawingTool): void;
  /** The whole drawing as SVG, on a white background (for the PDF export). */
  exportSvg(): Promise<SVGSVGElement>;
}

export interface CanvasProps {
  source: string;
  onMarkdown: (text: string) => void;
  bridge: VaultBridge;
  theme: "light" | "dark";
  editable: boolean;
  onControls: (controls: DrawingControls | null) => void;
  onToolChange: (tool: string) => void;
}

const SAVE_DELAY = 400;

async function toDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataURLBytes(dataURL: string): { bytes: Uint8Array; mime: string } {
  const [header, data] = dataURL.split(",", 2);
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/svg+xml": "svg", "image/webp": "webp" };

/** "Pasted Image 20261014083012.png", the plugin's naming. */
function attachmentName(mime: string, index: number): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `Pasted Image ${stamp}${index ? `_${index}` : ""}.${EXTENSIONS[mime] ?? "png"}`;
}

export default function ExcalidrawCanvas({ source, onMarkdown, bridge, theme, editable, onControls, onToolChange }: CanvasProps) {
  const parsed = useMemo<{ file: DrawingFile | null; error: string | null }>(() => {
    try {
      return { file: parseDrawing(source), error: null };
    } catch (error) {
      return { file: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [source]);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const file = useRef(parsed.file);
  file.current = parsed.file;
  const savedVersion = useRef<number | null>(null);
  const timer = useRef<number>(0);
  const pending = useRef<(() => Promise<void>) | null>(null);
  const tool = useRef("selection");
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;
  const onMarkdownRef = useRef(onMarkdown);
  onMarkdownRef.current = onMarkdown;

  // The toolbar drives the canvas through these controls.
  useEffect(() => {
    if (!api) return;
    onControls({
      setTool: (type) => api.setActiveTool(type === "image" ? { type: "image", insertOnCanvasDirectly: false } : { type }),
      exportSvg: () =>
        exportToSvg({
          elements: api.getSceneElements(),
          appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false, viewBackgroundColor: "#ffffff" },
          files: api.getFiles(),
          exportPadding: 16,
        }),
    });
    return () => onControls(null);
  }, [api, onControls]);

  // Images: attachments of the vault, given to Excalidraw as data URLs.
  useEffect(() => {
    const current = file.current;
    if (!api || !current) return;
    let cancelled = false;
    const used = new Set(current.scene.elements.map((e) => e.fileId).filter((id): id is string => typeof id === "string"));
    void Promise.all(
      [...current.embedded].filter(([id]) => used.has(id)).map(async ([id, target]): Promise<BinaryFileData | null> => {
        try {
          const path = /^[a-z]+:\/\//i.test(target) ? null : resolveLink(target, bridgeRef.current.files, bridgeRef.current.notePath);
          const url = path ? await bridgeRef.current.loadImage(path) : target;
          const blob = await (await fetch(url)).blob();
          return { id: id as BinaryFileData["id"], mimeType: (blob.type || "image/png") as BinaryFileData["mimeType"], dataURL: (await toDataURL(blob)) as BinaryFileData["dataURL"], created: Date.now() };
        } catch {
          return null; // missing attachment: Excalidraw shows an empty image box
        }
      }),
    ).then((files) => {
      if (!cancelled) api.addFiles(files.filter((f): f is BinaryFileData => f !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  // A pending save is written when the drawing closes.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      void pending.current?.();
    },
    [],
  );

  if (!parsed.file) return <div className="drawing-error">{parsed.error}</div>;

  const save = async (elements: readonly SceneElement[], appState: Record<string, unknown>, files: Record<string, { mimeType: string; dataURL: string }>) => {
    const current = file.current;
    if (!current) return;
    // New images (pasted, dropped, inserted) become attachments of the vault.
    let index = 0;
    for (const element of elements) {
      const id = element.fileId;
      if (element.isDeleted || typeof id !== "string" || current.embedded.has(id) || !files[id]) continue;
      const b = bridgeRef.current;
      const { bytes, mime } = dataURLBytes(files[id].dataURL);
      const path = uniquePath(attachmentFolder(b.notePath, b.config), attachmentName(mime, index++), b.files);
      await b.createFile(path, bytes);
      current.embedded.set(id, linkTextFor(path, b.files));
    }
    current.scene = { elements: [...elements] as SceneElement[], appState, files: {} };
    onMarkdownRef.current(serializeDrawing(current));
  };

  return (
    <Excalidraw
      excalidrawAPI={setApi}
      initialData={{
        elements: parsed.file.scene.elements as never,
        appState: { ...parsed.file.scene.appState, theme } as never,
        scrollToContent: true,
      }}
      theme={theme}
      langCode="fr-FR"
      viewModeEnabled={!editable}
      UIOptions={{
        canvasActions: { loadScene: false, export: false, saveToActiveFile: false, toggleTheme: false, clearCanvas: true, changeViewBackgroundColor: true, saveAsImage: true },
        tools: { image: true },
      }}
      onChange={(elements, appState, files) => {
        if (appState.activeTool.type !== tool.current) {
          tool.current = appState.activeTool.type;
          onToolChange(tool.current);
        }
        // Only real edits are written (opening or scrolling a drawing leaves the file untouched).
        const version = getSceneVersion(elements);
        if (savedVersion.current === null) savedVersion.current = version;
        if (version === savedVersion.current) return;
        savedVersion.current = version;
        const run = () => save(elements as unknown as SceneElement[], appState as unknown as Record<string, unknown>, files as never);
        pending.current = run;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          pending.current = null;
          void run();
        }, SAVE_DELAY);
      }}
    >
      <MainMenu>
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.DefaultItems.Help />
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      </MainMenu>
    </Excalidraw>
  );
}
