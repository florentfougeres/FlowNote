import { isoDay, Link, type Duration, type Page, type Task, type Value } from "./pages";

/**
 * Dataview queries (```dataview blocks), the common part of its language:
 *
 *   LIST [expression] | TABLE [WITHOUT ID] expr [AS "Titre"], … | TASK
 *   FROM #tag | "Dossier" | [[Note]]   (and, or, -, parentheses)
 *   WHERE expression
 *   SORT expression [ASC|DESC], …
 *   GROUP BY expression
 *   LIMIT n
 *
 * Expressions: fields (properties, `key:: value`), `file.name`, `file.link`,
 * `file.folder`, `file.path`, `file.tags`, `file.ctime`, `file.mtime`,
 * `file.tasks`, `file.outlinks`, `this.…`; comparisons, `and`, `or`, `!`,
 * arithmetic on numbers and dates (`date(today) - dur(7 days)`), and the
 * usual functions (contains, icontains, length, lower, upper, date, dur,
 * default, choice, round, startswith, endswith, regexmatch, join, number,
 * string, min, max, sum). dataviewjs and inline queries are not run.
 */

export class QueryError extends Error {}

interface Token {
  type: "number" | "string" | "word" | "tag" | "link" | "op";
  text: string;
  start: number;
  end: number;
}

const OPERATORS = ["!=", "<=", ">=", "=", "<", ">", "+", "-", "*", "/", "(", ")", ",", ".", "!", "&", "|", "[", "]"];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const start = i;
    if (c === '"' || c === "'") {
      let text = "";
      i++;
      while (i < source.length && source[i] !== c) {
        if (source[i] === "\\" && i + 1 < source.length) i++;
        text += source[i++];
      }
      if (i >= source.length) throw new QueryError("Guillemet non fermé.");
      i++;
      tokens.push({ type: "string", text, start, end: i });
    } else if (source.startsWith("[[", i)) {
      const close = source.indexOf("]]", i);
      if (close < 0) throw new QueryError("Lien [[…]] non fermé.");
      tokens.push({ type: "link", text: source.slice(i + 2, close).split("|")[0], start, end: close + 2 });
      i = close + 2;
    } else if (c === "#" && /[\p{L}\p{N}_/-]/u.test(source[i + 1] ?? "")) {
      i++;
      while (i < source.length && /[\p{L}\p{N}_/-]/u.test(source[i])) i++;
      tokens.push({ type: "tag", text: source.slice(start, i), start, end: i });
    } else if (/\d/.test(c)) {
      while (i < source.length && /[\d.]/.test(source[i])) i++;
      // A date written plainly (2026-10-01) is a word, read by date().
      if (source[i] === "-" && /^\d{4}$/.test(source.slice(start, i))) {
        while (i < source.length && /[\d-]/.test(source[i])) i++;
        tokens.push({ type: "word", text: source.slice(start, i), start, end: i });
      } else tokens.push({ type: "number", text: source.slice(start, i), start, end: i });
    } else if (/[\p{L}_]/u.test(c)) {
      // Field names may hold dashes (due-date), never at the end.
      while (i < source.length && (/[\p{L}\p{N}_]/u.test(source[i]) || (source[i] === "-" && /[\p{L}\p{N}_]/u.test(source[i + 1] ?? "")))) i++;
      tokens.push({ type: "word", text: source.slice(start, i), start, end: i });
    } else {
      const op = OPERATORS.find((o) => source.startsWith(o, i));
      if (!op) throw new QueryError(`Caractère inattendu : « ${c} ».`);
      i += op.length;
      tokens.push({ type: "op", text: op, start, end: i });
    }
  }
  return tokens;
}

type Expr =
  | { kind: "literal"; value: Value }
  | { kind: "field"; name: string }
  | { kind: "member"; object: Expr; name: string }
  | { kind: "index"; object: Expr; index: Expr }
  | { kind: "call"; name: string; args: Expr[]; raw?: string }
  | { kind: "unary"; op: "!" | "-"; operand: Expr }
  | { kind: "binary"; op: string; left: Expr; right: Expr };

