import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Icon, type IconName } from "../Icon";
import { PopoverMenu, type MenuItem } from "../Sidebar";
import { readClipboardText, writeClipboardText } from "../platform";
import { NoteEditor } from "../editor/NoteEditor";
import type { VaultBridge } from "../editor/bridge";
import { noteTitle } from "../vault/links";
import { fetchPreview, openUrl, youtubeId, type PagePreview } from "../reading/web";
import { CANVAS_COLORS, cardsCenter, cloneCards, colorValue, newCanvasId, parseCanvas, pickCards, serializeCanvas, type CanvasData, type CanvasEdge, type CanvasNode, type Side } from "./format";

export interface CanvasBoardProps {
  /** File text the canvas was loaded from; a new value reloads it. */
  source: string;
  /** Called with the new file text after each change. */
  onChange: (text: string) => void;
  editable: boolean;
  theme: "light" | "dark";
  bridge: VaultBridge;
  /** Text of a note of the vault, for the note cards. */
  readFile: (path: string) => Promise<string>;
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
const SIDES: [Side, Position][] = [
  ["top", Position.Top],
  ["right", Position.Right],
  ["bottom", Position.Bottom],
  ["left", Position.Left],
];

/** What the cards need from the board. */
interface BoardActions {
  editable: boolean;
  editing: string | null;
  bridge: VaultBridge;
  readFile: (path: string) => Promise<string>;
  edit: (id: string | null) => void;
  update: (id: string, patch: Partial<CanvasNode>) => void;
}
const Board = createContext<BoardActions | null>(null);
const useBoard = () => useContext(Board)!;

type CardNode = Node<{ card: CanvasNode }>;

function toFlowNodes(data: CanvasData, selected: Set<string>): CardNode[] {
  return data.nodes.map((card) => ({
    id: card.id,
    type: card.type === "file" || card.type === "link" || card.type === "group" ? card.type : "text",
    position: { x: card.x, y: card.y },
    width: card.width,
    height: card.height,
    // Groups stay behind the cards.
    zIndex: card.type === "group" ? 0 : 1,
    selected: selected.has(card.id),
    data: { card },
  }));
}

function toFlowEdges(data: CanvasData, selected: Set<string>): Edge[] {
  return data.edges.map((edge) => {
    const color = colorValue(edge.color) ?? "var(--canvas-edge)";
    const arrow = { type: MarkerType.ArrowClosed, color, width: 18, height: 18 };
    return {
      id: edge.id,
      source: edge.fromNode,
      sourceHandle: edge.fromSide,
      target: edge.toNode,
      targetHandle: edge.toSide,
      label: edge.label,
      selected: selected.has(edge.id),
      markerEnd: edge.toEnd === "none" ? undefined : arrow,
      markerStart: edge.fromEnd === "arrow" ? arrow : undefined,
      style: { stroke: color, strokeWidth: 2 },
      labelBgStyle: { fill: "var(--bg)" },
      labelStyle: { fill: "var(--text)", fontSize: 13 },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
    };
  });
}

/** The colored frame shared by every card: color, resize handles, the four sides to draw arrows from. */
function Card({ id, card, selected, className, children }: { id: string; card: CanvasNode; selected: boolean; className: string; children: ReactNode }) {
  const board = useBoard();
  const color = colorValue(card.color);
  return (
    <div className={`canvas-card ${className}${color ? " colored" : ""}`} style={color ? ({ "--card-color": color } as CSSProperties) : undefined}>
      <NodeResizer
        isVisible={selected && board.editable && board.editing !== id}
        minWidth={80}
        minHeight={40}
        lineClassName="canvas-resize-line"
        handleClassName="canvas-resize-handle"
        onResizeEnd={(_, size) => board.update(id, { x: size.x, y: size.y, width: size.width, height: size.height })}
      />
      {SIDES.map(([side, position]) => (
        <Handle key={side} id={side} type="source" position={position} className="canvas-handle" isConnectable={board.editable} />
      ))}
      {children}
    </div>
  );
}

function TextCard({ id, data, selected }: NodeProps<CardNode>) {
  const board = useBoard();
  const editing = board.editing === id;
  const text = useRef(data.card.text ?? "");
  // The editor is loaded with the card's text when editing starts, not on every keystroke.
  const [source, setSource] = useState(data.card.text ?? "");
  const wasEditing = useRef(false);
  // Leaving the editor writes the text, once (before the text is reset to the card's below).
  useEffect(() => {
    if (wasEditing.current && !editing && text.current !== (data.card.text ?? "")) board.update(id, { text: text.current });
    wasEditing.current = editing;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  useEffect(() => {
    if (editing) return;
    text.current = data.card.text ?? "";
    setSource(data.card.text ?? "");
  }, [data.card.text, editing]);
  return (
    <Card id={id} card={data.card} selected={selected} className="canvas-text">
      <div className={editing ? "canvas-markdown nodrag nowheel nopan editing" : "canvas-markdown"} onDoubleClick={() => board.editable && board.edit(id)}>
        <NoteEditor
          key={editing ? "edit" : "view"}
          source={source}
          // The note editor ends a file with a newline; a card's text keeps its own ending.
          onMarkdown={(markdown) => (text.current = (data.card.text ?? "").endsWith("\n") ? markdown : markdown.replace(/\n$/, ""))}
          bridge={board.bridge}
          editable={editing}
          properties={false}
          onEditor={(editor) => editing && editor?.commands.focus("end")}
        />
      </div>
    </Card>
  );
}

function FileCard({ id, data, selected }: NodeProps<CardNode>) {
  const board = useBoard();
  const file = data.card.file ?? "";
  const { bridge, readFile } = board;
  const [content, setContent] = useState<{ text?: string; image?: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (IMAGE.test(file)) void bridge.loadImage(file).then((image) => !cancelled && setContent({ image }));
    else if (file.toLowerCase().endsWith(".md")) void readFile(file).then((text) => !cancelled && setContent({ text }), () => !cancelled && setContent({}));
    else setContent({});
    return () => {
      cancelled = true;
    };
  }, [file, bridge, readFile]);
  const missing = !bridge.files.includes(file);
  return (
    <Card id={id} card={data.card} selected={selected} className="canvas-file">
      <button className="canvas-file-title nodrag" title={missing ? "Fichier introuvable" : "Ouvrir dans un nouvel onglet"} onClick={() => !missing && bridge.openPath(file, true)}>
        <Icon name={IMAGE.test(file) ? "image" : "doc"} size={13} />
        <span>{noteTitle(file)}</span>
        {data.card.subpath && <span className="canvas-subpath">{data.card.subpath}</span>}
      </button>
      <div className="canvas-file-body nowheel">
        {missing ? (
          <p className="canvas-muted">Fichier introuvable : {file}</p>
        ) : content?.image ? (
          <img src={content.image} alt={noteTitle(file)} draggable={false} />
        ) : content?.text !== undefined ? (
          <div className="canvas-markdown">
            <NoteEditor source={content.text} onMarkdown={() => {}} bridge={bridge} editable={false} properties={false} />
          </div>
        ) : content ? (
          <p className="canvas-muted">Cliquez sur le titre pour ouvrir ce fichier.</p>
        ) : null}
      </div>
    </Card>
  );
}

function LinkCard({ id, data, selected }: NodeProps<CardNode>) {
  const url = data.card.url ?? "";
  const video = youtubeId(url);
  const [preview, setPreview] = useState<PagePreview | null>(null);
  const [broken, setBroken] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setBroken(false);
    setPlaying(false);
    void fetchPreview(url).then((found) => !cancelled && setPreview(found));
    return () => {
      cancelled = true;
    };
  }, [url]);
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // Not a full address: shown as written.
  }
  // A YouTube video: its thumbnail without asking the page (which may answer with a cookie consent), the player on demand.
  const image = video ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : preview?.image && !broken ? preview.image : null;
  return (
    <Card id={id} card={data.card} selected={selected} className={image ? "canvas-link with-image" : "canvas-link"}>
      {video && playing ? (
        <iframe
          className="canvas-link-image nodrag nowheel"
          src={`https://www.youtube-nocookie.com/embed/${video}?autoplay=1`}
          title={preview?.title ?? "Vidéo YouTube"}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : video ? (
        <button className="canvas-link-image canvas-video nodrag" style={{ backgroundImage: `url(${image})` }} aria-label="Lire la vidéo" onClick={() => setPlaying(true)}>
          <span className="canvas-play" />
        </button>
      ) : (
        image && <img className="canvas-link-image" src={image} alt="" draggable={false} onError={() => setBroken(true)} />
      )}
      <div className="canvas-link-text">
        <strong>{preview?.title ?? host}</strong>
        <span className="canvas-url">
          <Icon name="link" size={12} /> {preview?.title ? host : url}
        </span>
        <button className="canvas-open nodrag" onClick={() => openUrl(url)}>
          Ouvrir dans le navigateur
        </button>
      </div>
    </Card>
  );
}

