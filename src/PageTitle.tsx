import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { IconPicker } from "./IconPicker";

/**
 * The page title is the file name: editing it renames the page (Enter or
 * leaving the field). Pages with a title of their own (a note's first
 * `# heading`, a presentation's `title`) show it instead, with the file name
 * under it: editing one never changes the other. Above it, like in Notion, the page icon (an emoji in the
 * `icon` property) or, on hover, a button to add one.
 */
export function PageTitle({
  title,
  fileName,
  onRenameFile,
  onRename,
  readOnly,
  icon,
  onIcon,
}: {
  title: string;
  /** The file's name (without `.md`), shown under a title of the page's own, and how to rename the file. */
  fileName?: string;
  onRenameFile?: (name: string) => Promise<boolean>;
  onRename: (title: string) => Promise<boolean>;
  readOnly?: boolean;
  /** Current icon; undefined when the page cannot have one (drawings). */
  icon?: string | null;
  onIcon?: (icon: string | null) => void;
}) {
  const [value, setValue] = useState(title);
  const [picker, setPicker] = useState<DOMRect | null>(null);
  useEffect(() => setValue(title), [title]);

  const commit = async () => {
    const next = value.trim();
    if (!next || next === title) return setValue(title);
    if (!(await onRename(next))) setValue(title);
  };
  const canEditIcon = onIcon !== undefined && !readOnly;
  const openPicker = (event: React.MouseEvent) => setPicker((event.currentTarget as HTMLElement).getBoundingClientRect());

  return (
    <div className={icon ? "page-heading has-icon" : "page-heading"}>
      {icon ? (
        <button className="page-heading-icon" onClick={canEditIcon ? openPicker : undefined} disabled={!canEditIcon} aria-label="Changer l'icône" title="Changer l'icône">
          {icon}
        </button>
      ) : (
        canEditIcon && (
          <div className="page-heading-actions">
            <button onClick={openPicker}>
              <Icon name="smile" size={14} /> Ajouter une icône
            </button>
          </div>
        )
      )}
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
      {fileName !== undefined && onRenameFile && <FileName name={fileName} onRename={onRenameFile} readOnly={readOnly} />}
      {picker && onIcon && <IconPicker anchor={picker} current={icon ?? null} onPick={onIcon} onClose={() => setPicker(null)} />}
    </div>
  );
}

/** The file's name under the title: a click edits it, Enter renames the file. */
function FileName({ name, onRename, readOnly }: { name: string; onRename: (name: string) => Promise<boolean>; readOnly?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = async () => {
    const next = draft?.trim();
    setDraft(null);
    if (next && next !== name) await onRename(next);
  };
  if (draft === null) {
    return (
      <button className="page-file" onClick={() => setDraft(name)} disabled={readOnly} title="Renommer le fichier">
        {name}.md
      </button>
    );
  }
  return (
    <input
      className="page-file editing"
      value={draft}
      autoFocus
      spellCheck={false}
      aria-label="Nom du fichier"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(null);
      }}
    />
  );
}