type Source = { kind: "tag"; tag: string } | { kind: "folder"; folder: string } | { kind: "link"; target: string } | { kind: "not"; source: Source } | { kind: "and" | "or"; left: Source; right: Source };

export interface Query {
  type: "list" | "table" | "task";
  withoutId: boolean;
  /** LIST's expression or TABLE's columns. */
  fields: { expr: Expr; name: string }[];
  from: Source | null;
  where: Expr[];
  sort: { expr: Expr; descending: boolean }[];
  groupBy: Expr | null;
  limit: number | null;
}

const CLAUSES = new Set(["FROM", "WHERE", "SORT", "LIMIT", "GROUP", "FLATTEN"]);
const LEVELS: string[][] = [["or", "|"], ["and", "&"], ["=", "!=", "<", ">", "<=", ">="], ["+", "-"], ["*", "/"]];

class Parser {
  i = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly source: string,
  ) {}
  peek(offset = 0): Token | undefined {
    return this.tokens[this.i + offset];
  }
  isWord(word: string, offset = 0) {
    const token = this.peek(offset);
    return token?.type === "word" && token.text.toUpperCase() === word;
  }
  isOp(op: string, offset = 0) {
    const token = this.peek(offset);
    return token?.type === "op" && token.text === op;
  }
  atClause() {
    const token = this.peek();
    return !token || (token.type === "word" && CLAUSES.has(token.text.toUpperCase()));
  }
  expect(op: string) {
    if (!this.isOp(op)) throw new QueryError(`« ${op} » attendu${this.peek() ? ` avant « ${this.peek()!.text} »` : " à la fin"}.`);
    this.i++;
  }

  query(): Query {
    const head = this.peek()?.text.toUpperCase();
    if (head !== "LIST" && head !== "TABLE" && head !== "TASK") throw new QueryError("Une requête commence par LIST, TABLE ou TASK.");
    this.i++;
    const query: Query = { type: head.toLowerCase() as Query["type"], withoutId: false, fields: [], from: null, where: [], sort: [], groupBy: null, limit: null };
    if (this.isWord("WITHOUT") && this.isWord("ID", 1)) {
      this.i += 2;
      query.withoutId = true;
    }
    if (query.type !== "task" && !this.atClause()) {
      do {
        if (this.isOp(",")) this.i++;
        const start = this.peek()!.start;
        const expr = this.expression();
        let name = this.source.slice(start, this.tokens[this.i - 1].end).trim();
        if (this.isWord("AS")) {
          this.i++;
          const alias = this.peek();
          if (!alias || (alias.type !== "string" && alias.type !== "word")) throw new QueryError("Nom de colonne attendu après AS.");
          name = alias.text;
          this.i++;
        }
        query.fields.push({ expr, name });
      } while (this.isOp(","));
    }
    while (this.peek()) {
      const clause = this.peek()!.text.toUpperCase();
      this.i++;
      if (clause === "FROM") query.from = this.sources();
      else if (clause === "WHERE") query.where.push(this.expression());
      else if (clause === "SORT") {
        do {
          if (this.isOp(",")) this.i++;
          const expr = this.expression();
          let descending = false;
          const order = this.peek()?.text.toUpperCase();
          if (order === "DESC" || order === "DESCENDING" || order === "ASC" || order === "ASCENDING") {
            descending = order.startsWith("DESC");
            this.i++;
          }
          query.sort.push({ expr, descending });
        } while (this.isOp(","));
      } else if (clause === "GROUP" && this.isWord("BY")) {
        this.i++;
        query.groupBy = this.expression();
      } else if (clause === "LIMIT") {
        const n = this.peek();
        if (n?.type !== "number") throw new QueryError("Nombre attendu après LIMIT.");
        query.limit = Number(n.text);
        this.i++;
      } else if (clause === "FLATTEN") throw new QueryError("FLATTEN n'est pas pris en charge.");
      else throw new QueryError(`Clause inconnue : « ${this.tokens[this.i - 1].text} ».`);
    }
    return query;
  }

  sources(): Source {
    let left = this.sourceTerm();
    while (this.isWord("AND") || this.isWord("OR")) {
      const op = this.peek()!.text.toLowerCase() as "and" | "or";
      this.i++;
      left = { kind: op, left, right: this.sourceTerm() };
    }
    return left;
  }
  sourceTerm(): Source {
    const token = this.peek();
    if (!token) throw new QueryError("Source attendue après FROM.");
    this.i++;
    if (token.type === "op" && token.text === "-") return { kind: "not", source: this.sourceTerm() };
    if (token.type === "op" && token.text === "(") {
      const inner = this.sources();
      this.expect(")");
      return inner;
    }
    if (token.type === "tag") return { kind: "tag", tag: token.text.toLowerCase() };
    if (token.type === "string") return { kind: "folder", folder: token.text.replace(/\/+$/, "") };
    if (token.type === "link") return { kind: "link", target: token.text };
    throw new QueryError(`Source inconnue : « ${token.text} » (#tag, "Dossier" ou [[Note]]).`);
  }

  expression(): Expr {
    return this.binary(0);
  }
  binary(level: number): Expr {
    if (level === LEVELS.length) return this.unary();
    let left = this.binary(level + 1);
    for (;;) {
      const token = this.peek();
      if (!token || (token.type !== "op" && !(token.type === "word" && level < 2))) break;
      const op = token.text.toLowerCase();
      if (!LEVELS[level].includes(op)) break;
      this.i++;
      left = { kind: "binary", op: op === "|" ? "or" : op === "&" ? "and" : op, left, right: this.binary(level + 1) };
    }
    return left;
  }
  unary(): Expr {
    if (this.isOp("!") || this.isOp("-")) {
      const op = this.peek()!.text as "!" | "-";
      this.i++;
      return { kind: "unary", op, operand: this.unary() };
    }
    let expr = this.primary();
    for (;;) {
      if (this.isOp(".")) {
        this.i++;
        const name = this.peek();
        if (name?.type !== "word") throw new QueryError("Nom attendu après « . ».");
        this.i++;
        expr = { kind: "member", object: expr, name: name.text };
      } else if (this.isOp("[")) {
        this.i++;
        const index = this.expression();
        this.expect("]");
        expr = { kind: "index", object: expr, index };
      } else return expr;
    }
  }
  /** `dur(7 days)` and `date(today)` take their argument as written. */
  private rawArgument(): string {
    const start = this.peek()!.start;
    while (this.peek() && !this.isOp(")")) this.i++;
    const raw = this.source.slice(start, this.peek()?.start ?? this.source.length).trim();
    this.expect(")");
    return raw;
  }
  primary(): Expr {
    const token = this.peek();
    if (!token) throw new QueryError("Expression incomplète.");
    this.i++;
    if (token.type === "number") return { kind: "literal", value: Number(token.text) };
    if (token.type === "string") return { kind: "literal", value: token.text };
    if (token.type === "link") return { kind: "literal", value: new Link(token.text) };
    if (token.type === "tag") return { kind: "literal", value: token.text };
    if (token.type === "op" && token.text === "(") {
      const inner = this.expression();
      this.expect(")");
      return inner;
    }
    if (token.type === "op" && token.text === "[") {
      const items: Expr[] = [];
      while (!this.isOp("]")) {
        items.push(this.expression());
        if (this.isOp(",")) this.i++;
        else break;
      }
      this.expect("]");
      return { kind: "call", name: "list", args: items };
    }
    if (token.type === "word") {
      const word = token.text.toLowerCase();
      if (word === "true" || word === "false") return { kind: "literal", value: word === "true" };
      if (word === "null") return { kind: "literal", value: null };
      if (this.isOp("(")) {
        this.i++;
        if (word === "dur" && this.peek() && this.peek()!.type !== "string" && !this.isOp(")")) return { kind: "call", name: word, args: [], raw: this.rawArgument() };
        if (word === "date" && this.peek()?.type === "word" && this.isOp(")", 1)) return { kind: "call", name: word, args: [], raw: this.rawArgument() };
        const args: Expr[] = [];
        while (!this.isOp(")")) {
          args.push(this.expression());
          if (this.isOp(",")) this.i++;
          else break;
        }
        this.expect(")");
        return { kind: "call", name: word, args };
      }
      return { kind: "field", name: token.text };
    }
    throw new QueryError(`« ${token.text} » inattendu.`);
  }
}

