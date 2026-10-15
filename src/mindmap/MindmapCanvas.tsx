import { useEffect, useRef } from "react";
import MindElixir, { type MindElixirData, type MindElixirInstance, type Theme } from "mind-elixir";
import "mind-elixir/style.css";
import { parseMindmap, serializeMindmap, type MindMapData } from "./format";

/** What the page bar can do with the open map. */
export interface MindmapControls {
  /** PNG image of the whole map. */
  exportPng: () => Promise<Blob | null>;
  /** Fits the whole map in view. */
  fit: () => void;
  /** A copy of the whole map in the light theme, with its size (for the PDF export). */
  printable: () => { element: HTMLElement; width: number; height: number };
}

export interface MindmapCanvasProps {
  /** File text the map was loaded from; a new value reloads it. */
  source: string;
  /** Called with the new file text after each change. */
  onMarkdown: (markdown: string) => void;
  /** Name of the map, for a note without map data. */
  title: string;
  theme: "light" | "dark";
  editable: boolean;
  onControls?: (controls: MindmapControls | null) => void;
}

/** The context menu in French. */
const FR = {
  addChild: "Ajouter un enfant",
  addParent: "Ajouter un parent",
  addSibling: "Ajouter un frère",
  removeNode: "Supprimer",
  focus: "Se concentrer sur cette branche",
  cancelFocus: "Revenir à toute la carte",
  moveUp: "Monter",
  moveDown: "Descendre",
  link: "Relier à un autre nœud",
  linkBidirectional: "Relier dans les deux sens",
  clickTips: "Cliquez sur le nœud à relier",
  summary: "Résumé",
};

/**
 * Mind Elixir themes in the app's colours: the page background (white, or the
 * dark page grey), system label colours and accent. Values are plain colours,
 * not CSS variables, because the PNG export paints the background from them.
 */
const LIGHT_THEME: Theme = {
  name: "FlowNote",
  type: "light",
  palette: ["#007aff", "#ff9500", "#34c759", "#af52de", "#ff2d55", "#5ac8fa", "#ffcc00", "#5856d6", "#a2845e", "#00c7be"],
  cssVar: {
    ...MindElixir.THEME.cssVar,
    "--root-radius": "12px",
    "--main-radius": "8px",
    "--root-color": "#ffffff",
    "--root-bgcolor": "#1d1d1f",
    "--root-border-color": "transparent",
    "--main-color": "#1d1d1f",
    "--main-bgcolor": "#ffffff",
    "--main-bgcolor-transparent": "rgba(255, 255, 255, 0.85)",
    "--color": "#3c3c43",
    "--bgcolor": "#ffffff",
    "--selected": "#007aff",
    "--accent-color": "#007aff",
    "--panel-color": "#1d1d1f",
    "--panel-bgcolor": "#ffffff",
    "--panel-border-color": "rgba(0, 0, 0, 0.1)",
  },
};

const DARK_THEME: Theme = {
  name: "FlowNote sombre",
  type: "dark",
  palette: ["#0a84ff", "#ff9f0a", "#30d158", "#bf5af2", "#ff375f", "#64d2ff", "#ffd60a", "#5e5ce6", "#ac8e68", "#63e6e2"],
  cssVar: {
    ...MindElixir.DARK_THEME.cssVar,
    "--root-radius": "12px",
    "--main-radius": "8px",
    "--root-color": "#1d1d1f",
    "--root-bgcolor": "#f5f5f7",
    "--root-border-color": "transparent",
    "--main-color": "#f5f5f7",
    "--main-bgcolor": "#2a2a2c",
    "--main-bgcolor-transparent": "rgba(42, 42, 44, 0.85)",
    "--color": "#d1d1d6",
    "--bgcolor": "#1e1e1e",
    "--selected": "#0a84ff",
    "--accent-color": "#0a84ff",
    "--panel-color": "#f5f5f7",
    "--panel-bgcolor": "#2a2a2c",
    "--panel-border-color": "rgba(255, 255, 255, 0.1)",
  },
};

