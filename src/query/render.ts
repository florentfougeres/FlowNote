import type { VaultBridge } from "../editor/bridge";
import { element } from "../editor/views/dom";
import { display, parseQuery, QueryError, runQuery } from "./dataview";
import { isoDay, Link, readPages, type Page, type Task, type Value } from "./pages";
import { parseTasksQuery, runTasksQuery } from "./tasks";

/**
 * Results of a ```dataview or ```tasks block, drawn under it in place of its
 * source (shown while the cursor is in the block, like a Mermaid diagram).
 * Links open their note; a task's box checks it in its own note.
 */

export type QueryLanguage = "dataview" | "dataviewjs" | "tasks";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** `2026-10-22` → `22 oct. 2026` (with the time when there is one). */
function frenchDate(value: string): string {
  const [, y, m, d, time] = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(value)!;
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}${time ? `, ${time}` : ""}`;
}

function linkElement(link: Link, bridge: VaultBridge): HTMLElement {
  const a = element("a", "query-link");
  a.textContent = link.toString();
  a.href = "#";
  a.title = link.path;
  a.addEventListener("click", (event) => {
    event.preventDefault();
    const path = bridge.files.find((f) => f === link.path || f === `${link.path}.md` || f.endsWith(`/${link.path}.md`)) ?? link.path;
    bridge.openPath(path, event.metaKey || event.ctrlKey);
  });
  return a;
}

function valueElement(value: Value | undefined, bridge: VaultBridge): Node {
  if (value instanceof Link) return linkElement(value, bridge);
  if (Array.isArray(value)) {
    const span = element("span");
    value.forEach((item, i) => {
      if (i > 0) span.append(", ");
      span.append(valueElement(item, bridge));
    });
    return span;
  }
  if (typeof value === "boolean") return document.createTextNode(value ? "oui" : "non");
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(value)) return document.createTextNode(frenchDate(value));
  return document.createTextNode(display(value ?? null));
}

const PRIORITY_SIGNS: Record<Task["priority"], string> = { highest: "🔺", high: "⏫", medium: "🔼", none: "", low: "🔽", lowest: "⏬" };

function taskElement(task: Task, bridge: VaultBridge, today: string, refresh: () => void, showNote: boolean): HTMLElement {
  const li = element("li", task.completed ? "query-task done" : "query-task");
  const box = element("input");
  box.type = "checkbox";
  box.checked = task.completed;
  // A task of the open note is checked in the note itself, where the editor holds it.
  const own = task.path === bridge.notePath;
  box.disabled = own || !bridge.toggleTask;
  box.title = own ? "Cochez cette tâche dans la note" : task.completed ? "Marquer comme à faire" : "Marquer comme faite";
  box.addEventListener("change", () => {
    box.disabled = true;
    void bridge.toggleTask!(task.path, task.line, box.checked).then(refresh, (error: unknown) => {
      box.checked = !box.checked;
      box.disabled = false;
      li.title = error instanceof Error ? error.message : String(error);
    });
  });
  const text = element("span", "query-task-text");
  for (const part of task.text.split(/(#[\p{L}\p{N}_/-]+)/u)) {
    if (part.startsWith("#") && part.length > 1) text.append(Object.assign(element("span", "query-tag"), { textContent: part }));
    else if (part) text.append(part);
  }
  li.append(box, text);
  const badge = (content: string, className = "query-badge", title = "") => li.append(Object.assign(element("span", className), { textContent: content, title }));
  if (task.priority !== "none") badge(PRIORITY_SIGNS[task.priority], "query-badge", `Priorité ${task.priority}`);
  if (task.recurrence) badge(`🔁 ${task.recurrence}`);
  if (task.start) badge(`🛫 ${frenchDate(task.start)}`, "query-badge", "Début");
  if (task.scheduled) badge(`⏳ ${frenchDate(task.scheduled)}`, "query-badge", "Prévue");
  if (task.due) badge(`📅 ${frenchDate(task.due)}`, !task.completed && task.due < today ? "query-badge late" : task.due === today ? "query-badge today" : "query-badge", "Échéance");
  if (task.done) badge(`✅ ${frenchDate(task.done)}`, "query-badge", "Faite le");
  if (showNote) {
    const note = linkElement(new Link(task.path), bridge);
    note.classList.add("query-task-note");
    li.append(note);
  }
  return li;
}

function heading(target: HTMLElement, key: Value, bridge: VaultBridge) {
  const h = element("div", "query-group");
  h.append(key === null || key === "" ? document.createTextNode("—") : valueElement(key, bridge));
  target.append(h);
}

function count(target: HTMLElement, n: number, what: "résultat" | "tâche") {
  const none = what === "tâche" ? "Aucune tâche." : "Aucun résultat.";
  target.append(Object.assign(element("div", "query-count"), { textContent: n === 0 ? none : `${n} ${what}${n > 1 ? "s" : ""}` }));
}

function renderDataview(target: HTMLElement, source: string, pages: Page[], self: Page | null, bridge: VaultBridge, refresh: () => void) {
  const today = isoDay(new Date());
  const result = runQuery(parseQuery(source), pages, self);
  const grouped = result.groups.length > 1 || result.groups.some((g) => g.key !== null);
  let n = 0;
  if (result.type === "task") {
    for (const group of result.groups) {
      heading(target, group.key, bridge);
      const ul = element("ul", "query-tasks");
      for (const task of group.items) ul.append(taskElement(task, bridge, today, refresh, false));
      target.append(ul);
      n += group.items.length;
    }
    return count(target, n, "tâche");
  }
  if (result.type === "list") {
    for (const group of result.groups) {
      if (grouped) heading(target, group.key, bridge);
      const ul = element("ul", "query-list");
      for (const item of group.items) {
        const li = element("li");
        li.append(linkElement(item.link, bridge));
        if (item.value !== undefined) li.append(" : ", valueElement(item.value, bridge));
        ul.append(li);
      }
      target.append(ul);
      n += group.items.length;
    }
    return count(target, n, "résultat");
  }
  for (const group of result.groups) {
    if (grouped) heading(target, group.key, bridge);
    const table = element("table", "query-table");
    const head = element("tr");
    for (const name of result.headers) head.append(Object.assign(element("th"), { textContent: name }));
    const thead = element("thead");
    thead.append(head);
    const tbody = element("tbody");
    for (const row of group.items) {
      const tr = element("tr");
      for (const cell of row) {
        const td = element("td");
        td.append(valueElement(cell, bridge));
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(thead, tbody);
    target.append(table);
    n += group.items.length;
  }
  count(target, n, "résultat");
}

function renderTasks(target: HTMLElement, source: string, pages: Page[], bridge: VaultBridge, refresh: () => void) {
  const today = isoDay(new Date());
  let n = 0;
  for (const group of runTasksQuery(parseTasksQuery(source), pages)) {
    if (group.key !== null) heading(target, group.key, bridge);
    const ul = element("ul", "query-tasks");
    for (const task of group.tasks) ul.append(taskElement(task, bridge, today, refresh, true));
    target.append(ul);
    n += group.tasks.length;
  }
  count(target, n, "tâche");
}

/** Draws the results of a query block in `target`; `refresh` runs it again (after a task is checked). */
export async function renderQueryBlock(target: HTMLElement, language: QueryLanguage, source: string, bridge: VaultBridge, refresh: () => void): Promise<void> {
  const message = (className: string, text: string) => target.replaceChildren(Object.assign(element("div", className), { textContent: text }));
  if (language === "dataviewjs") return message("query-empty", "Les blocs dataviewjs (JavaScript) ne sont pas exécutés par FlowNote : seules les requêtes Dataview le sont.");
  if (!source.trim()) return message("query-empty", language === "tasks" ? "Requête Tasks vide : cliquez pour l'écrire (par exemple « not done »)." : "Requête Dataview vide : cliquez pour l'écrire (par exemple « LIST FROM #projet »).");
  if (!bridge.queryVault) return message("query-empty", "Les requêtes ne sont pas lues ici.");
  const pages = readPages(await bridge.queryVault());
  const self = pages.find((p) => p.path === bridge.notePath) ?? null;
  const results = element("div", "query-results");
  try {
    if (language === "tasks") renderTasks(results, source, pages, bridge, refresh);
    else renderDataview(results, source, pages, self, bridge, refresh);
    target.replaceChildren(results);
  } catch (error) {
    const text = error instanceof QueryError || error instanceof Error ? error.message : String(error);
    message("query-error", `Requête ${language === "tasks" ? "Tasks" : "Dataview"} invalide : ${text}`);
  }
}
