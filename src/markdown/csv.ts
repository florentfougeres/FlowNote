/** CSV and tab-separated text (a spreadsheet's clipboard), read into cells. */

/** The delimiter of a CSV text: `;`, `,` or a tab, whichever its first line uses most (a tab wins a tie with a comma). */
export function csvDelimiter(text: string): string {
  const firstLine = text.replace(/^\ufeff/, "").split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, "");
  return [";", "\t", ","].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ",");
}

/** Cells of a CSV text (RFC 4180 quotes), trimmed, empty rows left out. */
export function csvRows(text: string, delimiter = csvDelimiter(text)): string[][] {
  const source = text.replace(/^\ufeff/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) rows.push([...row, cell]);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

/**
 * Text copied from a spreadsheet (Excel, Numbers: cells separated by tabs) or
 * a CSV, as a Markdown table whose first row is the header; null when the
 * text does not look like a table. Comma and semicolon need every row to
 * have the same number of cells and no line ending like a sentence, so that
 * pasted prose stays prose.
 */
export function pastedTable(text: string): string | null {
  if (!/\n./.test(text.trim())) return null;
  const delimiter = csvDelimiter(text);
  const rows = csvRows(text, delimiter);
  const width = Math.max(...rows.map((r) => r.length));
  if (rows.length < 2 || width < 2) return null;
  if (delimiter !== "\t") {
    if (rows.some((r) => r.length !== width)) return null;
    if (text.split(/\r?\n/).some((line) => /[.!?…:]\s*$/.test(line))) return null;
  }
  const cell = (c: string) => c.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => cell(r[i] ?? "")).join(" | ")} |`;
  return [line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n") + "\n";
}
