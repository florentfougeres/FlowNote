import { describe, expect, it } from "vitest";
import { applyModel, csvToData, parsePlot, PLOT_TEMPLATE, toModel } from "./plotModel";

const model = (source: string) => toModel(parsePlot(source).spec);

describe("plotly blocks", () => {
  it("reads JSON and YAML like the Obsidian plugin", () => {
    const yaml = "data:\n  - x: [0,1,2]\n    y: [0,1,0]\n";
    const json = '{\n  "data": [{ "x": [0, 1, 2], "y": [0, 1, 0] }]\n}';
    expect(parsePlot(yaml)).toEqual({ spec: { data: [{ x: [0, 1, 2], y: [0, 1, 0] }] }, format: "yaml" });
    expect(parsePlot(json).spec).toEqual(parsePlot(yaml).spec);
    expect(() => parsePlot("data: 3")).toThrow("data");
    expect(() => parsePlot("{ nope")).toThrow("JSON invalide");
  });

  it("gives the visual editor the common charts only", () => {
    expect(model(PLOT_TEMPLATE)).toEqual({
      kind: "lines",
      title: "Mon graphique",
      xTitle: "",
      yTitle: "",
      labels: ["Jan", "Fév", "Mar", "Avr", "Mai"],
      series: [{ name: "Série 1", values: [12, 18, 15, 22, 26] }],
    });
    expect(model("data:\n  - labels: [A, B]\n    values: [3, 4]\n    type: pie\n")?.kind).toBe("pie");
    expect(model("data:\n  - z: [[1, 2], [3, 4]]\n    type: heatmap\n")).toBeNull();
    expect(model("data:\n  - x: [1, 2]\n    y: [1, 2]\n  - x: [5, 6]\n    y: [1, 2]\n")).toBeNull();
  });

  it("writes YAML back in place: comments and unknown keys stay", () => {
    const source = [
      "# Ventes de l'année",
      "data:",
      "  - x: [Jan, Fév]",
      "    y: [10, 15]",
      "    type: scatter",
      "    mode: lines",
      "    line: { color: red }",
      "layout:",
      "  title: Ventes",
      "  height: 300",
      "config: { displayModeBar: false }",
      "",
    ].join("\n");
    const m = model(source)!;
    const next = applyModel(source, { ...m, kind: "bars", title: "Ventes 2026", labels: ["Jan", "Fév", "Mar"], series: [{ name: "", values: [10, 15, 20] }, { name: "B", values: [1, 2, null] }] });
    expect(next).toBe(
      [
        "# Ventes de l'année",
        "data:",
        "  - x: [ Jan, Fév, Mar ]",
        "    y: [ 10, 15, 20 ]",
        "    type: bar",
        "    line: { color: red }",
        "  - x: [ Jan, Fév, Mar ]",
        "    y: [ 1, 2, null ]",
        "    type: bar",
        "    name: B",
        "layout:",
        "  title: Ventes 2026",
        "  height: 300",
        "config: { displayModeBar: false }",
        "",
      ].join("\n"),
    );
    expect(model(next)?.series.map((s) => s.values)).toEqual([
      [10, 15, 20],
      [1, 2, null],
    ]);
  });

  it("writes JSON back as JSON, numbers stay numbers", () => {
    const source = '{"data":[{"x":[1,2],"y":[3,4],"marker":{"size":8}}],"layout":{"title":{"text":"T","x":0}}}';
    const next = applyModel(source, { ...model(source)!, labels: ["1", "2", "3"], series: [{ name: "", values: [3, 4, 5] }], xTitle: "Jours" });
    expect(JSON.parse(next)).toEqual({
      data: [{ x: [1, 2, 3], y: [3, 4, 5], marker: { size: 8 }, type: "scatter", mode: "lines" }],
      layout: { title: { text: "T", x: 0 }, xaxis: { title: "Jours" } },
    });
  });

  it("turns a chart into a pie and back", () => {
    const pie = applyModel(PLOT_TEMPLATE, { ...model(PLOT_TEMPLATE)!, kind: "pie" });
    expect(parsePlot(pie).spec.data).toEqual([{ labels: ["Jan", "Fév", "Mar", "Avr", "Mai"], values: [12, 18, 15, 22, 26], type: "pie", name: "Série 1" }]);
    expect(model(applyModel(pie, { ...model(pie)!, kind: "area" }))?.kind).toBe("area");
  });
});

describe("csvToData", () => {
  it("reads a French CSV: semicolons, decimal commas, header row", () => {
    const csv = "﻿Mois;Ventes;Coûts\r\nJanvier;1 200,5;800\r\nFévrier;1 350;\r\n";
    expect(csvToData(csv)).toEqual({
      labels: ["Janvier", "Février"],
      series: [
        { name: "Ventes", values: [1200.5, 1350] },
        { name: "Coûts", values: [800, null] },
      ],
    });
  });

  it("reads an English CSV with quotes and no header", () => {
    expect(csvToData('"Q1, 2026",1,234.5\n"Q2",2,"3,000"\n')).toEqual({
      labels: ["Q1, 2026", "Q2"],
      series: [
        { name: "Série 1", values: [1, 2] },
        { name: "Série 2", values: [234.5, 3000] },
      ],
    });
  });

  it("refuses an empty file", () => {
    expect(() => csvToData("\n\n")).toThrow("vide");
  });
});
