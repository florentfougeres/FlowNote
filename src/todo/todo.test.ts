import { describe, expect, it } from "vitest";
import { addTodo, parseTodos, toggleTodo } from "./todo";

describe("todo list", () => {
  it("adds, reads and checks tasks", () => {
    let text = addTodo("", "Appeler Paul", "Perso", "2026-10-25", ["urgent"]);
    text = addTodo(text, "Courses", "Perso", null, []);
    text = addTodo(text, "Rapport", "Travail", null, ["q4"]);
    expect(text).toBe("## Perso\n\n- [ ] Appeler Paul 📅 2026-10-25 #urgent\n- [ ] Courses\n\n## Travail\n\n- [ ] Rapport #q4\n");
    const todos = parseTodos(text);
    expect(todos[0]).toMatchObject({ title: "Appeler Paul", due: "2026-10-25", tags: ["urgent"], category: "Perso", done: false });
    expect(parseTodos(toggleTodo(text, todos[1].line, true))[1].done).toBe(true);
  });
});