export function parseQuery(source: string): Query {
  const tokens = tokenize(source);
  if (tokens.length === 0) throw new QueryError("Requête vide.");
  return new Parser(tokens, source).query();
}

// ---- Evaluation ----

const DAY = 86_400_000;

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + days, 12));
}

/** `date(...)`: today, tomorrow, yesterday, now, sow/eow, som/eom, or a written date. */
export function dateOf(text: string, today = new Date()): string | null {
  const word = text.trim().replace(/^["']|["']$/g, "").toLowerCase();
  const day = isoDay(today);
  if (word === "today" || word === "now") return day;
  if (word === "tomorrow") return addDays(day, 1);
  if (word === "yesterday") return addDays(day, -1);
  if (word === "sow") return addDays(day, -((today.getDay() + 6) % 7));
  if (word === "eow") return addDays(day, 6 - ((today.getDay() + 6) % 7));
  if (word === "som") return `${day.slice(0, 8)}01`;
  if (word === "eom") return isoDay(new Date(today.getFullYear(), today.getMonth() + 1, 0, 12));
  return /^\d{4}-\d{2}-\d{2}(t\d{2}:\d{2})?/.exec(word)?.[0].toUpperCase() ?? null;
}

const UNITS: [RegExp, number][] = [
  [/^(d|days?|jours?)$/, 1],
  [/^(w|weeks?|semaines?)$/, 7],
  [/^(mo|months?|mois)$/, 30],
  [/^(y|yr|years?|ans?)$/, 365],
  [/^(h|hours?|heures?)$/, 1 / 24],
];

function durationOf(text: string): Duration | null {
  let days = 0;
  let found = false;
  for (const [, amount, unit] of text.toLowerCase().matchAll(/(-?\d+(?:\.\d+)?)\s*([a-zé]+)/g)) {
    const factor = UNITS.find(([pattern]) => pattern.test(unit))?.[1];
    if (factor === undefined) return null;
    days += Number(amount) * factor;
    found = true;
  }
  return found ? { days } : null;
}

const isDate = (v: Value): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
const isDuration = (v: Value): v is Duration => !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Link) && Object.keys(v).length === 1 && typeof (v as Duration).days === "number";

/** A note's name for comparisons: no extension, no folder when the other side has none. */
const linkName = (v: Value) => (v instanceof Link ? v.path : String(v).replace(/^\[\[|\]\]$/g, "")).replace(/\.md$/i, "").toLowerCase();

function equals(a: Value, b: Value): boolean {
  if (a instanceof Link || b instanceof Link) {
    const pa = linkName(a);
    const pb = linkName(b);
    return pa === pb || pa.endsWith(`/${pb}`) || pb.endsWith(`/${pa}`);
  }
  if (isDate(a) && isDate(b)) return a.slice(0, 10) === b.slice(0, 10) && (a.length === 10 || b.length === 10 || a === b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equals(x, b[i]));
  return a === b;
}

function compare(a: Value, b: Value): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return display(a).localeCompare(display(b), "fr", { numeric: true });
}

