import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import DOCUMENTATION from "./documentation.md?raw";
import { docsBridge } from "./docsBridge";
import { NoteEditor } from "../editor/NoteEditor";
import { OutlinePanel } from "../OutlinePanel";
import { clearFind, findState, findStep, setFindQuery } from "../editor/find";
import { Icon } from "../Icon";
import { keys } from "../keys";

/**
 * The documentation shipped with the app (`flownote:docs`): the text read-only,
 * and on its side a search field (the occurrences highlighted in the text,
 * ↵ for the next one) above the outline.
 */
export function DocsPage({ dark }: { dark: boolean }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [query, setQuery] = useState("");
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const input = useRef<HTMLInputElement>(null);
  const bridge = useMemo(() => docsBridge(dark), [dark]);
  const live = editor && !editor.isDestroyed ? editor : null;

  useEffect(() => {
    if (!live) return;
    setFindQuery(live.view, query, false);
    rerender();
  }, [live, query]);

  // ⌘F goes to the field (the page has no find bar of its own).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { matches, current } = live ? findState(live.state) : { matches: [], current: 0 };
  const total = matches.length;
  const step = (direction: 1 | -1) => {
    if (!live) return;
    findStep(live.view, direction);
    rerender();
  };
  const clear = () => {
    setQuery("");
    if (live) clearFind(live.view);
  };

  return (
    <div className="panes">
      <div className="page docs-page">
        <NoteEditor key={`docs-${dark}`} source={DOCUMENTATION} onMarkdown={() => {}} bridge={bridge} editable={false} properties={false} onEditor={setEditor} />
      </div>
      <div className="side-column docs-side">
        <div className="docs-search find-row" role="search">
          <Icon name="search" size={13} />
          <input
            ref={input}
            value={query}
            placeholder="Rechercher dans la doc"
            aria-label="Rechercher dans la documentation"
            title={keys("Rechercher (⌘F)")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") return clear();
              if (e.key !== "Enter") return;
              e.preventDefault();
              step(e.shiftKey ? -1 : 1);
            }}
            spellCheck={false}
          />
          {query && (
            <>
              <span className="find-count">{total ? `${current + 1}/${total}` : "0"}</span>
              <button onClick={() => step(-1)} disabled={!total} aria-label="Précédent (⇧↵)">
                <Icon name="chevronUp" size={12} />
              </button>
              <button onClick={() => step(1)} disabled={!total} aria-label="Suivant (↵)">
                <Icon name="chevronDown" size={12} />
              </button>
            </>
          )}
        </div>
        <OutlinePanel editor={editor} />
      </div>
    </div>
  );
}
