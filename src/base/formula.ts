/**
 * Formulas of a base (Obsidian's `formulas:`), a common subset of their
 * language: numbers, text, true/false, property names (`prix`, `note.prix`,
 * `file.name`, `formula.autre`), + - * / %, comparisons, && || !, if(),
 * dates (date(), today(), now(); a date minus a date is a duration with
 * .days), and methods on text, lists, dates and numbers. What is not
 * understood shows as an error in its cell; the formula is kept as written.
 */

export type FValue = number | string | boolean | null | FDate | FDuration | FValue[];
export interface FDate {
  kind: "date";
  ms: number;
}
export interface FDuration {
  kind: "duration";
  ms: number;
}

export interface FormulaScope {
  note: Record<string, unknown>;
  file: Record<string, unknown>;
  /** Value of another formula of the base. */
  formula: (name: string) => FValue;
}

type Token = { type: "num"; value: number } | { type: "str"; value: string } | { type: "id"; value: string } | { type: "op"; value: string };

const DAY = 86400000;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/\d/.test(c) || (c === "." && /\d/.test(source[i + 1] ?? ""))) {
      const m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(source.slice(i))!;
      tokens.push({ type: "num", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let text = "";
      while (j < source.length && source[j] !== c) {
        if (source[j] === "\\" && j + 1 < source.length) j++;
        text += source[j++];
      }
      if (j >= source.length) throw new Error("Guillemet non fermé");
      tokens.push({ type: "str", value: text });
      i = j + 1;
      continue;
    }
    const id = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(source.slice(i));
    if (id) {
      tokens.push({ type: "id", value: id[0] });
      i += id[0].length;
      continue;
    }
    const op = /^(==|!=|>=|<=|&&|\|\||[-+*/%<>!(),.[\]])/.exec(source.slice(i));
    if (!op) throw new Error(`Caractère inattendu : ${c}`);
    tokens.push({ type: "op", value: op[0] });
    i += op[0].length;
  }
  return tokens;
}

type Node =
  | { k: "lit"; v: FValue }
  | { k: "id"; name: string }
  | { k: "unary"; op: string; e: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] }
  | { k: "member"; obj: Node; name: string }
  | { k: "method"; obj: Node; name: string; args: Node[] }
  | { k: "index"; obj: Node; i: Node }
  | { k: "list"; items: Node[] };

const PRECEDENCE: Record<string, number> = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, ">": 4, "<=": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };

function parseFormula(source: string): Node {
  const tokens = tokenize(source);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.type === "op" && peek()!.value === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`« ${v} » attendu`);
    pos++;
  };
  const args = (close: string): Node[] => {
    const list: Node[] = [];
    if (isOp(close)) {
      pos++;
      return list;
    }
    for (;;) {
      list.push(expression(0));
      if (isOp(",")) pos++;
      else break;
    }
    expect(close);
    return list;
  };
  const primary = (): Node => {
    const t = tokens[pos++];
    if (!t) throw new Error("Formule incomplète");
    let node: Node;
    if (t.type === "num") node = { k: "lit", v: t.value };
    else if (t.type === "str") node = { k: "lit", v: t.value };
    else if (t.type === "id") {
      if (t.value === "true" || t.value === "false") node = { k: "lit", v: t.value === "true" };
      else if (t.value === "null") node = { k: "lit", v: null };
      else if (isOp("(")) {
        pos++;
        node = { k: "call", fn: t.value, args: args(")") };
      } else node = { k: "id", name: t.value };
    } else if (t.value === "(") {
      node = expression(0);
      expect(")");
    } else if (t.value === "[") node = { k: "list", items: args("]") };
    else if (t.value === "-" || t.value === "!") node = { k: "unary", op: t.value, e: primary() };
    else throw new Error(`« ${t.value} » inattendu`);
    // Members, methods, indexes.
    for (;;) {
      if (isOp(".")) {
        pos++;
        const name = tokens[pos++];
        if (name?.type !== "id") throw new Error("Nom attendu après « . »");
        if (isOp("(")) {
          pos++;
          node = { k: "method", obj: node, name: name.value, args: args(")") };
        } else node = { k: "member", obj: node, name: name.value };
      } else if (isOp("[")) {
        pos++;
        const i = expression(0);
        expect("]");
        node = { k: "index", obj: node, i };
      } else return node;
    }
  };
  const expression = (min: number): Node => {
    let left = primary();
    for (;;) {
      const t = peek();
      const prec = t?.type === "op" ? PRECEDENCE[t.value] : undefined;
      if (prec === undefined || prec <= min) return left;
      pos++;
      left = { k: "bin", op: (t as { value: string }).value, a: left, b: expression(prec) };
    }
  };
  const node = expression(0);
  if (pos < tokens.length) throw new Error(`« ${(tokens[pos] as { value: unknown }).value} » inattendu`);
  return node;
}