function GroupCard({ id, data, selected }: NodeProps<CardNode>) {
  const board = useBoard();
  const [renaming, setRenaming] = useState(false);
  return (
    <Card id={id} card={data.card} selected={selected} className="canvas-group">
      {renaming ? (
        <input
          className="canvas-group-label nodrag"
          autoFocus
          defaultValue={data.card.label ?? ""}
          onBlur={(e) => {
            setRenaming(false);
            board.update(id, { label: e.target.value.trim() || undefined });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setRenaming(false);
          }}
        />
      ) : (
        <div className="canvas-group-label" onDoubleClick={() => board.editable && setRenaming(true)}>
          {data.card.label || (board.editable ? "Groupe sans nom" : "")}
        </div>
      )}
    </Card>
  );
}

const NODE_TYPES = { text: TextCard, file: FileCard, link: LinkCard, group: GroupCard };

/** A card's box contains another's entirely (the cards of a group move with it). */
const inside = (outer: CanvasNode, inner: CanvasNode) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

const FIT = { padding: 0.2, maxZoom: 1 };

/** Where each canvas was looked at, by path: back to its tab, a canvas shows the same place (for the session). */
const viewports = new Map<string, Viewport>();

/**
 * React Flow moves and zooms the board with `translate(…) scale(…)`. A move
 * by a fraction of a pixel leaves the cards' text blurry until a move lands
 * on whole pixels; the board is shown on whole pixels (see the mind map's
 * `keepSharp`), React Flow keeps writing its own transform, overridden in the
 * style sheet by `--board-transform`.
 *
 * In the app (WebKit), the text could stay blurry after a zoom all the same,
 * painted once and stretched, until the next zoom. So while the board moves,
 * it is a layer of its own (`will-change`), fast to move and allowed to blur;
 * once it stops, the layer goes and the zoom changes by a ten-thousandth,
 * which no one sees: WebKit paints the cards again, at their final size.
 */
