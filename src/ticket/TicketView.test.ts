// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TicketView } from "./TicketView";
import { NULL_BRIDGE } from "../editor/bridge";
import type { Editor } from "@tiptap/core";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SOURCE = "---\ntype: ticket\nid: 3\nstatus: open\ntags: [bug]\ncreated: 2026-10-14T09:00\n---\n\nLe bouton ne répond pas.\n\n## Commentaires\n\n> [!comment] 14/10/2026 09:12\n> Je regarde.\n";

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  let markdown = SOURCE;
  const render = () =>
    root!.render(
      createElement(TicketView, {
        path: "Tickets/3 - Bouton.md",
        source: SOURCE,
        markdown,
        onMarkdown: (next: string) => {
          markdown = next;
          act(render);
        },
        bridge: { ...NULL_BRIDGE, notePath: "Tickets/3 - Bouton.md" },
        editable: true,
        onEditor: () => {},
      }),
    );
  root = createRoot(container);
  act(render);
  return { container, file: () => markdown };
}

/** Types into a comment composer (a small Tiptap editor). */
function type(scope: Element, value: string) {
  const dom = scope.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null;
  act(() => {
    dom!.editor!.commands.insertContent(value);
  });
}
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const button = (scope: ParentNode, label: string) => [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim() === label || b.title === label)!;

describe("ticket page", () => {
  it("shows the header and the thread", () => {
    const { container } = mount();
    expect(container.querySelector(".ticket-title")?.textContent).toBe("Bouton #3");
    expect(container.querySelector(".ticket-state")?.textContent?.trim()).toBe("Ouvert");
    expect(container.querySelectorAll(".comment")).toHaveLength(1);
    // Comments are rendered as Markdown, like the page.
    expect(container.querySelector(".comment-text .note p")?.textContent).toBe("Je regarde.");
  });

  it("replies, comments and closes: the file is exactly as expected", () => {
    const { container, file } = mount();
    click(button(container.querySelector(".comment-card")!, "Répondre"));
    type(container.querySelector(".comment-replies .comment-composer")!, "Une réponse");
    click(button(container.querySelector(".comment-replies")!, "Répondre"));
    const composer = container.querySelector(".ticket-thread > .comment-composer")!;
    type(composer, "Corrigé.");
    click(button(composer, "Commenter et fermer"));
    const text = file();
    expect(text).toMatch(/^---\ntype: ticket\nid: 3\nstatus: closed\ntags: \[bug\]\ncreated: 2026-10-14T09:00\nclosed: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}\n---\n\nLe bouton ne répond pas\.\n\n## Commentaires\n\n> \[!comment\] 14\/10\/2026 09:12\n> Je regarde\.\n>\n> > \[!comment\] \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\n> > Une réponse\n\n> \[!comment\] \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\n> Corrigé\.\n$/);
    expect(container.querySelector(".ticket-state")?.textContent?.trim()).toBe("Fermé");
  });

  it("deleting a comment asks first, then removes it", () => {
    const { container, file } = mount();
    click(button(container.querySelector(".comment-card")!, "Supprimer"));
    click(button(container.querySelector(".comment-confirm")!, "Supprimer"));
    expect(file()).toBe("---\ntype: ticket\nid: 3\nstatus: open\ntags: [bug]\ncreated: 2026-10-14T09:00\n---\n\nLe bouton ne répond pas.\n");
  });
});
