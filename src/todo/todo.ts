/**
 * The to-do list: one note (`Todo.md` by default), hidden from the sidebar
 * like the reading list. A `## Catégorie` heading per category, a task per
 * line in the Tasks plugin's format, readable in Obsidian:
 * `- [ ] Appeler Paul 📅 2026-10-25 #perso`.
 */
export interface Todo {
  /** 0-based line of the task in the file. */
  line: number;
  done: boolean;
  title: string;
  /** `YYYY-MM-DD`, or null. */
  due: string | null;
  tags: string[];
  category: string | null;
}

const TASK = /^\s*[-*] \[([ xX])\] (.*)$/;

export function parseTodos(markdown: string): Todo[] {
  const todos: Todo[] = [];
  let category: string | null = null;
  markdown.split("\n").forEach((text, line) => {
    const heading = /^#{1,6} (.*)$/.exec(text);
    if (heading) category = heading[1].trim();
    const task = TASK.exec(text);
    if (!task) return;
    let rest = task[2];
    const due = /📅\s*(\d{4}-\d{2}-\d{2})/.exec(rest)?.[1] ?? null;
    const tags = [...rest.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)].map((m) => m[1]);
    rest = rest.replace(/📅\s*\d{4}-\d{2}-\d{2}/, "").replace(/(?:^|\s)#[\p{L}\p{N}_/-]+/gu, "");
    todos.push({ line, done: task[1] !== " ", title: rest.trim(), due, tags, category });
  });
  return todos;
}

export function categoriesOf(markdown: string): string[] {
  return [...markdown.matchAll(/^#{1,6} (.*)$/gm)].map((m) => m[1].trim());
}

/** Adds a task at the end of its category (created at the end of the file when new). */
export function addTodo(markdown: string, title: string, category: string | null, due: string | null, tags: string[]): string {
  const task = `- [ ] ${[title.trim(), due ? `📅 ${due}` : "", ...tags.map((t) => `#${t}`)].filter(Boolean).join(" ")}`;
  const lines = markdown === "" ? [] : markdown.replace(/\n$/, "").split("\n");
  const start = category ? lines.findIndex((l) => /^#{1,6} (.*)$/.exec(l)?.[1].trim() === category) : -1;
  if (category && start < 0) return `${[...lines, ...(lines.length ? [""] : []), `## ${category}`, "", task].join("\n")}\n`;
  // After the category's (or the untitled top part's) last task.
  let end = start + 1;
  for (let i = start + 1; i < lines.length && !/^#{1,6} /.test(lines[i]); i++) if (TASK.test(lines[i])) end = i + 1;
  if (end === start + 1 && lines[end] === "") end++;
  lines.splice(end, 0, task);
  return `${lines.join("\n")}\n`;
}

export function toggleTodo(markdown: string, line: number, done: boolean): string {
  const lines = markdown.split("\n");
  lines[line] = lines[line].replace(/\[[ xX]\]/, done ? "[x]" : "[ ]");
  return lines.join("\n");
}

export function removeTodo(markdown: string, line: number): string {
  const lines = markdown.split("\n");
  lines.splice(line, 1);
  return lines.join("\n");
}
