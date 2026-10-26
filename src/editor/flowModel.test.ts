import { describe, expect, it } from "vitest";
import { addStep, parseFlow, removeStep, serializeFlow, setStepType } from "./flowModel";

const DEMO = ["st=>start: Idée", "op=>operation: Brouillon", "cond=>condition: Relu ?", "e=>end: Publié", "", "st->op->cond", "cond(yes)->e", "cond(no)->op"].join("\n");

describe("flowchart.js blocks", () => {
  it("reads steps and chained links", () => {
    const model = parseFlow(DEMO);
    expect(model.steps.map((s) => [s.id, s.type, s.text])).toEqual([
      ["st", "start", "Idée"],
      ["op", "operation", "Brouillon"],
      ["cond", "condition", "Relu ?"],
      ["e", "end", "Publié"],
    ]);
    expect(model.links).toEqual([
      { from: "st", to: "op", line: 5 },
      { from: "op", to: "cond", line: 5 },
      { from: "cond", to: "e", branch: "yes", line: 6 },
      { from: "cond", to: "op", branch: "no", line: 7 },
    ]);
    expect(model.extra).toEqual([]);
  });

  it("writes an unchanged source back as it was", () => {
    expect(serializeFlow(parseFlow(DEMO))).toBe(DEMO);
    const source = ["st=>start: A|past", "sub1(align-next=no)=>subroutine: B:>http://example.com[blank]", "cond=>condition: C", "e=>end", "", "st->sub1(right)->cond(yes, right)->e", "cond(no)->st", "", "st@>sub1({\"stroke\":\"Red\"})"].join("\n");
    expect(serializeFlow(parseFlow(source))).toBe(source);
  });

  it("reads true and false as yes and no", () => {
    expect(parseFlow("c=>condition: ?\ne=>end\nc(true)->e").links).toEqual([{ from: "c", to: "e", branch: "yes", line: 2 }]);
  });

  it("adds a step after another, linked from its free way out", () => {
    const model = parseFlow("st=>start: A\nc=>condition: B\nst->c\nc(yes)->st");
    const added = addStep(model, "operation", "c");
    expect(added.id).toBe("op1");
    expect(added.model.steps.map((s) => s.id)).toEqual(["st", "c", "op1"]);
    expect(added.model.links.at(-1)).toEqual({ from: "c", to: "op1", branch: "no" });
    // New links follow on: a new step after the last one continues its chain.
    const chained = addStep(addStep(parseFlow("st=>start: A"), "operation", "st").model, "end", "op1").model;
    expect(serializeFlow(chained)).toBe("st=>start: A\nop1=>operation\ne=>end\n\nst->op1->e");
    // A step with its single arrow taken: the new one slips into it.
    expect(serializeFlow(addStep(parseFlow(DEMO), "operation", "st").model)).toBe(
      ["st=>start: Idée", "op1=>operation", "op=>operation: Brouillon", "cond=>condition: Relu ?", "e=>end: Publié", "", "st->op1->op->cond", "cond(yes)->e", "cond(no)->op"].join("\n"),
    );
    // A condition with both ways out taken gets no third arrow.
    const full = parseFlow("c=>condition: ?\na=>end\nb=>end\nc(yes)->a\nc(no)->b");
    expect(addStep(full, "end", "c").model.links).toEqual(full.links);
  });

  it("removes a step with its links, and drops ways out a new type lacks", () => {
    const model = parseFlow(DEMO);
    expect(serializeFlow(removeStep(model, "cond"))).toBe("st=>start: Idée\nop=>operation: Brouillon\ne=>end: Publié\n\nst->op");
    expect(setStepType(model, "cond", "operation").links.filter((l) => l.from === "cond")).toEqual([
      { from: "cond", to: "e", line: 6 },
      { from: "cond", to: "op", line: 7 },
    ]);
  });
});
