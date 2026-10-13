import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { normalizeText } from "./menu";
import { CALLOUT_TYPES, calloutIconSvg, calloutInfo, calloutPicker } from "./callouts";

/** Menu listing every Obsidian callout type, filtered as you type. */
export function CalloutPicker() {
  const request = useSyncExternalStore(
    (listener) => calloutPicker.subscribe(listener),
    () => calloutPicker.state,
  );
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery("");
    setIndex(request?.current ? Math.max(0, CALLOUT_TYPES.indexOf(calloutInfo(request.current))) : 0);
  }, [request]);

  const q = normalizeText(query);
  const items = CALLOUT_TYPES.filter((c) => !q || [c.type, normalizeText(c.label), ...c.aliases].some((name) => name.includes(q)));
  useEffect(() => {
    list.current?.children[index]?.scrollIntoView({ block: "nearest" });
  }, [index]);
  useEffect(() => setIndex((i) => Math.min(i, Math.max(items.length - 1, 0))), [items.length]);

  if (!request) return null;
  const close = () => calloutPicker.open(null);
  const pick = (type: string | undefined) => {
    if (!type) return;
    close();
    request.onPick(type);
  };
  const top = Math.min(request.y, window.innerHeight - 380);

  return createPortal(
    <div className="callout-picker-backdrop" onMouseDown={close}>
      <div className="block-menu callout-picker" style={{ left: request.x, top: Math.max(8, top) }} onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          placeholder="Type de callout…"
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, items.length - 1));
            else if (e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
            else if (e.key === "Enter") pick(items[index]?.type);
            else if (e.key === "Escape") close();
            else return;
            e.preventDefault();
          }}
          spellCheck={false}
        />
        <div ref={list} className="callout-picker-list">
          {items.map((c, i) => (
            <button key={c.type} className={i === index ? "active" : ""} onMouseEnter={() => setIndex(i)} onClick={() => pick(c.type)}>
              <span className="callout-picker-icon" style={{ color: `rgb(${c.color})` }} dangerouslySetInnerHTML={{ __html: calloutIconSvg(c) }} />
              <span>{c.label}</span>
              <kbd>{[c.type, ...c.aliases].join(", ")}</kbd>
            </button>
          ))}
          {items.length === 0 && <div className="callout-picker-empty">Aucun type.</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
