/**
 * Git conflict markers in a working file:
 *
 *   <<<<<<< HEAD
 *   my lines
 *   ||||||| base        (only with merge.conflictStyle=diff3/zdiff3)
 *   ancestor lines
 *   =======
 *   their lines
 *   >>>>>>> branch
 */

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "conflict"; ours: string; base: string | null; theirs: string; oursLabel: string; theirsLabel: string };

export type Choice = "ours" | "theirs" | "both";

const START = /^<{7}(?: (.*))?\r?\n?$/;
const BASE = /^\|{7}(?: .*)?\r?\n?$/;
const SEPARATOR = /^={7}\r?\n?$/;
const END = /^>{7}(?: (.*))?\r?\n?$/;

export function hasConflictMarkers(text: string): boolean {
  return /^<{7}( |$)/m.test(text) && /^={7}\r?$/m.test(text) && /^>{7}( |$)/m.test(text);
}

/** Splits a file into plain text and conflicts. Unbalanced markers are kept as text. */
export function parseConflicts(text: string): Segment[] {
  const lines = text.split(/(?<=\n)/);
  const segments: Segment[] = [];
  let plain = "";
  let i = 0;
  while (i < lines.length) {
    const start = START.exec(lines[i]);
    if (!start) {
      plain += lines[i++];
      continue;
    }
    // Look for the matching separator and end marker.
    let j = i + 1;
    let baseAt = -1;
    let separatorAt = -1;
    let endAt = -1;
    for (; j < lines.length; j++) {
      if (separatorAt < 0 && baseAt < 0 && BASE.test(lines[j])) baseAt = j;
      else if (separatorAt < 0 && SEPARATOR.test(lines[j])) separatorAt = j;
      else if (separatorAt >= 0 && END.test(lines[j])) {
        endAt = j;
        break;
      } else if (START.test(lines[j])) break;
    }
    if (separatorAt < 0 || endAt < 0) {
      plain += lines[i++];
      continue;
    }
    if (plain) segments.push({ kind: "text", text: plain });
    plain = "";
    const oursEnd = baseAt >= 0 ? baseAt : separatorAt;
    segments.push({
      kind: "conflict",
      ours: lines.slice(i + 1, oursEnd).join(""),
      base: baseAt >= 0 ? lines.slice(baseAt + 1, separatorAt).join("") : null,
      theirs: lines.slice(separatorAt + 1, endAt).join(""),
      oursLabel: start[1] ?? "",
      theirsLabel: END.exec(lines[endAt])![1] ?? "",
    });
    i = endAt + 1;
  }
  if (plain) segments.push({ kind: "text", text: plain });
  return segments;
}

export function conflictCount(segments: Segment[]): number {
  return segments.filter((s) => s.kind === "conflict").length;
}

/** Rebuilds the file with one choice per conflict (in order); undecided conflicts keep their markers. */
export function resolveConflicts(segments: Segment[], choices: (Choice | undefined)[]): string {
  let index = 0;
  return segments
    .map((segment) => {
      if (segment.kind === "text") return segment.text;
      const choice = choices[index++];
      if (choice === "ours") return segment.ours;
      if (choice === "theirs") return segment.theirs;
      if (choice === "both") return segment.ours + (segment.ours && !segment.ours.endsWith("\n") ? "\n" : "") + segment.theirs;
      const base = segment.base !== null ? `||||||| base\n${segment.base}` : "";
      return `<<<<<<< ${segment.oursLabel}\n${segment.ours}${base}=======\n${segment.theirs}>>>>>>> ${segment.theirsLabel}\n`;
    })
    .join("");
}