export function truthy(v: Value): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return v !== null && v !== undefined && v !== false && v !== 0 && v !== "";
}

/** A value as plain text. */
export function display(v: Value): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Link) return v.toString();
  if (Array.isArray(v)) return v.map(display).join(", ");
  if (isDuration(v)) return `${v.days} jours`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** What expressions can read: a page, possibly one of its tasks, and the note holding the query. */
interface Scope {
  page: Page;
  task?: Task;
  self: Page | null;
  today: Date;
}

function fileObject(page: Page): { [key: string]: Value } {
  return {
    name: page.name,
    path: page.path,
    folder: page.folder,
    link: new Link(page.path),
    tags: page.tags,
    etags: page.tags,
    ctime: page.ctime,
    mtime: page.mtime,
    cday: page.ctime?.slice(0, 10) ?? null,
    mday: page.mtime?.slice(0, 10) ?? null,
    ext: "md",
    outlinks: page.links.map((l) => new Link(l)),
    tasks: page.tasks.map(taskObject),
  };
}

function taskObject(task: Task): { [key: string]: Value } {
  return {
    text: task.text,
    status: task.status,
    completed: task.completed,
    checked: task.completed,
    fullyCompleted: task.completed,
    due: task.due,
    scheduled: task.scheduled,
    start: task.start,
    completion: task.done,
    priority: task.priority,
    tags: task.tags,
    path: task.path,
    line: task.line,
    link: new Link(task.path),
    section: task.heading,
  };
}

