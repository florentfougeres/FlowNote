import { useEffect, useRef } from "react";

/** Plain-text editing of the note's Markdown, with no rendering at all. */
export function RawEditor({ value, onChange, readOnly }: { value: string; onChange: (markdown: string) => void; readOnly?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grows with its content so the page scrolls, not the textarea.
  useEffect(() => {
    const area = ref.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }, [value]);

  useEffect(() => ref.current?.focus({ preventScroll: true }), []);

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
  const lines = value.split("\n");
  return (
    <div className="raw-editor">
      <div className="raw-lines" aria-hidden="true">
        {lines.map((line, i) => (
          <div key={i} data-line={i + 1}>
            {line || "\u200b"}
          </div>
        ))}
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
