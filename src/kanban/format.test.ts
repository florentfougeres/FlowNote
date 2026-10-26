import { describe, expect, it } from "vitest";
import { NEW_KANBAN, addCard, addLane, cardDone, cardText, isKanbanMarkdown, moveCard, parseKanban, renameLane, serializeKanban, setCard } from "./format";

const BOARD = `---

kanban-plugin: board

---

## À faire

- [ ] Devis Maison Pain @{2026-10-30}
- [ ] Relire le contrat
	avec Paul


## Fait

**Complete**
- [x] Logo validé


%% kanban:settings
\`\`\`
{"kanban-plugin":"board","list-collapse":[false]}
\`\`\`
%%`;

describe("Kanban plugin boards", () => {
  it("knows a board by its property", () => {
    expect(isKanbanMarkdown(BOARD)).toBe(true);
    expect(isKanbanMarkdown("# Note\n\n## À faire\n")).toBe(false);
  });

  it("reads lists and cards, and writes an untouched board back to the byte", () => {
    const board = parseKanban(BOARD);
    expect(board.lanes.map((l) => [l.title, l.complete, l.cards.map(cardText)])).toEqual([
      ["À faire", false, ["Devis Maison Pain @{2026-10-30}", "Relire le contrat\n\tavec Paul"]],
      ["Fait", true, ["Logo validé"]],
    ]);
    expect(cardDone(board.lanes[1].cards[0])).toBe(true);
    expect(serializeKanban(board)).toBe(BOARD);
    expect(serializeKanban(parseKanban(NEW_KANBAN))).toBe(NEW_KANBAN);
  });

  it("moves a card to a complete list, checking it, and rewrites only the lists changed", () => {
    const moved = serializeKanban(moveCard(parseKanban(BOARD), { lane: 0, card: 0 }, { lane: 1, index: 1 }));
    expect(moved).toBe(BOARD.replace("- [ ] Devis Maison Pain @{2026-10-30}\n", "").replace("- [x] Logo validé\n", "- [x] Logo validé\n- [x] Devis Maison Pain @{2026-10-30}\n"));
  });

  it("adds, edits and removes cards, adds and renames lists", () => {
    let board = addCard(parseKanban(BOARD), 0, "Appeler Paul");
    board = setCard(board, 0, 1, null);
    board = renameLane(board, 1, "Terminé");
    board = addLane(board, "Plus tard");
    expect(serializeKanban(board)).toContain("## À faire\n\n- [ ] Devis Maison Pain @{2026-10-30}\n- [ ] Appeler Paul\n\n\n## Terminé\n\n**Complete**\n- [x] Logo validé\n\n\n## Plus tard\n\n\n\n%% kanban:settings");
  });
});
