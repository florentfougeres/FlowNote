import { describe, expect, it } from "vitest";
import { commentDate, DEFAULT_SECTION_LAYOUT, isTicketMarkdown, joinTicket, nextTicketId, newTicketFile, parseComments, serializeComments, splitTicket, ticketTitle, type TicketComment } from "./format";

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
    expect(splitTicket("# Sans commentaires\n")).toEqual({ head: "# Sans commentaires\n", commentsSection: "", comments: [], layout: DEFAULT_SECTION_LAYOUT });
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

  it("never reuses the id of a ticket renamed without its number", () => {
    expect(nextTicketId(["Tickets/1 - A.md", "Tickets/Renommé.md"], "Tickets", [1, 7])).toBe(8);
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

  describe("edits written by hand in Obsidian survive a new comment", () => {
    /** Adds a comment the way the ticket page does, then returns the file. */
    const addComment = (markdown: string) => {
      const file = splitTicket(markdown);
      const next: TicketComment[] = [...file.comments, { date: "16/10/2026 10:00", text: "Nouveau.", replies: [] }];
      return joinTicket(file.head, serializeComments(next, file.layout));
    };
    const NEW = "> [!comment] 16/10/2026 10:00\n> Nouveau.";

    it("a quote or a callout inside a comment is part of its text", () => {
      const md = "D\n\n## Commentaires\n\n> [!comment] 1\n> Voir :\n>\n> > citation\n>\n> > [!warning] Attention\n> > danger\n";
      expect(splitTicket(md).comments[0]).toEqual({ date: "1", text: "Voir :\n\n> citation\n\n> [!warning] Attention\n> danger", replies: [] });
      expect(addComment(md)).toBe(`${md}\n${NEW}\n`);
    });

    it("text after the thread is kept", () => {
      const md = "D\n\n## Commentaires\n\n> [!comment] 1\n> a\n\n## Notes\n\nGarder ça.\n";
      expect(addComment(md)).toBe(`D\n\n## Commentaires\n\n> [!comment] 1\n> a\n\n${NEW}\n\n## Notes\n\nGarder ça.\n`);
    });

    it("an introduction before the first comment is kept", () => {
      const md = "D\n\n## Commentaires\n\nIntro.\n\n> [!comment] 1\n> a\n";
      expect(addComment(md)).toBe(`${md}\n${NEW}\n`);
      expect(addComment("D\n\n## Commentaires\n\nAucun pour l'instant.\n")).toBe(`D\n\n## Commentaires\n\nAucun pour l'instant.\n\n${NEW}\n`);
    });

    it("Windows line endings stay Windows line endings", () => {
      const md = "D\r\n\r\n## Commentaires\r\n\r\n> [!comment] 1\r\n> a\r\n";
      expect(addComment(md)).toBe(`${md}\r\n${NEW.replace(/\n/g, "\r\n")}\r\n`);
    });

    it("deeply nested replies read back the same", () => {
      const md = "D\n\n## Commentaires\n\n> [!comment] 1\n> a\n>\n> > [!comment] 2\n> > b\n> >\n> > > [!comment] 3\n> > > c\n> > >\n> > > > [!comment] 4\n> > > > d\n";
      expect(splitTicket(md).comments[0].replies[0].replies[0].replies[0].text).toBe("d");
      expect(addComment(md)).toBe(`${md}\n${NEW}\n`);
    });
  });

  it("a comments heading inside a code block of the description is not the section", () => {
    const md = "Desc\n\n```md\n## Commentaires\n> [!comment] faux\n```\n\nSuite\n";
    expect(splitTicket(md).head).toBe(md);
    const withThread = `${md}\n## Commentaires\n\n> [!comment] 1\n> vrai\n`;
    expect(splitTicket(withThread).comments.map((c) => c.text)).toEqual(["vrai"]);
  });
});