const isDate = (v: unknown): v is FDate => typeof v === "object" && v !== null && (v as FDate).kind === "date";
const isDuration = (v: unknown): v is FDuration => typeof v === "object" && v !== null && (v as FDuration).kind === "duration";

function toDate(v: unknown): FDate | null {
  if (isDate(v)) return v;
  if (typeof v === "string") {
    const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00` : v);
    return Number.isNaN(ms) ? null : { kind: "date", ms };
  }
  if (typeof v === "number") return { kind: "date", ms: v };
  return null;
}

/** A property value as a formula value (dates stay text until date() is used). */
function wrap(v: unknown): FValue {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.map(wrap);
  return v as FValue;
}

function truthy(v: FValue): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return v !== null && v !== false && v !== 0 && v !== "";
}

function num(v: FValue, what: string): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return Number(v);
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  if (v === null) return 0;
  throw new Error(`${what} : nombre attendu`);
}

function equal(a: FValue, b: FValue): boolean {
  if (isDate(a) || isDate(b) || isDuration(a) || isDuration(b)) return (a as FDate)?.ms === (b as FDate)?.ms;
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b || (typeof a === "number" && typeof b === "string" && a === Number(b)) || (typeof b === "number" && typeof a === "string" && b === Number(a));
}

function compareValues(a: FValue, b: FValue): number {
  if (isDate(a) || isDate(b) || isDuration(a) || isDuration(b)) return ((toDate(a) ?? (a as FDuration))?.ms ?? 0) - ((toDate(b) ?? (b as FDuration))?.ms ?? 0);
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, "fr");
  return num(a, "Comparaison") - num(b, "Comparaison");
}

const pad = (n: number) => String(n).padStart(2, "0");
function formatDate(d: FDate, pattern = "YYYY-MM-DD"): string {
  const x = new Date(d.ms);
  return pattern
    .replace(/YYYY/g, String(x.getFullYear()))
    .replace(/MM/g, pad(x.getMonth() + 1))
    .replace(/DD/g, pad(x.getDate()))
    .replace(/HH/g, pad(x.getHours()))
    .replace(/mm/g, pad(x.getMinutes()));
}

function evaluate(node: Node, scope: FormulaScope): FValue {
  const ev = (n: Node) => evaluate(n, scope);
  switch (node.k) {
    case "lit":
      return node.v;
    case "list":
      return node.items.map(ev);
    case "id":
      if (node.name === "note" || node.name === "file" || node.name === "formula") return { kind: "ns", name: node.name } as unknown as FValue;
      return wrap(scope.note[node.name]);
    case "unary": {
      const v = ev(node.e);
      return node.op === "!" ? !truthy(v) : isDuration(v) ? { kind: "duration", ms: -v.ms } : -num(v, "Signe");
    }
    case "bin": {
      if (node.op === "&&") return truthy(ev(node.a)) ? ev(node.b) : false;
      if (node.op === "||") {
        const a = ev(node.a);
        return truthy(a) ? a : ev(node.b);
      }
      const a = ev(node.a);
      const b = ev(node.b);
      switch (node.op) {
        case "==":
          return equal(a, b);
        case "!=":
          return !equal(a, b);
        case "<":
          return compareValues(a, b) < 0;
        case ">":
          return compareValues(a, b) > 0;
        case "<=":
          return compareValues(a, b) <= 0;
        case ">=":
          return compareValues(a, b) >= 0;
        case "+":
          if (isDate(a) && isDuration(b)) return { kind: "date", ms: a.ms + b.ms };
          if (typeof a === "string" || typeof b === "string") return `${display(a)}${display(b)}`;
          if (Array.isArray(a)) return [...a, ...(Array.isArray(b) ? b : [b])];
          if (a === null || b === null) return null;
          return num(a, "Addition") + num(b, "Addition");
        case "-": {
          if (a === null || b === null) return null;
          const da = toDate(a);
          const db = toDate(b);
          if (isDate(a) || (da && db && typeof a === "string" && typeof b === "string" && /^\d{4}-/.test(a))) {
            if (isDuration(b)) return { kind: "date", ms: da!.ms - b.ms };
            if (db) return { kind: "duration", ms: da!.ms - db.ms };
          }
          return num(a, "Soustraction") - num(b, "Soustraction");
        }
        case "*":
          if (a === null || b === null) return null;
          return num(a, "Multiplication") * num(b, "Multiplication");
        case "/": {
          if (a === null || b === null) return null;
          const d = num(b, "Division");
          if (d === 0) throw new Error("Division par zéro");
          return num(a, "Division") / d;
        }
        case "%":
          if (a === null || b === null) return null;
          return num(a, "Modulo") % num(b, "Modulo");
      }
      throw new Error(`Opérateur ${node.op}`);
    }
    case "member": {
      const obj = ev(node.obj) as unknown;
      const ns = obj as { kind?: string; name?: string };
      if (ns?.kind === "ns") {
        if (ns.name === "note") return wrap(scope.note[node.name]);
        if (ns.name === "file") return wrap(scope.file[node.name]);
        return scope.formula(node.name);
      }
      return member(obj as FValue, node.name);
    }
    case "index": {
      const obj = ev(node.obj);
      const i = ev(node.i);
      if (Array.isArray(obj)) return obj[num(i, "Index")] ?? null;
      if (typeof obj === "string") return obj[num(i, "Index")] ?? null;
      return null;
    }
    case "method":
      return method(ev(node.obj), node.name, node.args.map(ev));
    case "call":
      return call(node.fn, node.args, scope);
  }
}

function member(obj: FValue, name: string): FValue {
  if (isDuration(obj)) {
    const units: Record<string, number> = { days: DAY, hours: 3600000, minutes: 60000, seconds: 1000, weeks: 7 * DAY };
    if (name in units) return Math.floor(obj.ms / units[name]);
  }
  if (isDate(obj)) {
    const d = new Date(obj.ms);
    const parts: Record<string, number> = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
    if (name in parts) return parts[name];
  }
  if (name === "length" && (typeof obj === "string" || Array.isArray(obj))) return obj.length;
  throw new Error(`Propriété inconnue : .${name}`);
}

function method(obj: FValue, name: string, args: FValue[]): FValue {
  const text = (v: FValue) => display(v);
  if (typeof obj === "string") {
    switch (name) {
      case "contains":
        return obj.toLowerCase().includes(text(args[0]).toLowerCase());
      case "startsWith":
        return obj.startsWith(text(args[0]));
      case "endsWith":
        return obj.endsWith(text(args[0]));
      case "lower":
        return obj.toLowerCase();
      case "upper":
        return obj.toUpperCase();
      case "trim":
        return obj.trim();
      case "replace":
        return obj.split(text(args[0])).join(text(args[1]));
      case "isEmpty":
        return obj.trim() === "";
      case "split":
        return obj.split(text(args[0]));
    }
  }
  if (Array.isArray(obj)) {
    switch (name) {
      case "contains":
        return obj.some((v) => equal(v, args[0]));
      case "join":
        return obj.map(display).join(args.length ? text(args[0]) : ", ");
      case "isEmpty":
        return obj.length === 0;
    }
  }
  if (obj === null && name === "isEmpty") return true;
  if (isDate(obj) && name === "format") return formatDate(obj, args.length ? text(args[0]) : undefined);
  if (typeof obj === "number") {
    if (name === "toFixed") return obj.toFixed(num(args[0] ?? 0, "toFixed"));
    if (name === "round") return Math.round(obj);
    if (name === "isEmpty") return false;
  }
  throw new Error(`Méthode inconnue : .${name}()`);
}

function call(fn: string, nodes: Node[], scope: FormulaScope): FValue {
  // if() only evaluates the branch it returns.
  if (fn === "if") {
    if (nodes.length < 2) throw new Error("if(condition, alors, sinon)");
    return truthy(evaluate(nodes[0], scope)) ? evaluate(nodes[1], scope) : nodes[2] ? evaluate(nodes[2], scope) : null;
  }
  const args = nodes.map((n) => evaluate(n, scope));
  switch (fn) {
    case "today": {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return { kind: "date", ms: d.getTime() };
    }
    case "now":
      return { kind: "date", ms: Date.now() };
    case "date": {
      const d = toDate(args[0]);
      if (!d) throw new Error("date() : date invalide");
      return d;
    }
    case "number":
      return num(args[0], "number()");
    case "min":
      return Math.min(...args.flat().map((a) => num(a as FValue, "min()")));
    case "max":
      return Math.max(...args.flat().map((a) => num(a as FValue, "max()")));
    case "abs":
      return Math.abs(num(args[0], "abs()"));
    case "round": {
      const digits = args[1] === undefined ? 0 : num(args[1], "round()");
      const f = 10 ** digits;
      return Math.round(num(args[0], "round()") * f) / f;
    }
    case "floor":
      return Math.floor(num(args[0], "floor()"));
    case "ceil":
      return Math.ceil(num(args[0], "ceil()"));
    case "concat":
      return args.map(display).join("");
    case "list":
      return args;
    case "duration": {
      const m = /^\s*(-?\d+(?:\.\d+)?)\s*(d|day|days|j|jours?|w|weeks?|h|hours?|m|minutes?)\s*$/i.exec(display(args[0]));
      if (!m) throw new Error("duration() : par ex. \"3d\"");
      const unit = m[2].toLowerCase()[0];
      const ms = { d: DAY, j: DAY, w: 7 * DAY, h: 3600000, m: 60000 }[unit] ?? DAY;
      return { kind: "duration", ms: Number(m[1]) * ms };
    }
  }
  throw new Error(`Fonction inconnue : ${fn}()`);
}

/** A value as text, for display and concatenation. */
export function display(v: FValue): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(display).join(", ");
  if (isDate(v)) return new Date(v.ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  if (isDuration(v)) {
    const days = Math.round(v.ms / DAY);
    return Math.abs(v.ms) >= DAY ? `${days} j` : `${Math.round(v.ms / 3600000)} h`;
  }
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("fr-FR") : v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  return String(v);
}

/** A number for sorting and summaries (dates and durations in ms), or null. */
export function numeric(v: FValue): number | null {
  if (typeof v === "number") return v;
  if (isDate(v) || isDuration(v)) return v.ms;
  return null;
}

/**
 * Evaluates the formulas of a row: `{ name: value | Error }`. Formulas may use
 * one another (`formula.autre`); a loop gives an error instead of hanging.
 */
export function evaluateFormulas(formulas: Record<string, string>, note: Record<string, unknown>, file: Record<string, unknown>): Record<string, FValue | Error> {
  const results: Record<string, FValue | Error> = {};
  const running = new Set<string>();
  const parsed: Record<string, Node | Error> = {};
  const get = (name: string): FValue => {
    if (name in results) {
      const r = results[name];
      if (r instanceof Error) throw r;
      return r;
    }
    if (!(name in formulas)) throw new Error(`Formule inconnue : ${name}`);
    if (running.has(name)) throw new Error(`Boucle dans les formules (${name})`);
    running.add(name);
    try {
      parsed[name] ??= (() => {
        try {
          return parseFormula(formulas[name]);
        } catch (e) {
          return e as Error;
        }
      })();
      const node = parsed[name];
      if (node instanceof Error) throw node;
      const value = evaluate(node, { note, file, formula: get });
      results[name] = value;
      return value;
    } catch (e) {
      results[name] = e as Error;
      throw e;
    } finally {
      running.delete(name);
    }
  };
  for (const name of Object.keys(formulas)) {
    try {
      get(name);
    } catch {
      // kept in results as an Error
    }
  }
  return results;
}