function useSharpBoard(wrapper: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const board = wrapper.current?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!board) return;
    let settle = 0;
    /** React Flow's last transform: our own writes to the style are not moves. */
    let last = "";
    const show = (flat: string) => board.style.getPropertyValue("--board-transform") !== flat && board.style.setProperty("--board-transform", flat);
    const update = () => {
      if (board.style.transform === last) return;
      const first = last === "";
      last = board.style.transform;
      const move = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec(last);
      if (!move) return show(last || "none");
      const at = `translate(${Math.round(parseFloat(move[1]))}px, ${Math.round(parseFloat(move[2]))}px)`;
      const zoom = parseFloat(move[3]);
      show(`${at} scale(${zoom})`);
      if (first) return;
      board.style.willChange = "transform";
      clearTimeout(settle);
      settle = window.setTimeout(() => {
        board.style.willChange = "auto";
        show(`${at} scale(${zoom * 1.0001})`);
      }, 150);
    };
    const observer = new MutationObserver(update);
    observer.observe(board, { attributes: true, attributeFilter: ["style"] });
    update();
    return () => {
      observer.disconnect();
      clearTimeout(settle);
    };
  }, [wrapper]);
}

/** The app's bridge and reader change at every render: the cards get stable ones, so their content is not read again. */
function useStable(bridge: VaultBridge, readFile: (path: string) => Promise<string>) {
  const latest = useRef({ bridge, readFile });
  latest.current = { bridge, readFile };
  return useMemo(() => {
    const current = () => latest.current.bridge;
    const stable: VaultBridge = {
      get notePath() {
        return current().notePath;
      },
      get files() {
        return current().files;
      },
      get config() {
        return current().config;
      },
      loadImage: (path) => current().loadImage(path),
      // A page opened from a canvas goes to a new tab: the canvas stays where it was.
      openPath: (path) => current().openPath(path, true),
      askName: (title, initial) => current().askName(title, initial),
      createFile: (path, content) => current().createFile(path, content),
      readNote: (path) => current().readNote!(path),
      queryVault: () => current().queryVault!(),
      toggleTask: (path, line, done) => current().toggleTask!(path, line, done),
    };
    return { bridge: stable, readFile: (path: string) => latest.current.readFile(path) };
  }, []);
}

