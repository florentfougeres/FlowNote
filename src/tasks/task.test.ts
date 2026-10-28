import { describe, expect, it } from "vitest";
import { DEFAULT_TASK_CONFIG as C, readTaskConfig, taskViewTitle } from "./config";
import { isTaskMarkdown, newTaskFile, setTaskField, taskFileName, taskInfo, tasksOf } from "./task";
import { agenda } from "./agenda";
import { decodeRank, encodeRank, planMove, sortCards } from "./board";

const TASK = `---
status: in-progress
priority: high
due: 2026-10-20
contexts: [bureau]
projects:
  - "[[Site Maison Pain]]"
timeEstimate: 90
dateCreated: 2026-10-14T13:40:00.000+02:00
dateModified: 2026-10-14T13:40:00.000+02:00
tags: [task, client]
tasknotes_manual_order: tnmzzzzzzzzz
---

Description.

- [x] Fait
- [ ] À faire

## Commentaires

> [!comment] 14/10/2026 13:42
> Premier.
`;

describe("tasks in the TaskNotes format", () => {
  it("recognises a task by its tag in the front matter only", () => {
    expect(isTaskMarkdown(TASK, C)).toBe(true);
    expect(isTaskMarkdown("---\ntags:\n  - task/travail\n---\n", C)).toBe(true);
    expect(isTaskMarkdown("---\ntags: [tasks]\n---\n", C)).toBe(false);
    expect(isTaskMarkdown("Une note #task\n", C)).toBe(false);
    const byProperty = { ...C, identification: "property" as const, property: { name: "type", value: "task" } };
    expect(isTaskMarkdown("---\ntype: task\n---\n", byProperty)).toBe(true);
    expect(isTaskMarkdown(TASK, byProperty)).toBe(false);
  });

  it("reads its fields", () => {
    const info = taskInfo("TaskNotes/Tasks/Refaire le site.md", TASK, C);
    expect(info).toMatchObject({ title: "Refaire le site", status: "in-progress", done: false, priority: "high", due: "2026-10-20", contexts: ["bureau"], projects: ["[[Site Maison Pain]]"], tags: ["client"], timeEstimate: 90, order: "tnmzzzzzzzzz", comments: 1, checklist: { done: 1, total: 2 } });
    expect(taskInfo("T/x.md", "---\ntitle: Le vrai titre\ntags: [task]\nstatus: done\n---\n", { ...C, titleInFilename: false })).toMatchObject({ title: "Le vrai titre", done: true });
    expect(tasksOf([["a.md", TASK], ["b.md", "# Note\n"]], C).map((t) => t.path)).toEqual(["a.md"]);
  });

  it("creates tasks like TaskNotes", () => {
    const now = new Date(2026, 9, 14, 13, 40, 5);
    const file = newTaskFile("Appeler Paul", C, now);
    expect(file).toMatch(/^---\nstatus: open\npriority: normal\ndateCreated: 2026-10-14T13:40:05\.000[+-]\d\d:\d\d\ndateModified: 2026-10-14T13:40:05\.000[+-]\d\d:\d\d\ntags:\n {2}- task\n---\n\n$/);
    expect(isTaskMarkdown(file, C)).toBe(true);
    expect(taskFileName("Appeler Paul : urgent?", C)).toBe("Appeler Paul urgent");
    expect(taskFileName("x", { ...C, titleInFilename: false }, now)).toBe(`261014${(13 * 3600 + 40 * 60 + 5).toString(36)}`);
    expect(newTaskFile("Titre", { ...C, titleInFilename: false }, now)).toMatch(/^---\ntitle: "Titre"\n/);
  });

  it("completes and reopens a task, keeping the rest of the file", () => {
    const now = new Date(2026, 9, 15, 9, 0);
    const done = setTaskField(TASK, "status", "done", C, now);
    expect(done).toContain("status: done\n");
    expect(done).toContain("completedDate: 2026-10-15\n");
    expect(done).toMatch(/dateModified: 2026-10-15T09:00:00\.000/);
    expect(done.split("---\n").slice(2).join("---\n")).toBe(TASK.split("---\n").slice(2).join("---\n"));
    const reopened = setTaskField(done, "status", "open", C, now);
    expect(reopened).not.toContain("completedDate");
    // A recurring task is completed occurrence by occurrence: no completedDate.
    expect(setTaskField("---\nrecurrence: FREQ=WEEKLY\ntags: [task]\n---\n", "status", "done", C, now)).not.toContain("completedDate");
  });

  it("puts open tasks with a due date in the agenda", () => {
    const items = agenda([["Notes/A.md", "- [ ] Rappeler 📅 2026-10-18\n- [x] Fait 📅 2026-10-01\n"], ["T/Site.md", TASK], ["T/Fini.md", "---\nstatus: done\ndue: 2026-10-10\ntags: [task]\n---\n"]], C);
    expect(items.map((i) => [i.kind, i.text, i.due])).toEqual([
      ["checkbox", "Rappeler", "2026-10-18"],
      ["task", "Site", "2026-10-20"],
    ]);
  });

  it("takes a checkbox's priority sign out of its text", () => {
    const [item] = agenda([["A.md", "- [ ] Mot de passe ⏫ #compta 📅 2026-10-18\n"]], C);
    expect([item.text, item.priority]).toEqual(["Mot de passe #compta", "high"]);
  });

  it("leaves the other Tasks signs out of a checkbox's text", () => {
    const [item] = agenda([["A.md", "- [ ] Rédiger ⏳ 2026-10-31 🛫 2026-10-28 🔁 every week 📅 2026-11-04 #site\n"]], C);
    expect(item.text).toBe("Rédiger #site");
  });
});