function lookup(record: { [key: string]: Value } | Map<string, Value>, name: string): Value | undefined {
  const entries = record instanceof Map ? [...record] : Object.entries(record);
  const normalize = (key: string) => key.toLowerCase().replace(/[\s_]+/g, "-");
  return entries.find(([key]) => key === name)?.[1] ?? entries.find(([key]) => normalize(key) === normalize(name))?.[1];
}

function evaluate(expr: Expr, scope: Scope): Value {
  switch (expr.kind) {
    case "literal":
      return expr.value;
    case "field": {
      if (expr.name === "this") return scope.self ? { ...Object.fromEntries(scope.self.fields), file: fileObject(scope.self) } : null;
      if (expr.name === "file") return fileObject(scope.page);
      if (scope.task) {
        const own = lookup(taskObject(scope.task), expr.name);
        if (own !== undefined) return own;
      }
      return lookup(scope.page.fields, expr.name) ?? null;
    }
    case "member": {
      const object = evaluate(expr.object, scope);
      if (object instanceof Link) return expr.name === "path" ? object.path : expr.name === "name" ? object.toString() : null;
      if (!object || typeof object !== "object" || Array.isArray(object)) return null;
      return lookup(object as { [key: string]: Value }, expr.name) ?? null;
    }
    case "index": {
      const object = evaluate(expr.object, scope);
      const index = evaluate(expr.index, scope);
      if (Array.isArray(object) && typeof index === "number") return object[index] ?? null;
      if (object && typeof object === "object" && !Array.isArray(object) && typeof index === "string") return lookup(object as { [key: string]: Value }, index) ?? null;
      return null;
    }
    case "unary": {
      const value = evaluate(expr.operand, scope);
      if (expr.op === "!") return !truthy(value);
      return typeof value === "number" ? -value : null;
    }
    case "binary": {
      if (expr.op === "and") return truthy(evaluate(expr.left, scope)) && truthy(evaluate(expr.right, scope));
      if (expr.op === "or") return truthy(evaluate(expr.left, scope)) || truthy(evaluate(expr.right, scope));
      const a = evaluate(expr.left, scope);
      const b = evaluate(expr.right, scope);
      switch (expr.op) {
        case "=":
          return equals(a, b);
        case "!=":
          return !equals(a, b);
        case "<":
        case ">":
        case "<=":
        case ">=": {
          if (a === null || b === null) return false;
          const c = compare(a, b);
          return expr.op === "<" ? c < 0 : expr.op === ">" ? c > 0 : expr.op === "<=" ? c <= 0 : c >= 0;
        }
        case "+":
        case "-": {
          const sign = expr.op === "+" ? 1 : -1;
          if (typeof a === "number" && typeof b === "number") return a + sign * b;
          if (isDate(a) && isDuration(b)) return addDays(a, sign * Math.round(b.days));
          if (isDate(a) && isDate(b) && sign < 0) return { days: Math.round((Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / DAY) };
          if (expr.op === "+" && (typeof a === "string" || typeof b === "string")) return display(a) + display(b);
          return null;
        }
        case "*":
          return typeof a === "number" && typeof b === "number" ? a * b : null;
        case "/":
          return typeof a === "number" && typeof b === "number" && b !== 0 ? a / b : null;
      }
      return null;
    }
    case "call":
      return call(expr, scope);
  }
}

function call(expr: Extract<Expr, { kind: "call" }>, scope: Scope): Value {
  if (expr.raw !== undefined) return expr.name === "date" ? dateOf(expr.raw, scope.today) : durationOf(expr.raw);
  const args = expr.args.map((a) => evaluate(a, scope));
  const [a, b, c] = args;
  const name = expr.name.toLowerCase();
  switch (name) {
    case "list":
      return args;
    case "contains":
    case "icontains":
    case "econtains": {
      const loose = (item: Value) => (name === "icontains" ? display(item).toLowerCase() === display(b).toLowerCase() : name === "econtains" ? item === b : equals(item, b) || (typeof item === "string" && typeof b === "string" && item.includes(b)));
      if (Array.isArray(a)) return a.some(loose);
      if (typeof a === "string") return name === "icontains" ? a.toLowerCase().includes(display(b).toLowerCase()) : a.includes(display(b));
      return a instanceof Link ? equals(a, b) : false;
    }
    case "length":
      return Array.isArray(a) ? a.length : typeof a === "string" ? a.length : 0;
    case "lower":
      return display(a).toLowerCase();
    case "upper":
      return display(a).toUpperCase();
    case "date":
      return a === null ? null : dateOf(display(a), scope.today);
    case "dur":
      return durationOf(display(a));
    case "default":
      return a === null || a === undefined ? (b ?? null) : a;
    case "choice":
      return truthy(a) ? (b ?? null) : (c ?? null);
    case "round": {
      const digits = typeof b === "number" ? b : 0;
      return typeof a === "number" ? Math.round(a * 10 ** digits) / 10 ** digits : null;
    }
    case "number":
      return typeof a === "number" ? a : Number.isNaN(Number(display(a))) ? null : Number(display(a));
    case "string":
      return display(a);
    case "startswith":
      return display(a).startsWith(display(b));
    case "endswith":
      return display(a).endsWith(display(b));
    case "regexmatch":
      try {
        return new RegExp(`^(?:${display(a)})$`).test(display(b));
      } catch {
        return false;
      }
    case "join":
      return Array.isArray(a) ? a.map(display).join(b === undefined ? ", " : display(b)) : display(a);
    case "link":
      return new Link(display(a));
    case "sum":
      return Array.isArray(a) ? a.reduce<number>((s, v) => s + (typeof v === "number" ? v : 0), 0) : null;
    case "min":
    case "max": {
      const list = (Array.isArray(a) && args.length === 1 ? a : args).filter((v) => v !== null);
      if (list.length === 0) return null;
      return list.reduce((m, v) => ((name === "min" ? compare(v, m) < 0 : compare(v, m) > 0) ? v : m));
    }
  }
  throw new QueryError(`Fonction inconnue : ${expr.name}().`);
}

function inSource(page: Page, source: Source, pages: Page[]): boolean {
  switch (source.kind) {
    case "tag": {
      const tag = source.tag.toLowerCase();
      return page.tags.some((t) => t.toLowerCase() === tag || t.toLowerCase().startsWith(`${tag}/`));
    }
    case "folder":
      return source.folder === "" || page.path === `${source.folder}.md` || page.path.startsWith(`${source.folder}/`);
    case "link": {
      // The pages linking to the note, like Dataview's FROM [[Note]].
      const target = pages.find((p) => equals(new Link(p.path), new Link(source.target)));
      return !!target && page.path !== target.path && page.links.some((l) => equals(new Link(l), new Link(target.path)));
    }
    case "not":
      return !inSource(page, source.source, pages);
    case "and":
      return inSource(page, source.left, pages) && inSource(page, source.right, pages);
    case "or":
      return inSource(page, source.left, pages) || inSource(page, source.right, pages);
  }
}

export interface Group<T> {
  key: Value;
  items: T[];
}

export type QueryResult =
  | { type: "list"; groups: Group<{ link: Link; value: Value | undefined }>[] }
  | { type: "table"; headers: string[]; groups: Group<Value[]>[] }
  | { type: "task"; groups: Group<Task>[] };

function grouped<T>(items: { item: T; key: Value }[], sorted: boolean): Group<T>[] {
  const groups: Group<T>[] = [];
  for (const { item, key } of items) {
    const group = groups.find((g) => equals(g.key, key));
    if (group) group.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return sorted ? groups.sort((a, b) => compare(a.key, b.key)) : groups;
}

/** Runs a query on the vault's pages; `self` is the note holding it (`this`). */
export function runQuery(query: Query, pages: Page[], self: Page | null, today = new Date()): QueryResult {
  let selected = pages.filter((page) => !query.from || inSource(page, query.from, pages));
  const scope = (page: Page, task?: Task): Scope => ({ page, task, self, today });
  const sortBy = (a: Scope, b: Scope) => {
    for (const { expr, descending } of query.sort) {
      const c = compare(evaluate(expr, a), evaluate(expr, b));
      if (c !== 0) return descending ? -c : c;
    }
    return 0;
  };

  if (query.type === "task") {
    let tasks = selected.flatMap((page) => page.tasks.map((task) => ({ page, task })));
    tasks = tasks.filter(({ page, task }) => query.where.every((w) => truthy(evaluate(w, scope(page, task)))));
    if (query.sort.length) tasks.sort((x, y) => sortBy(scope(x.page, x.task), scope(y.page, y.task)));
    if (query.limit !== null) tasks = tasks.slice(0, query.limit);
    // Tasks are shown under their note, unless grouped otherwise.
    const keyed = tasks.map(({ page, task }) => ({ item: task, key: query.groupBy ? evaluate(query.groupBy, scope(page, task)) : new Link(page.path) }));
    return { type: "task", groups: grouped(keyed, query.groupBy !== null) };
  }

  selected = selected.filter((page) => query.where.every((w) => truthy(evaluate(w, scope(page)))));
  selected.sort((a, b) => (query.sort.length ? sortBy(scope(a), scope(b)) : a.name.localeCompare(b.name, "fr")));
  if (query.limit !== null) selected = selected.slice(0, query.limit);
  const key = (page: Page) => (query.groupBy ? evaluate(query.groupBy, scope(page)) : null);

  if (query.type === "list") {
    const items = selected.map((page) => ({ item: { link: new Link(page.path), value: query.fields[0] ? evaluate(query.fields[0].expr, scope(page)) : undefined }, key: key(page) }));
    return { type: "list", groups: grouped(items, query.groupBy !== null) };
  }
  const headers = [...(query.withoutId ? [] : ["Fichier"]), ...query.fields.map((f) => f.name)];
  const rows = selected.map((page) => ({ item: [...(query.withoutId ? [] : [new Link(page.path)]), ...query.fields.map((f) => evaluate(f.expr, scope(page)))], key: key(page) }));
  return { type: "table", headers, groups: grouped(rows, query.groupBy !== null) };
}
