import { useEffect, useRef, useState } from "react";
import { TagInput } from "./TagInput";
import { fetchTitle, urlIn } from "./web";

const THEME_KEY = "flownote:reading-theme";

/**
 * "Ajouter un lien" (⌘⇧L): the URL, its title (read from the page when
 * allowed, unless typed), the theme, existing or new, and its tags.
 */
export function AddLinkDialog({
  themes,
  tags: knownTags,
  fetchTitles,
  onAdd,
  onClose,
}: {
  themes: string[];
  /** Tags already used in the list, suggested. */
  tags: string[];
  fetchTitles: boolean;
  onAdd: (theme: string | null, title: string, url: string, tags: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  /** The title was typed: never replace it with the page's. */
  const typed = useRef(false);
  const link = urlIn(url);

  useEffect(() => {
    if (!link || !fetchTitles || typed.current) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetchTitle(link).then((found) => {
        if (cancelled) return;
        setLoading(false);
        if (found && !typed.current) setTitle(found);
      });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setLoading(false);
    };
  }, [link, fetchTitles]);

  const submit = async () => {
    if (!link) return setError("Collez une adresse web (https://…).");
    try {
      localStorage.setItem(THEME_KEY, theme.trim());
    } catch {
      // not remembered
    }
    try {
      await onAdd(theme.trim() || null, title.trim(), link, tags);
      onClose();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <form
        className="modal add-link"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <strong>Ajouter un lien</strong>
        <label>
          Adresse
          <input autoFocus value={url} placeholder="https://…" onChange={(e) => (setUrl(e.target.value), setError(""))} />
        </label>
        <label>
          Titre {loading && <small className="add-link-hint">lecture du titre…</small>}
          <input value={title} placeholder={link ?? "Titre (facultatif)"} onChange={(e) => ((typed.current = true), setTitle(e.target.value))} />
        </label>
        <label>
          Thème
          <input value={theme} list="reading-themes" placeholder="Sans thème" onChange={(e) => setTheme(e.target.value)} />
          <datalist id="reading-themes">
            {themes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <div className="add-link-field">
          Tags
          <TagInput tags={tags} suggestions={knownTags} onChange={setTags} />
        </div>
        {error && <p className="status warning">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="primary" disabled={!link}>
            Ajouter
          </button>
        </div>
      </form>
    </div>
  );
}