/**
 * Mind Elixir moves the map with `translate3d(…)`, often by half pixels
 * (centring divides by two). The map is then a composited layer drawn off the
 * pixel grid, and its text looks blurry. The offsets are rounded after each
 * move; the 3D form is kept because Mind Elixir reads the position back from it.
 */
function keepOnPixels(map: HTMLElement): MutationObserver {
  const round = () => {
    const transform = map.style.transform;
    const rounded = transform.replace(/translate3d\(([^,]+),\s*([^,]+),/, (_all, x: string, y: string) =>
      `translate3d(${Math.round(parseFloat(x))}px, ${Math.round(parseFloat(y))}px,`,
    );
    if (rounded !== transform) map.style.transform = rounded;
  };
  const observer = new MutationObserver(round);
  observer.observe(map, { attributes: true, attributeFilter: ["style"] });
  round();
  return observer;
}

/**
 * A mind map edited with Mind Elixir: Tab adds a child, Enter a sibling,
 * double-click (or F2) renames, drag moves a branch, right-click for more.
 * Each change rewrites the file a moment later.
 */
export default function MindmapCanvas({ source, onMarkdown, title, theme, editable, onControls }: MindmapCanvasProps) {
  const box = useRef<HTMLDivElement>(null);
  const mind = useRef<MindElixirInstance | null>(null);
  const write = useRef(onMarkdown);
  write.current = onMarkdown;
  const controls = useRef(onControls);
  controls.current = onControls;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const file = parseMindmap(source, title);
    const instance = new MindElixir({
      el,
      direction: MindElixir.SIDE,
      editable,
      draggable: editable,
      contextMenu: editable ? { focus: true, link: true, locale: FR } : false,
      toolBar: true,
      keypress: editable,
      allowUndo: true,
      newTopicName: "Nouvelle idée",
      theme: theme === "dark" ? DARK_THEME : LIGHT_THEME,
    });
    instance.init(file.data as unknown as MindElixirData);
    mind.current = instance;
    const sharp = keepOnPixels(instance.map);

    let timer = 0;
    const save = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        write.current(serializeMindmap({ ...file, data: instance.getData() as unknown as MindMapData }));
      }, 300);
    };
    instance.bus.addListener("operation", save);
    instance.bus.addListener("changeDirection", save);
    controls.current?.({
      exportPng: () => instance.exportPng(),
      fit: () => {
        instance.scaleFit();
        instance.toCenter();
      },
      printable: () => {
        // The map's own HTML (text stays text): no toolbars, no selection,
        // not moved, in the light theme since paper is white.
        const copy = instance.container.cloneNode(true) as HTMLElement;
        copy.querySelectorAll(".mind-elixir-toolbar, .context-menu, .tips, #input-box, .selection-area, .circle").forEach((e) => e.remove());
        copy.querySelectorAll(".selected").forEach((e) => e.classList.remove("selected"));
        for (const [name, value] of Object.entries(LIGHT_THEME.cssVar ?? {})) if (value) copy.style.setProperty(name, value);
        const canvas = copy.querySelector<HTMLElement>(".map-canvas");
        if (canvas) canvas.style.transform = "none";
        const width = instance.nodes.offsetWidth;
        const height = instance.nodes.offsetHeight;
        Object.assign(copy.style, { width: `${width}px`, height: `${height}px`, overflow: "visible" });
        const page = document.createElement("div");
        page.className = "mindmap-page";
        page.append(copy);
        return { element: page, width, height };
      },
    });
    return () => {
      window.clearTimeout(timer);
      instance.bus.removeListener("operation", save);
      instance.bus.removeListener("changeDirection", save);
      controls.current?.(null);
      sharp.disconnect();
      instance.destroy();
      mind.current = null;
    };
    // The theme is applied below without reloading the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, editable, title]);

  useEffect(() => {
    mind.current?.changeTheme(theme === "dark" ? DARK_THEME : LIGHT_THEME);
  }, [theme]);

  return <div ref={box} className="mindmap-canvas" />;
}
