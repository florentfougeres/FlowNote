/**
 * The source of a flowchart.js diagram (```flow blocks) as steps and links,
 * for the visual editor, and back. Steps are `id=>type: text` lines, links the
 * `a->b(right)->cond(yes)->c` chains. What the editor does not show (a step's
 * flowstate or link, line styles, annotations) is kept as written.
 */

export type FlowStepType = "start" | "end" | "operation" | "inputoutput" | "subroutine" | "condition" | "parallel";

export interface FlowStep {
  id: string;
  type: FlowStepType;
  text: string;
  /** What follows the text on its line and the lines it continues on (`|past`, `:>http://…`), kept as is. */
  suffix: string;
  /** Parameters written after the id (`op(align-next=no)`), kept as is. */
  params: string;
}

export type FlowBranch = "yes" | "no" | "path1" | "path2" | "path3";
export type FlowDirection = "left" | "right" | "top" | "bottom";

export interface FlowLink {
  from: string;
  to: string;
  /** Which way out of a condition (yes, no) or a parallel step (path1…). */
  branch?: FlowBranch;
  /** Side of the source the arrow leaves from; flowchart.js picks it otherwise. */
  direction?: FlowDirection;
  /** The source line the link was read from: links of one chain are written on one line again. */
  line?: number;
}

export interface FlowModel {
  steps: FlowStep[];
  links: FlowLink[];
  /** Lines the editor does not model (line styles `a@>b({…})`, annotated links), written after the links. */
  extra: string[];
}

export const FLOW_STEP_TYPES: [FlowStepType, string][] = [
  ["start", "Début"],
  ["operation", "Étape"],
  ["condition", "Condition"],
  ["inputoutput", "Entrée / sortie"],
  ["subroutine", "Sous-programme"],
  ["parallel", "Parallèle"],
  ["end", "Fin"],
];

export const FLOW_DIRECTIONS: [FlowDirection, string][] = [
  ["bottom", "En bas"],
  ["right", "À droite"],
  ["left", "À gauche"],
  ["top", "En haut"],
];

/** The ways out of a step: two for a condition, three for a parallel step, one otherwise. */
export function branchesOf(type: FlowStepType | undefined): FlowBranch[] {
  if (type === "condition") return ["yes", "no"];
  if (type === "parallel") return ["path1", "path2", "path3"];
  return [];
}

export const BRANCH_LABELS: Record<FlowBranch, string> = { yes: "oui", no: "non", path1: "voie 1", path2: "voie 2", path3: "voie 3" };

const STEP_TYPES = new Set<string>(FLOW_STEP_TYPES.map(([type]) => type));
const DIRECTIONS = new Set<string>(["left", "right", "top", "bottom"]);
const BRANCHES = new Set<string>(["yes", "no", "path1", "path2", "path3"]);
const DEFINITION = /^([^\s()=>@-][^\s()=>@]*)(\([^)]*\))?=>(\w+)(.*)$/;

/** A link's source or target: `cond(yes, right)` → its id and what is in parentheses. */
function readSegment(segment: string): { id: string; branch?: FlowBranch; direction?: FlowDirection } | null {
  const match = /^([^\s()]+)(?:\(([^)]*)\))?$/.exec(segment.trim());
  if (!match) return null;
  const result: { id: string; branch?: FlowBranch; direction?: FlowDirection } = { id: match[1] };
  for (const raw of (match[2] ?? "").split(",")) {
    const part = raw.trim().replace(/^true$/, "yes").replace(/^false$/, "no");
    if (!part) continue;
    if (BRANCHES.has(part)) result.branch = part as FlowBranch;
    else if (DIRECTIONS.has(part)) result.direction = part as FlowDirection;
    else return null;
  }
  return result;
}

/** The steps and links of a flowchart.js source. */
export function parseFlow(source: string): FlowModel {
  const model: FlowModel = { steps: [], links: [], extra: [] };
  let last: FlowStep | null = null;
  for (const [index, raw] of source.split("\n").entries()) {
    const line = raw.trim();
    if (!line) {
      last = null;
      continue;
    }
    const definition = line.includes("=>") ? DEFINITION.exec(line) : null;
    if (definition && STEP_TYPES.has(definition[3])) {
      let rest = definition[4];
      let text = "";
      if (rest.startsWith(": ")) {
        rest = rest.slice(2);
        const cut = rest.search(/\||:>|:\$/);
        text = cut < 0 ? rest : rest.slice(0, cut);
        rest = cut < 0 ? "" : rest.slice(cut);
      }
      last = { id: definition[1], params: definition[2] ?? "", type: definition[3] as FlowStepType, text, suffix: rest };
      model.steps.push(last);
      continue;
    }
    if (line.includes("->") && !line.includes("@") && !line.includes("=>")) {
      const segments = line.split("->").map(readSegment);
      if (segments.every((s) => s !== null) && segments.length > 1) {
        for (let i = 0; i + 1 < segments.length; i++) {
          const { id, branch, direction } = segments[i]!;
          model.links.push({ from: id, to: segments[i + 1]!.id, ...(branch ? { branch } : {}), ...(direction ? { direction } : {}), line: index });
        }
        last = null;
        continue;
      }
    }
    // A line without an arrow continues the step above it, as in flowchart.js.
    if (last && !line.includes("->") && !line.includes("=>") && !line.includes("@>")) {
      last.suffix += `\n${raw}`;
      continue;
    }
    model.extra.push(raw);
    last = null;
  }
  return model;
}