describe("TaskNotes settings", () => {
  it("reads the plugin's data.json, with French labels for its defaults", () => {
    const config = readTaskConfig(JSON.stringify({ tasksFolder: "Tâches/", taskTag: "#todo", fieldMapping: { due: "deadline" }, customStatuses: [{ value: "done", label: "Done", isCompleted: true, order: 2 }, { value: "open", label: "Open", order: 1 }, { value: "wait", label: "En attente", order: 3 }], storeTitleInFilename: false }));
    expect(config).toMatchObject({ folder: "Tâches", tag: "todo", titleInFilename: false, fromPlugin: true });
    expect(config.fields.due).toBe("deadline");
    expect(config.fields.status).toBe("status");
    expect(config.statuses.map((s) => [s.value, s.label, s.done])).toEqual([
      ["open", "À faire", false],
      ["done", "Terminé", true],
      ["wait", "En attente", false],
    ]);
    expect(readTaskConfig("{}")).toBe(C);
    expect(readTaskConfig("pas du json")).toBe(C);
  });

  it("names the TaskNotes views in the tabs", () => {
    expect(taskViewTitle(C, "TaskNotes/Views/tasks-default.base")).toBe("Tâches");
    expect(taskViewTitle(C, "TaskNotes/Views/kanban-default.base")).toBe("Tableau des tâches");
    expect(taskViewTitle(C, "Notes/tasks-default.base")).toBeNull();
  });
});

describe("task board order", () => {
  const task = (path: string, order: string | null) => ({ ...taskInfo(path, "---\ntags: [task]\n---\n", C), order });

  it("encodes ranks as TaskNotes does", () => {
    expect(encodeRank(0)).toBe("tnaaaaaaaaaa");
    expect(decodeRank(encodeRank(123456789))).toBe(123456789);
    expect(decodeRank("0|hzzzzz:")).toBeNull();
  });

  it("shows the highest rank first, never placed tasks after", () => {
    expect(sortCards([task("a.md", "tnb"), task("b.md", null), task("c.md", "tnc")]).map((t) => t.path)).toEqual(["c.md", "a.md", "b.md"]);
  });

  it("moving a card between two ranked ones writes that task only", () => {
    const cards = [task("a.md", encodeRank(300)), task("b.md", encodeRank(100))];
    expect(planMove(task("m.md", null), cards, 1)).toEqual([{ path: "m.md", order: encodeRank(200) }]);
  });

  it("renumbers the column when the neighbours leave no room or have no rank", () => {
    const cards = [task("a.md", encodeRank(101)), task("b.md", encodeRank(100))];
    const changes = planMove(task("m.md", null), cards, 1);
    expect(changes.map((c) => c.path)).toEqual(["a.md", "m.md", "b.md"]);
    expect(changes[0].order > changes[1].order && changes[1].order > changes[2].order).toBe(true);
    expect(planMove(task("m.md", null), [task("a.md", null)], 0).map((c) => c.path)).toEqual(["m.md", "a.md"]);
  });
});
