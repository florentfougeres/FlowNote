import { describe, expect, it } from "vitest";
import { agenda, dueLabel, ticketInfo, ticketsOf, urgency } from "./agenda";

const notes: [string, string][] = [
  ["Projets.md", "- [ ] Appeler Ana 📅 2026-10-20\n- [x] Fait 📅 2026-10-01\n- [ ] Sans date\n```\n- [ ] Dans du code 📅 2026-10-02\n```\n> - [ ] Dans une citation 📅 2026-10-15\n"],
  ["Tickets/3 - Bug.md", "---\ntype: ticket\nid: 3\nstatus: open\ntags: [bug, ui]\ndue: 2026-10-18\n---\n\n- [x] a\n- [ ] b 📅 2026-10-16\n\n## Commentaires\n\n> [!comment] 14/10/2026 13:42\n> Un\n>\n> > [!comment] 14/10/2026 14:00\n> > Deux\n"],
  ["Tickets/4 - Fermé.md", "---\ntype: ticket\nstatus: closed\ndue: 2026-10-01\nclosed: 2026-10-10T10:00\n---\n"],
];

describe("agenda and tickets", () => {
  it("collects dated unchecked tasks and open tickets, soonest first", () => {
    expect(agenda(notes).map((i) => [i.kind, i.text, i.due])).toEqual([
      ["task", "Dans une citation", "2026-10-15"],
      ["task", "b", "2026-10-16"],
      ["ticket", "Bug", "2026-10-18"],
      ["task", "Appeler Ana", "2026-10-20"],
    ]);
  });

  it("reads a ticket's state, tags, tasks and comments", () => {
    expect(ticketInfo(...notes[1])).toMatchObject({ id: 3, title: "Bug", status: "open", tags: ["bug", "ui"], due: "2026-10-18", comments: 2, tasks: { done: 1, total: 2 } });
    expect(ticketsOf(notes).map((t) => [t.title, t.status])).toEqual([
      ["Bug", "open"],
      ["Fermé", "closed"],
    ]);
  });

  it("labels urgency", () => {
    expect(urgency("2026-10-13", "2026-10-14")).toBe("overdue");
    expect(urgency("2026-10-14", "2026-10-14")).toBe("today");
    expect(urgency("2026-10-19", "2026-10-14")).toBe("soon");
    expect(urgency("2026-11-30", "2026-10-14")).toBe("later");
    expect(dueLabel("2026-10-15", "2026-10-14")).toBe("demain");
    expect(dueLabel("2026-10-11", "2026-10-14")).toBe("en retard de 3 jours");
  });
});