/** The library's credit in the corner, hidden: a personal tool, not a commercial product (React Flow's MIT licence allows it). */
const PRO_OPTIONS = { hideAttribution: true };

function BoardView({ initial, onChange, editable, theme, ...live }: Omit<CanvasBoardProps, "source"> & { initial: CanvasData }) {
  const { bridge, readFile } = useStable(live.bridge, live.readFile);
  const flow = useReactFlow();
  const [data, setData] = useState(initial);
  const dataRef = useRef(data);
  const past = useRef<CanvasData[]>([]);
  const future = useRef<CanvasData[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [nodes, setNodes] = useState<CardNode[]>(() => toFlowNodes(initial, new Set()));
  const [edges, setEdges] = useState<Edge[]>(() => toFlowEdges(initial, new Set()));
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const [picker, setPicker] = useState<"file" | "link" | null>(null);
  const [labelEdit, setLabelEdit] = useState<{ id: string; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ anchor: DOMRect; items: MenuItem[] } | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  useSharpBoard(wrapper);
  const path = useRef(bridge.notePath).current;
  const [viewport] = useState(() => viewports.get(path));
  /** The pointer over the board (screen coordinates): where ⌘V puts the cards. */
  const pointer = useRef<{ x: number; y: number } | null>(null);
  /** Cards just pasted or duplicated: selected once the board shows them. */
  const selectNext = useRef<Set<string> | null>(null);

  // The board follows the data (after a change, an undo), keeping the selection.
  useEffect(() => {
    const next = selectNext.current;
    selectNext.current = null;
    setNodes((current) => toFlowNodes(data, next ?? new Set(current.filter((n) => n.selected).map((n) => n.id))));
    setEdges((current) => toFlowEdges(data, next ?? new Set(current.filter((e) => e.selected).map((e) => e.id))));
  }, [data]);

  const show = useCallback(
    (next: CanvasData) => {
      dataRef.current = next;
      setData(next);
      onChange(serializeCanvas(next));
    },
    [onChange],
  );
  const commit = useCallback(
    (next: CanvasData) => {
      past.current.push(dataRef.current);
      future.current = [];
      show(next);
    },
    [show],
  );
  const travel = (from: { current: CanvasData[] }, to: { current: CanvasData[] }) => {
    const previous = from.current.pop();
    if (!previous) return;
    to.current.push(dataRef.current);
    show(previous);
  };

  // ⌘Z / ⌘⇧Z undo and redo the board's changes, ⌘C ⌘X ⌘V ⌘D copy, cut, paste and duplicate cards, unless typing in a card or a field.
  const keys = useRef<(key: string, shift: boolean) => boolean>(() => false);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target as Element;
      if (target.closest?.("input, textarea, [contenteditable=true]") || (target !== document.body && !wrapper.current?.contains(target))) return;
      if (keys.current(event.key.toLowerCase(), event.shiftKey)) event.preventDefault();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  const update = useCallback(
    (id: string, patch: Partial<CanvasNode>) => {
      const current = dataRef.current;
      const card = current.nodes.find((n) => n.id === id);
      if (!card || Object.entries(patch).every(([k, v]) => card[k] === v)) return;
      commit({ ...current, nodes: current.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
    },
    [commit],
  );

  /** Adds a card at the center of the view (or centered on `at`, a point of the board). */
  const add = (card: Pick<CanvasNode, "type" | "width" | "height"> & Partial<CanvasNode>, at?: { x: number; y: number }) => {
    const rect = wrapper.current!.getBoundingClientRect();
    const center = at ?? flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    const created = { id: newCanvasId(), x: Math.round(center.x - card.width / 2), y: Math.round(center.y - card.height / 2), ...card } as CanvasNode;
    const current = dataRef.current;
    // A group goes behind the cards, a card on top.
    commit({ ...current, nodes: created.type === "group" ? [created, ...current.nodes] : [...current.nodes, created] });
    return created;
  };

  const selectedNodes = nodes.filter((n) => n.selected).map((n) => n.id);
  const selectedEdges = edges.filter((e) => e.selected).map((e) => e.id);

  const setColor = (color: string | undefined) => {
    const current = dataRef.current;
    commit({
      ...current,
      nodes: current.nodes.map((n) => (selectedNodes.includes(n.id) ? { ...n, color } : n)),
      edges: current.edges.map((e) => (selectedEdges.includes(e.id) ? { ...e, color } : e)),
    });
  };
  const remove = (nodeIds: string[], edgeIds: string[]) => {
    if (nodeIds.length === 0 && edgeIds.length === 0) return;
    const current = dataRef.current;
    const gone = new Set(nodeIds);
    commit({ ...current, nodes: current.nodes.filter((n) => !gone.has(n.id)), edges: current.edges.filter((e) => !edgeIds.includes(e.id) && !gone.has(e.fromNode) && !gone.has(e.toNode)) });
  };
  /** The cards on the clipboard, as a canvas file's text (pasted as cards in a canvas, readable elsewhere). */
  const copy = (ids: string[]) => {
    if (ids.length === 0) return false;
    // A clipboard refused (a browser without the permission) copies nothing.
    writeClipboardText(serializeCanvas(pickCards(dataRef.current, ids))).catch(() => {});
    return true;
  };
  /** Copies of `cards` around `center`, selected. */
  const place = (cards: CanvasData, center: { x: number; y: number }) => {
    const copies = cloneCards(cards, center);
    const current = dataRef.current;
    selectNext.current = new Set([...copies.nodes, ...copies.edges].map((x) => x.id));
    // Groups behind the cards, as when added.
    const groups = copies.nodes.filter((n) => n.type === "group");
    commit({ ...current, nodes: [...groups, ...current.nodes, ...copies.nodes.filter((n) => n.type !== "group")], edges: [...current.edges, ...copies.edges] });
  };
  /** The clipboard pasted at `at` (screen coordinates; the pointer, else the middle of the view): cards copied from a canvas, or text as a text card. */
  const paste = async (at?: { x: number; y: number }) => {
    const text = await readClipboardText().catch(() => "");
    if (!text.trim()) return;
    const rect = wrapper.current!.getBoundingClientRect();
    const screen = at ?? pointer.current ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const center = flow.screenToFlowPosition(screen);
    const cards = text.trimStart().startsWith("{") ? parseCanvas(text) : null;
    if (cards && cards.nodes.length > 0) place(cards, center);
    else selectNext.current = new Set([add({ type: "text", width: 250, height: 60, text: text.replace(/\s+$/, "") }, center).id]);
  };
  /** Copies of the cards next to them (with their arrows). */
  const duplicate = (ids: string[]) => {
    const cards = pickCards(dataRef.current, ids);
    if (cards.nodes.length === 0) return false;
    const center = cardsCenter(cards.nodes);
    place(cards, { x: center.x + 40, y: center.y + 40 });
    return true;
  };
  const cut = (ids: string[]) => {
    if (!copy(ids)) return false;
    remove(ids, []);
    return true;
  };
  keys.current = (key, shift) => {
    const ids = nodesRef.current.filter((n) => n.selected).map((n) => n.id);
    if (key === "c" && !shift) return copy(ids);
    if (!editable) return false;
    if (key === "z") travel(shift ? future : past, shift ? past : future);
    else if (key === "v" && !shift) void paste();
    else if (key === "x" && !shift) return cut(ids);
    else if (key === "d" && !shift) return duplicate(ids);
    else return false;
    return true;
  };

  /** Right-click on a card (or the selection): copy, cut, duplicate, delete. */
  const cardMenu = (event: React.MouseEvent, ids: string[]) => {
    event.preventDefault();
    const items: MenuItem[] = [{ label: "Copier", icon: "copy", run: () => copy(ids) }];
    if (editable)
      items.push(
        { label: "Couper", icon: "copy", run: () => cut(ids) },
        { label: "Dupliquer", icon: "plus", run: () => duplicate(ids) },
        { label: "Supprimer", icon: "trash", danger: true, run: () => remove(ids, edges.filter((e) => e.selected).map((e) => e.id)) },
      );
    setMenu({ anchor: new DOMRect(event.clientX, event.clientY - 4, 0, 0), items });
  };
  /** Right-click on the empty board: paste or add a card there. */
  const boardMenu = (event: React.MouseEvent | MouseEvent) => {
    event.preventDefault();
    if (!editable) return;
    const at = { x: event.clientX, y: event.clientY };
    setMenu({
      anchor: new DOMRect(event.clientX, event.clientY - 4, 0, 0),
      items: [
        { label: "Coller", icon: "copy", run: () => void paste(at) },
        { label: "Ajouter une carte de texte", icon: "text", run: () => setEditing(add({ type: "text", width: 250, height: 60, text: "" }, flow.screenToFlowPosition(at)).id) },
      ],
    });
  };

  const group = () => {
    const cards = dataRef.current.nodes.filter((n) => selectedNodes.includes(n.id));
    if (cards.length === 0) return;
    const x = Math.min(...cards.map((c) => c.x)) - 30;
    const y = Math.min(...cards.map((c) => c.y)) - 50;
    const width = Math.max(...cards.map((c) => c.x + c.width)) + 30 - x;
    const height = Math.max(...cards.map((c) => c.y + c.height)) + 30 - y;
    add({ type: "group", width, height, label: "Groupe" }, { x: x + width / 2, y: y + height / 2 });
  };

  // Dragging a group moves the cards inside it.
  const carried = useRef(new Map<string, { x: number; y: number }>());
  const dragStart = useRef(new Map<string, { x: number; y: number }>());

  const onNodesChange = useCallback((changes: NodeChange<CardNode>[]) => {
    // Removal goes through onDelete (with the arrows); moves are written when the gesture ends.
    setNodes((current) => applyNodeChanges(changes.filter((c) => c.type !== "remove"), current));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((current) => applyEdgeChanges(changes.filter((c) => c.type !== "remove"), current)), []);

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const current = dataRef.current;
    const edge: CanvasEdge = { id: newCanvasId(), fromNode: connection.source, fromSide: (connection.sourceHandle ?? "right") as Side, toNode: connection.target, toSide: (connection.targetHandle ?? "left") as Side };
    commit({ ...current, edges: [...current.edges, edge] });
  };

  const kinds = useMemo(() => NODE_TYPES, []);
  const board = useMemo<BoardActions>(() => ({ editable, editing, bridge, readFile, edit: setEditing, update }), [editable, editing, bridge, readFile, update]);

  return (
    <Board.Provider value={board}>
      <div
        ref={wrapper}
        className="canvas-board"
        onDoubleClick={(event) => {
          // A double click on the empty board adds a text card there, ready to type.
          if (!editable || !(event.target as Element).classList.contains("react-flow__pane")) return;
          const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
          setEditing(add({ type: "text", width: 250, height: 60, text: "" }, at).id);
        }}
        onKeyDown={(event) => event.key === "Escape" && setEditing(null)}
        onPointerMove={(event) => (pointer.current = { x: event.clientX, y: event.clientY })}
        onPointerLeave={() => (pointer.current = null)}
      >
        <ReactFlow
          proOptions={PRO_OPTIONS}
          nodes={nodes}
          edges={edges}
          nodeTypes={kinds}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDelete={({ nodes: deleted, edges: cut }) =>
            remove(
              deleted.map((n) => n.id),
              cut.map((e) => e.id),
            )
          }
          onNodeDragStart={(_, node) => {
            dragStart.current = new Map(nodesRef.current.map((n) => [n.id, { ...n.position }]));
            carried.current.clear();
            const card = dataRef.current.nodes.find((n) => n.id === node.id);
            if (card?.type === "group") for (const other of dataRef.current.nodes) if (other.id !== card.id && inside(card, other)) carried.current.set(other.id, { x: other.x, y: other.y });
          }}
          onNodeDrag={(_, node) => {
            const start = dragStart.current.get(node.id);
            if (!start || carried.current.size === 0) return;
            const dx = node.position.x - start.x;
            const dy = node.position.y - start.y;
            setNodes((current) => current.map((n) => (carried.current.has(n.id) ? { ...n, position: { x: carried.current.get(n.id)!.x + dx, y: carried.current.get(n.id)!.y + dy } } : n)));
          }}
          onNodeDragStop={() => {
            const moved = new Map(nodesRef.current.map((n) => [n.id, n.position]));
            const current = dataRef.current;
            if (current.nodes.every((n) => Math.round(moved.get(n.id)?.x ?? n.x) === n.x && Math.round(moved.get(n.id)?.y ?? n.y) === n.y)) return;
            commit({ ...current, nodes: current.nodes.map((n) => ({ ...n, x: Math.round(moved.get(n.id)?.x ?? n.x), y: Math.round(moved.get(n.id)?.y ?? n.y) })) });
          }}
          onPaneClick={() => {
            setEditing(null);
            setPicker(null);
          }}
          onPaneContextMenu={boardMenu}
          onNodeContextMenu={(event, node) => {
            if (editing === node.id) return;
            // A card outside the selection becomes the selection.
            const selected = nodesRef.current.filter((n) => n.selected).map((n) => n.id);
            if (selected.includes(node.id)) return cardMenu(event, selected);
            setNodes((current) => current.map((n) => ({ ...n, selected: n.id === node.id })));
            setEdges((current) => current.map((e) => ({ ...e, selected: false })));
            cardMenu(event, [node.id]);
          }}
          onSelectionContextMenu={(event, picked) => cardMenu(event, picked.map((n) => n.id))}
          onMoveEnd={(_, view) => viewports.set(path, view)}
          onNodeClick={(_, node) => editing && editing !== node.id && setEditing(null)}
          onEdgeDoubleClick={(event, edge) => editable && setLabelEdit({ id: edge.id, x: event.clientX, y: event.clientY })}
          connectionMode={ConnectionMode.Loose}
          colorMode={theme}
          nodesDraggable={editable}
          nodesConnectable={editable}
          deleteKeyCode={editable && !editing ? ["Backspace", "Delete"] : null}
          zoomOnDoubleClick={false}
          minZoom={0.1}
          maxZoom={2}
          fitView={!viewport}
          defaultViewport={viewport}
          fitViewOptions={FIT}
          attributionPosition="top-right"
        >
          <Background gap={24} size={1.5} color="var(--canvas-dot)" />
          <Controls showInteractive={false} fitViewOptions={FIT} />
        </ReactFlow>

        {editable && (selectedNodes.length > 0 || selectedEdges.length > 0) && !editing && (
          <div className="canvas-selection-bar">
            <button className="canvas-swatch none" title="Sans couleur" aria-label="Sans couleur" onClick={() => setColor(undefined)} />
            {Object.entries(CANVAS_COLORS).map(([key, { name, value }]) => (
              <button key={key} className="canvas-swatch" title={name} aria-label={name} style={{ background: value }} onClick={() => setColor(key)} />
            ))}
            <span className="canvas-bar-separator" />
            {selectedEdges.length === 1 && selectedNodes.length === 0 && (
              <button
                title="Libellé de la flèche"
                aria-label="Libellé de la flèche"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setLabelEdit({ id: selectedEdges[0], x: rect.left + 90, y: rect.bottom + 24 });
                }}
              >
                <Icon name="text" size={15} />
              </button>
            )}
            {selectedNodes.length > 1 && (
              <button title="Grouper" aria-label="Grouper" onClick={group}>
                <Icon name="rectangle" size={15} />
              </button>
            )}
            <button title="Supprimer" aria-label="Supprimer" onClick={() => remove(selectedNodes, selectedEdges)}>
              <Icon name="trash" size={15} />
            </button>
          </div>
        )}

        {editable && (
          <div className="canvas-toolbar">
            <ToolbarButton icon="undo" label="Annuler (⌘Z)" onClick={() => travel(past, future)} disabled={past.current.length === 0} />
            <ToolbarButton icon="redo" label="Rétablir (⌘⇧Z)" onClick={() => travel(future, past)} disabled={future.current.length === 0} />
            <span className="canvas-bar-separator" />
            <ToolbarButton icon="text" label="Ajouter une carte de texte" onClick={() => setEditing(add({ type: "text", width: 250, height: 60, text: "" }).id)} />
            <ToolbarButton icon="doc" label="Ajouter une note ou une image du vault" onClick={() => setPicker(picker === "file" ? null : "file")} active={picker === "file"} />
            <ToolbarButton icon="link" label="Ajouter un lien web" onClick={() => setPicker(picker === "link" ? null : "link")} active={picker === "link"} />
            <ToolbarButton icon="rectangle" label="Ajouter un groupe" onClick={() => add({ type: "group", width: 500, height: 360, label: "Groupe" })} />
            {picker === "file" && (
              <FilePicker
                files={bridge.files.filter((f) => f !== bridge.notePath && (f.endsWith(".md") || IMAGE.test(f)))}
                onPick={(file) => {
                  setPicker(null);
                  add({ type: "file", file, width: 400, height: IMAGE.test(file) ? 300 : 400 });
                }}
                onClose={() => setPicker(null)}
              />
            )}
            {picker === "link" && (
              <LinkInput
                onDone={(url) => {
                  setPicker(null);
                  // A video gets room for its 16:9 picture.
                  if (url) add({ type: "link", url, width: 400, height: youtubeId(url) ? 320 : 200 });
                }}
              />
            )}
          </div>
        )}

        {menu && <PopoverMenu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}

        {labelEdit && (
          <input
            className="canvas-label-input"
            style={{ left: labelEdit.x - 90, top: labelEdit.y - 16 }}
            autoFocus
            placeholder="Libellé"
            defaultValue={dataRef.current.edges.find((e) => e.id === labelEdit.id)?.label ?? ""}
            onBlur={(e) => {
              const label = e.target.value.trim() || undefined;
              const current = dataRef.current;
              setLabelEdit(null);
              if (current.edges.find((x) => x.id === labelEdit.id)?.label !== label) commit({ ...current, edges: current.edges.map((x) => (x.id === labelEdit.id ? { ...x, label } : x)) });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setLabelEdit(null);
            }}
          />
        )}
      </div>
    </Board.Provider>
  );
}

function ToolbarButton({ icon, label, onClick, active = false, disabled = false }: { icon: IconName; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button className={active ? "active" : undefined} title={label} aria-label={label} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={17} />
    </button>
  );
}

function FilePicker({ files, onPick, onClose }: { files: string[]; onPick: (file: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const found = files.filter((f) => f.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 50);
  return (
    <div className="db-popover db-menu canvas-picker">
      <input
        className="db-menu-input"
        autoFocus
        placeholder="Chercher une note ou une image…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setIndex(Math.min(index + 1, found.length - 1));
          else if (e.key === "ArrowUp") setIndex(Math.max(index - 1, 0));
          else if (e.key === "Enter" && found[index]) onPick(found[index]);
          else if (e.key === "Escape") onClose();
          else return;
          e.preventDefault();
        }}
      />
      <div className="canvas-picker-list">
        {found.map((file, i) => (
          <button key={file} className={i === index ? "selected" : undefined} onMouseEnter={() => setIndex(i)} onClick={() => onPick(file)}>
            <Icon name={IMAGE.test(file) ? "image" : "doc"} size={14} />
            <span className="canvas-picker-name">{noteTitle(file)}</span>
            <span className="canvas-picker-folder">{file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ""}</span>
          </button>
        ))}
        {found.length === 0 && <p className="dash-muted">Aucun fichier.</p>}
      </div>
    </div>
  );
}

function LinkInput({ onDone }: { onDone: (url: string | null) => void }) {
  return (
    <div className="db-popover db-menu canvas-picker">
      <input
        className="db-menu-input"
        autoFocus
        placeholder="https://…"
        onKeyDown={(e) => {
          const value = e.currentTarget.value.trim();
          if (e.key === "Enter") onDone(value ? (/^[a-z]+:/i.test(value) ? value : `https://${value}`) : null);
          if (e.key === "Escape") onDone(null);
        }}
      />
    </div>
  );
}

/** A canvas (Obsidian's `.canvas`): cards and arrows on an infinite board. */
export default function CanvasBoard(props: CanvasBoardProps) {
  const initial = useMemo(() => parseCanvas(props.source), [props.source]);
  if (!initial) return <div className="canvas-error">Ce fichier n'est pas un canevas lisible : ouvrez le fichier brut (⌘⇧E) pour le corriger.</div>;
  return (
    <ReactFlowProvider>
      <BoardView initial={initial} onChange={props.onChange} editable={props.editable} theme={props.theme} bridge={props.bridge} readFile={props.readFile} />
    </ReactFlowProvider>
  );
}
