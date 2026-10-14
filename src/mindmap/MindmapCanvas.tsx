import { useEffect, useRef } from "react";
import MindElixir, { type MindElixirData, type MindElixirInstance } from "mind-elixir";
import "mind-elixir/style.css";
import { parseMindmap, serializeMindmap, type MindMapData } from "./format";

/** What the page bar can do with the open map. */
export interface MindmapControls {
  /** PNG image of the whole map. */
  exportPng: () => Promise<Blob | null>;
  /** Fits the whole map in view. */
  fit: () => void;
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
      theme: theme === "dark" ? MindElixir.DARK_THEME : MindElixir.THEME,
    });
    instance.init(file.data as unknown as MindElixirData);
    mind.current = instance;

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
    });
    return () => {
      window.clearTimeout(timer);
      instance.bus.removeListener("operation", save);
      instance.bus.removeListener("changeDirection", save);
      controls.current?.(null);
      instance.destroy();
      mind.current = null;
    };
    // The theme is applied below without reloading the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, editable, title]);

  useEffect(() => {
    mind.current?.changeTheme(theme === "dark" ? MindElixir.DARK_THEME : MindElixir.THEME);
  }, [theme]);

  return <div ref={box} className="mindmap-canvas" />;
}