const segment = (id: string, link?: FlowLink): string => {
  const spec = [link?.branch, link?.direction].filter(Boolean).join(", ");
  return spec ? `${id}(${spec})` : id;
};

/**
 * The source of a model: the steps, a blank line, then the links, chained
 * while each one leaves from where the previous one arrived
 * (`st->op->cond`) on the line they were read from, or new ones without a
 * branch; then the lines kept as written.
 */
export function serializeFlow(model: FlowModel): string {
  // A step without text has no `: ` (`e=>end`), unless a flowstate needs it (`op=>operation: |past`).
  const lines = model.steps.map((s) => `${s.id}${s.params}=>${s.type}${s.text || s.suffix.startsWith("|") ? `: ${s.text}` : ""}${s.suffix}`);
  const chains: string[] = [];
  let chain: string[] = [];
  let previous: FlowLink | null = null;
  for (const link of model.links) {
    const sameLine = previous?.line !== undefined ? link.line === previous.line : link.line === undefined && !link.branch;
    if (previous && link.from === previous.to && sameLine) {
      chain[chain.length - 1] = segment(link.from, link);
    } else {
      if (chain.length) chains.push(chain.join("->"));
      chain = [segment(link.from, link)];
    }
    chain.push(link.to);
    previous = link;
  }
  if (chain.length) chains.push(chain.join("->"));
  return [lines.join("\n"), chains.join("\n"), model.extra.join("\n")].filter(Boolean).join("\n\n");
}

/** An id that no step has yet, from the type's usual prefix (`op1`, `cond2`…). */
export function newStepId(model: FlowModel, type: FlowStepType): string {
  const prefix = { start: "st", end: "e", operation: "op", inputoutput: "io", subroutine: "sub", condition: "cond", parallel: "para" }[type];
  const taken = new Set(model.steps.map((s) => s.id));
  if ((type === "start" || type === "end") && !taken.has(prefix)) return prefix;
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** The model without a step and the links to and from it. */
export function removeStep(model: FlowModel, id: string): FlowModel {
  return { ...model, steps: model.steps.filter((s) => s.id !== id), links: model.links.filter((l) => l.from !== id && l.to !== id) };
}

/** The model with a step's type changed: links on a way out the new type does not have lose it. */
export function setStepType(model: FlowModel, id: string, type: FlowStepType): FlowModel {
  const branches = branchesOf(type);
  return {
    ...model,
    steps: model.steps.map((s) => (s.id === id ? { ...s, type } : s)),
    links: model.links.map((l) => {
      if (l.from !== id || !l.branch || branches.includes(l.branch)) return l;
      const { branch: _branch, ...rest } = l;
      return branches.length ? { ...rest, branch: branches[0] } : rest;
    }),
  };
}

/**
 * A new step after `after` (or at the end), linked from it when it has a
 * free way out, or slipped into its arrow when it has a single one
 * (`op->cond` becomes `op->op1->cond`).
 */
export function addStep(model: FlowModel, type: FlowStepType, after?: string): { model: FlowModel; id: string } {
  const id = newStepId(model, type);
  const step: FlowStep = { id, type, text: "", suffix: "", params: "" };
  const index = after ? model.steps.findIndex((s) => s.id === after) : -1;
  const steps = index < 0 ? [...model.steps, step] : [...model.steps.slice(0, index + 1), step, ...model.steps.slice(index + 1)];
  const from = after ? model.steps.find((s) => s.id === after) : undefined;
  if (!from || from.type === "end") return { model: { ...model, steps }, id };
  const used = model.links.filter((l) => l.from === from.id);
  const branches = branchesOf(from.type);
  const free = branches.find((b) => !used.some((l) => l.branch === b));
  if (!branches.length && used.length === 1) {
    // Both halves stay on the arrow's line: its chain is written as one.
    const arrow = used[0];
    const links = model.links.flatMap((l) => (l === arrow ? [{ ...l, to: id }, { ...l, from: id }] : [l]));
    return { model: { ...model, steps, links }, id };
  }
  if (branches.length ? !free : used.length > 0) return { model: { ...model, steps }, id };
  return { model: { ...model, steps, links: [...model.links, { from: from.id, to: id, ...(free ? { branch: free } : {}) }] }, id };
}
