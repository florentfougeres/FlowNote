import type { ReactNode } from "react";
import { parseDiff, type DiffLine } from "./vault/git";

/** Splits a changed line pair into common prefix, changed middle and common suffix (on word boundaries). */
function changedSpan(before: string, after: string): [number, number, number, number] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  while (start > 0 && /\w/u.test(before[start - 1] ?? "")) start--;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  while (end > 0 && /\w/u.test(before[before.length - end] ?? "")) end--;
  return [start, before.length - end, start, after.length - end];
}

function highlight(text: string, from: number, to: number): ReactNode {
  if (from >= to) return text;
  return (
    <>
      {text.slice(0, from)}
      <mark>{text.slice(from, to)}</mark>
      {text.slice(to)}
    </>
  );
}

function row(line: DiffLine, key: string, content: ReactNode) {
  const sign = line.kind === "add" ? "+" : line.kind === "del" ? "−" : line.kind === "note" ? "\\" : " ";
  return (
    <tr key={key} className={`diff-${line.kind}`}>
      <td className="diff-number">{line.oldNumber ?? ""}</td>
      <td className="diff-number">{line.newNumber ?? ""}</td>
      <td className="diff-sign">{sign}</td>
      <td className="diff-text">{content}</td>
    </tr>
  );
}

/** Renders hunk lines, highlighting the changed words of paired deletions/additions. */
function renderLines(lines: DiffLine[]): ReactNode[] {
  const rows: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind !== "del") {
      rows.push(row(lines[i], `${i}`, lines[i].text));
      i++;
      continue;
    }
    let dels = i;
    while (dels < lines.length && lines[dels].kind === "del") dels++;
    let adds = dels;
    while (adds < lines.length && lines[adds].kind === "add") adds++;
    const removed = lines.slice(i, dels);
    const added = lines.slice(dels, adds);
    const paired = removed.length === added.length;
    removed.forEach((line, k) => {
      const span = paired ? changedSpan(line.text, added[k].text) : null;
      rows.push(row(line, `${i + k}`, span ? highlight(line.text, span[0], span[1]) : line.text));
    });
    added.forEach((line, k) => {
      const span = paired ? changedSpan(removed[k].text, line.text) : null;
      rows.push(row(line, `${dels + k}`, span ? highlight(line.text, span[2], span[3]) : line.text));
    });
    i = adds;
  }
  return rows;
}

/** A unified diff as a table with line numbers. */
export function DiffView({ diff, empty = "Pas de différence à afficher." }: { diff: string; empty?: string }) {
  const hunks = parseDiff(diff);
  if (hunks.length === 0) return <p className="git-none">{diff.includes("Binary") ? "Fichier binaire modifié." : empty}</p>;
  return (
    <div className="diff-scroll">
      <table className="diff">
        {hunks.map((hunk, h) => (
          <tbody key={h}>
            <tr className="diff-hunk">
              <td colSpan={4}>{hunk.header}</td>
            </tr>
            {renderLines(hunk.lines)}
          </tbody>
        ))}
      </table>
    </div>
  );
}
