import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { resolveLink } from "../vault/links";
import { hasValue, ValueView, type ColumnInfo } from "./columns";
import type { BaseRow } from "./rows";

/** The image link of a row: its cover property, else the note's first image. */
export function coverOf(row: BaseRow, property: string | null): string | null {
  const raw = property ? row.values[property] : row.image;
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (typeof text !== "string" || !text.trim()) return null;
  return text
    .trim()
    .replace(/^!?\[\[([^\]|#]+).*\]\]$/, "$1")
    .replace(/^!\[[^\]]*\]\(([^)\s]+)\)$/, "$1");
}

function Cover({ row, image, files, loadImage }: { row: BaseRow; image: string | null; files: string[]; loadImage: (path: string) => Promise<string> }) {
  const link = coverOf(row, image) ?? (image ? coverOf(row, null) : null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!link) return;
    if (/^https?:/i.test(link)) return setUrl(link);
    const path = resolveLink(decodeURI(link), files, row.path);
    if (path) void loadImage(path).then(setUrl, () => setUrl(null));
  }, [link, files, row.path, loadImage]);
  return <div className="db-gallery-cover">{url ? <img src={url} alt="" draggable={false} /> : <Icon name="doc" size={28} />}</div>;
}

/** The gallery view (Obsidian's `cards`): a card per row, with a cover image. */
export function GalleryView({
  rows,
  shown,
  formulas,
  image,
  files,
  editable,
  loadImage,
  onOpen,
  onNewRow,
}: {
  rows: BaseRow[];
  shown: ColumnInfo[];
  formulas: Record<string, string>;
  /** Property holding the cover, or null for the note's first image. */
  image: string | null;
  files: string[];
  editable: boolean;
  loadImage: (path: string) => Promise<string>;
  onOpen: (path: string, newTab: boolean) => void;
  onNewRow: () => void;
}) {
  return (
    <div className="db-gallery">
      {rows.map((row) => (
        <button key={row.path} className="db-gallery-card" onClick={(e) => onOpen(row.path, e.metaKey || e.ctrlKey)}>
          <Cover row={row} image={image} files={files} loadImage={loadImage} />
          <span className="db-card-title">{row.name}</span>
          {shown.filter((c) => hasValue(c, row, formulas)).map((c) => (
            <span key={c.property} className="db-card-prop" title={c.label}>
              <ValueView column={c} row={row} formulas={formulas} />
            </span>
          ))}
        </button>
      ))}
      {editable && (
        <button className="db-gallery-card db-gallery-new" onClick={onNewRow}>
          <Icon name="plus" size={16} /> Nouveau
        </button>
      )}
    </div>
  );
}
