import { useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../Icon";
import { normalizeTag, tagKey } from "./readingList";
import { useClickOutside } from "../hooks/useClickOutside";

/**
 * Tags as chips with a field to add more: suggestions from the tags already
 * used, Entrée or a comma adds, Retour arrière on the empty field removes the
 * last one.
 */
export function TagInput({
  tags,
  suggestions,
  onChange,
  autoFocus = false,
  placeholder = "Ajouter un tag",
}: {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useClickOutside(box, () => setOpen(false), { active: open });
  const input = useRef<HTMLInputElement>(null);

  const has = new Set(tags.map(tagKey));
  const typed = normalizeTag(text);
  const q = tagKey(text.trim().replace(/^#+/, ""));
  const matches = suggestions.filter((s) => !has.has(tagKey(s)) && tagKey(s).includes(q)).slice(0, 8);
  // "Créer #…" when the typed tag is new.
  const options = typed && !has.has(tagKey(typed)) && !suggestions.some((s) => tagKey(s) === tagKey(typed)) ? [...matches, typed] : matches;
  const isNew = (i: number) => i === matches.length && options.length > matches.length;

  const add = (tag: string | null) => {
    if (tag && !has.has(tagKey(tag))) onChange([...tags, tag]);
    setText("");
    setActive(0);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && text.trim()) {
      e.preventDefault();
      add(open && options[active] !== undefined ? options[active] : typed);
    } else if (e.key === "Backspace" && text === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && options.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    } else if (e.key === "Escape" && (text || (open && options.length > 0))) {
      // Closes the suggestions, not the dialog around.
      e.stopPropagation();
      setText("");
      setOpen(false);
    }
  };

  return (
    <div className="tag-input" ref={box} onMouseDown={(e) => e.target === box.current && (e.preventDefault(), input.current?.focus())}>
      {tags.map((tag) => (
        <span key={tag} className="chip tag-chip">
          #{tag}
          <button type="button" aria-label={`Retirer #${tag}`} onClick={() => onChange(tags.filter((t) => t !== tag))}>
            <Icon name="close" size={10} />
          </button>
        </span>
      ))}
      <input
        ref={input}
        autoFocus={autoFocus}
        value={text}
        placeholder={tags.length ? "" : placeholder}
        aria-label="Tags"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKey}
      />
      {open && options.length > 0 && (
        <div className="db-popover db-menu tag-input-menu" role="listbox">
          {options.map((option, i) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(option)}
            >
              <Icon name={isNew(i) ? "plus" : "tag"} size={13} />
              {isNew(i) ? (
                <span>
                  Créer <strong>#{option}</strong>
                </span>
              ) : (
                <span>#{option}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
