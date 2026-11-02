import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAutoHeight } from "./hooks/useAutoHeight";
import type { FindTarget } from "./FindBar";

interface Match {
  from: number;
  to: number;
}

/** Where `query` is found in `text`. */
export function textMatches(text: string, query: string, caseSensitive: boolean): Match[] {
  if (!query) return [];
  const lower = !caseSensitive && text.toLowerCase().length === text.length;
  // Lowercasing that changes a length (rare letters) would shift positions: searched as typed then.
  const haystack = lower ? text.toLowerCase() : text;
  const needle = lower ? query.toLowerCase() : query;
  const matches: Match[] = [];
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) matches.push({ from: at, to: at + needle.length });
  return matches;
}

/** The line's text, its matches marked (the line starts at `start` in the text). */
function markedLine(line: string, start: number, matches: Match[], current: number): ReactNode {
  const parts: ReactNode[] = [];
  let at = 0;
  matches.forEach((match, i) => {
    if (match.to <= start || match.from >= start + line.length) return;
    const from = Math.max(match.from - start, 0);
    const to = Math.min(match.to - start, line.length);
    if (from > at) parts.push(line.slice(at, from));
    parts.push(
      <mark key={i} className={i === current ? "find-match current" : "find-match"}>
        {line.slice(from, to)}
      </mark>,
    );
    at = to;
  });
  if (parts.length === 0) return line || "​";
  if (at < line.length) parts.push(line.slice(at));
  return parts;
}

/** Plain-text editing of the note's Markdown, with no rendering at all. */
export function RawEditor({
  value,
  onChange,
  readOnly,
  onFindTarget,
}: {
  value: string;
  onChange: (markdown: string) => void;
  readOnly?: boolean;
  /** Receives what the find bar (⌘F) works on while this editor is shown. */
  onFindTarget?: (target: FindTarget | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const [find, setFind] = useState({ query: "", caseSensitive: false, current: -1 });
  const matches = useMemo(() => textMatches(value, find.query, find.caseSensitive), [value, find.query, find.caseSensitive]);
  const current = matches.length === 0 ? -1 : Math.min(Math.max(find.current, 0), matches.length - 1);

  // Grows with its content so the page scrolls, not the textarea.
  useAutoHeight(ref, value);

  useEffect(() => ref.current?.focus({ preventScroll: true }), []);

  // The find bar reads the latest text through this.
  const latest = useRef({ value, matches, current, readOnly, onChange });
  latest.current = { value, matches, current, readOnly, onChange };
  const listeners = useRef(new Set<() => void>());
  /** The current match is scrolled to after the next render (a search, a step, a replacement). */
  const revealNext = useRef(false);
  useEffect(() => {
    for (const listener of listeners.current) listener();
    if (!revealNext.current) return;
    revealNext.current = false;
    mirror.current?.querySelector(".find-match.current")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [value, find, current]);

  useEffect(() => {
    if (!onFindTarget) return;
    /** Replaces `from`–`to` by `text` as if typed (native undo kept); the focus goes back where it was. */
    const edit = (from: number, to: number, text: string) => {
      const area = ref.current;
      if (!area || latest.current.readOnly) return;
      const back = document.activeElement as HTMLElement | null;
      area.focus({ preventScroll: true });
      area.setSelectionRange(from, to);
      if (!document.execCommand(text ? "insertText" : "delete", false, text)) latest.current.onChange(area.value.slice(0, from) + text + area.value.slice(to));
      back?.focus({ preventScroll: true });
    };
    const hide = () => setFind((f) => ({ ...f, query: "" }));
    const subscribers = listeners.current;
    onFindTarget({
      search(query, caseSensitive, occurrence) {
        // The first match from the cursor, as in the rendered note.
        const cursor = ref.current?.selectionStart ?? 0;
        const nearest = textMatches(latest.current.value, query, caseSensitive).findIndex((m) => m.from >= cursor);
        revealNext.current = true;
        setFind({ query, caseSensitive, current: occurrence ?? Math.max(nearest, 0) });
      },
      counts: () => ({ total: latest.current.matches.length, current: latest.current.current }),
      step(direction) {
        const { matches: all, current: at } = latest.current;
        if (all.length === 0) return;
        revealNext.current = true;
        setFind((f) => ({ ...f, current: (at + direction + all.length) % all.length }));
      },
      replaceCurrent(text) {
        const match = latest.current.matches[latest.current.current];
        if (!match) return;
        revealNext.current = true;
        edit(match.from, match.to, text);
      },
      replaceAll(text) {
        const { value: all, matches: found } = latest.current;
        if (found.length === 0) return;
        let result = "";
        let at = 0;
        for (const match of found) {
          result += all.slice(at, match.from) + text;
          at = match.to;
        }
        // The whole text in one edit: one undo step.
        edit(0, all.length, result + all.slice(at));
      },
      close(select) {
        const match = latest.current.matches[latest.current.current];
        hide();
        ref.current?.focus({ preventScroll: true });
        if (select && match) ref.current?.setSelectionRange(match.from, match.to);
      },
      editable: () => !latest.current.readOnly,
      subscribe(listener) {
        subscribers.add(listener);
        return () => {
          subscribers.delete(listener);
          hide();
        };
      },
    });
    return () => onFindTarget(null);
  }, [onFindTarget]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    const area = event.currentTarget;
    const { selectionStart: start, selectionEnd: end } = area;
    // execCommand keeps the native undo stack.
    if (!event.shiftKey) document.execCommand("insertText", false, "\t");
    else {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const indent = /^(\t| {1,4})/.exec(value.slice(lineStart))?.[0];
      if (!indent) return;
      area.setSelectionRange(lineStart, lineStart + indent.length);
      document.execCommand("delete");
      area.setSelectionRange(Math.max(lineStart, start - indent.length), Math.max(lineStart, end - indent.length));
    }
  };

  // Line numbers: an invisible copy of the text, wrapped like the textarea,
  // sits underneath so each number lines up with its line even when it wraps.
  // The find bar's matches are marked in it.
  const lines = value.split("\n");
  let start = 0;
  return (
    <div className="raw-editor">
      <div className="raw-lines" aria-hidden="true" ref={mirror}>
        {lines.map((line, i) => {
          const marked = markedLine(line, start, matches, current);
          start += line.length + 1;
          return (
            <div key={i} data-line={i + 1}>
              {marked}
            </div>
          );
        })}
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        readOnly={readOnly}
        spellCheck={false}
        aria-label="Markdown de la note"
      />
    </div>
  );
}
