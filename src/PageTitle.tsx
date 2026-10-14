import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { IconPicker } from "./IconPicker";

/**
 * The page title is the file name: editing it renames the note (Enter or
 * leaving the field). Above it, like in Notion, the page icon (an emoji in the
 * `icon` property) or, on hover, a button to add one.
 */
export function PageTitle({
  title,
  onRename,
  readOnly,
  icon,
  onIcon,
}: {
  title: string;
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
      {picker && onIcon && <IconPicker anchor={picker} current={icon ?? null} onPick={onIcon} onClose={() => setPicker(null)} />}
    </div>
  );
}
