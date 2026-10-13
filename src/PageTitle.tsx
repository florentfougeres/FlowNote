import { useEffect, useState } from "react";

/** The page title is the file name: editing it renames the note (Enter or leaving the field). */
export function PageTitle({ title, onRename, readOnly }: { title: string; onRename: (title: string) => Promise<boolean>; readOnly?: boolean }) {
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);

  const commit = async () => {
    const next = value.trim();
    if (!next || next === title) return setValue(title);
    if (!(await onRename(next))) setValue(title);
  };

  return (
    <input
      className="page-title"
      value={value}
      readOnly={readOnly}
      spellCheck={false}
      aria-label="Titre de la page"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setValue(title);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}
