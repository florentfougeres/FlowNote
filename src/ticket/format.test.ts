import { describe, expect, it } from "vitest";
import { commentDate, isTicketMarkdown, joinTicket, nextTicketId, newTicketFile, parseComments, serializeComments, splitTicket, ticketTitle } from "./format";

const TICKET = `---
type: ticket
id: 12
status: open
tags: [bug]
---

Le bouton ne répond pas.

- [ ] Reproduire 📅 2026-10-16

## Commentaires

> [!comment] 14/10/2026 13:42
> Je reproduis le bug.
>
> Sur macOS seulement.
>
> > [!comment] 14/10/2026 15:05
> > Corrigé par a1b2c3d.
> >
> > > [!comment] 14/10/2026 16:00
> > > Merci !

> [!comment] 15/10/2026 09:10
> À vérifier.
`;

describe("ticket format", () => {
  it("recognises tickets by their front matter", () => {
    expect(isTicketMarkdown(TICKET)).toBe(true);
    expect(isTicketMarkdown("---\ntype: note\n---\n")).toBe(false);
    expect(isTicketMarkdown("type: ticket\n")).toBe(false);
  });

  it("splits head and comments, and joins them back byte for byte", () => {
    const file = splitTicket(TICKET);
    expect(file.head.endsWith("📅 2026-10-16\n\n")).toBe(true);
    expect(file.commentsSection.startsWith("## Commentaires\n")).toBe(true);
    expect(joinTicket(file.head, file.commentsSection)).toBe(TICKET);
    expect(splitTicket("# Sans commentaires\n")).toEqual({ head: "# Sans commentaires\n", commentsSection: "", comments: [] });
  });

  it("parses the thread, replies included", () => {
    const comments = parseComments(splitTicket(TICKET).commentsSection);
    expect(comments).toEqual([
      {
        date: "14/10/2026 13:42",
        text: "Je reproduis le bug.\n\nSur macOS seulement.",
        replies: [{ date: "14/10/2026 15:05", text: "Corrigé par a1b2c3d.", replies: [{ date: "14/10/2026 16:00", text: "Merci !", replies: [] }] }],
      },
      { date: "15/10/2026 09:10", text: "À vérifier.", replies: [] },
    ]);
  });

  it("writes a thread that reads back the same, and matches the file as written", () => {
    const comments = parseComments(splitTicket(TICKET).commentsSection);
    const section = serializeComments(comments);
    expect(section).toBe(splitTicket(TICKET).commentsSection);
    expect(parseComments(section)).toEqual(comments);
    expect(serializeComments([])).toBe("");
  });

  it("numbers tickets and builds new ones", () => {
    expect(nextTicketId(["Tickets/1 - A.md", "Tickets/7 - B.md", "Autre/9 - C.md", "Tickets/Note.md"], "Tickets")).toBe(8);
    expect(nextTicketId([], "Tickets")).toBe(1);
    expect(ticketTitle("Tickets/12 - Bug d'affichage.md")).toEqual({ id: 12, title: "Bug d'affichage" });
    expect(ticketTitle("Tickets/Idée.md")).toEqual({ id: null, title: "Idée" });
    const file = newTicketFile(3, new Date(2026, 9, 14, 13, 40));
    expect(file).toBe("---\ntype: ticket\nid: 3\nstatus: open\ntags: []\ncreated: 2026-10-14T13:40\n---\n\n");
    expect(isTicketMarkdown(file)).toBe(true);
    expect(commentDate(new Date(2026, 0, 5, 9, 3))).toBe("05/01/2026 09:03");
  });

  it("adds a comment to a ticket without comments", () => {
    const head = "---\ntype: ticket\n---\n\nTexte.\n";
    expect(joinTicket(head, serializeComments([{ date: "14/10/2026 13:42", text: "Premier", replies: [] }]))).toBe(`${head}\n## Commentaires\n\n> [!comment] 14/10/2026 13:42\n> Premier\n`);
  });
});
