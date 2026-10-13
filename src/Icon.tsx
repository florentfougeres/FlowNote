/**
 * Line icons in the spirit of SF Symbols: 16-unit grid, 1.4 stroke, round caps,
 * drawn in the current text colour so they follow the theme.
 */
const PATHS: Record<string, string> = {
  doc: "M4.25 1.75h4.5l3 3v9.5h-7.5z M8.75 1.75v3h3 M6.25 8.25h3.5 M6.25 10.75h3.5",
  folder: "M1.75 4.5c0-.6.4-1 1-1h3.1l1.4 1.5h5.9c.6 0 1 .4 1 1v6.25c0 .6-.4 1-1 1h-10.4c-.6 0-1-.4-1-1z",
  chevronRight: "M6.25 3.75 10.5 8l-4.25 4.25",
  chevronLeft: "M9.75 3.75 5.5 8l4.25 4.25",
  chevronDown: "M3.75 6.25 8 10.5l4.25-4.25",
  search: "M11.75 7.25a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0z M10.5 10.5 14 14",
  sliders: "M2 4.5h7.5 M12.5 4.5H14 M2 11.5h1.5 M6.5 11.5H14 M12.5 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z M6.5 11.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z",
  branch: "M6 3.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z M6 12.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z M13 4.75a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z M4.5 5v6 M11.5 6.25c0 3.25-7 2.25-7 4.75",
  clock: "M14.25 8a6.25 6.25 0 1 1-12.5 0 6.25 6.25 0 0 1 12.5 0z M8 4.75V8l2.25 1.5",
  sidebar: "M3.75 2.75h8.5a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2h-8.5a2 2 0 0 1-2-2v-6.5a2 2 0 0 1 2-2z M6.25 2.75v10.5",
  code: "M5.5 4.5 2 8l3.5 3.5 M10.5 4.5 14 8l-3.5 3.5",
  plus: "M8 3v10 M3 8h10",
  trash: "M2.75 4.5h10.5 M6.25 4.5V3h3.5v1.5 M4.25 4.5l.75 9.25h6l.75-9.25 M6.75 7v4 M9.25 7v4",
  question: "M14.25 8a6.25 6.25 0 1 1-12.5 0 6.25 6.25 0 0 1 12.5 0z M6.25 6.3a1.8 1.8 0 1 1 2.65 1.6c-.55.3-.9.65-.9 1.3v.3 M8 11.5v.01",
  close: "M4 4l8 8 M12 4l-8 8",
  compose: "M8.25 2.75H3.75c-.55 0-1 .45-1 1v8.5c0 .55.45 1 1 1h8.5c.55 0 1-.45 1-1V7.75 M11.75 2.25l2 2-5.75 5.75-2.5.5.5-2.5z",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
