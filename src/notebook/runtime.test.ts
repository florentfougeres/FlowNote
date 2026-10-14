import { describe, expect, it, vi } from "vitest";
import { NotebookRuntime, type KernelEvent, type KernelTransport } from "./runtime";
import { packageName, readDependencies, withDependency, withoutDependency } from "./deps";

/** A fake kernel answering like the real one. */
function fakeTransport() {
  let emit: (event: KernelEvent) => void = () => {};
  const sent: Record<string, unknown>[] = [];
  const transport: KernelTransport = {
    start: vi.fn(async () => {
      setTimeout(() => emit({ type: "ready", pid: 1, python: "3.12.0" }));
    }),
    send: vi.fn(async (message) => {
      sent.push(message);
      if (message.type === "execute") {
        const cell = message.cell as string;
        setTimeout(() => {
          emit({ type: "status", cell, state: "running" });
          if (String(message.code).includes("boom")) {
            emit({ type: "error", cell, ename: "ValueError", evalue: "boom", frames: [{ where: "cellule", line: 1, code: "boom()", name: "<module>" }] });
            emit({ type: "status", cell, state: "error", elapsed_ms: 3, defs: [], refs: ["boom"] });
          } else {
            emit({ type: "stream", cell, name: "stdout", text: "42\n" });
            emit({ type: "table", cell, columns: [{ name: "a", dtype: "Int64" }], rows: [[1]], total: 30, offset: 0 });
            emit({ type: "status", cell, state: "ok", elapsed_ms: 12, defs: ["x"], refs: [] });
          }
        });
      }
      if (message.type === "table_page") setTimeout(() => emit({ type: "table", cell: message.cell as string, columns: [{ name: "a", dtype: "Int64" }], rows: [[26]], total: 30, offset: message.offset }));
      if (message.type === "freeze") setTimeout(() => emit({ type: "frozen", cell: message.cell as string, columns: [{ name: "a", dtype: "Int64" }], rows: [[1], [2]], total: 30 }));
    }),
    interrupt: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    listen: (onEvent) => {
      emit = onEvent;
      return () => {
        emit = () => {};
      };
    },
  };
  return { transport, sent };
}

const settle = () => new Promise((r) => setTimeout(r, 10));

describe("notebook runtime", () => {
  it("starts the kernel on the first run, then records outputs, state and names", async () => {
    const { transport, sent } = fakeTransport();
    const prepare = vi.fn(async () => ({ ok: true, deps: ["rich"] }));
    const runtime = new NotebookRuntime(transport, prepare);
    expect(runtime.kernel).toBe("off");
    await runtime.execute([{ id: "c1", lang: "python", code: "x = 42\nprint(x)" }]);
    await settle();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(transport.start).toHaveBeenCalledWith(["rich"]);
    expect(runtime.kernel).toBe("idle");
    expect(runtime.python).toBe("3.12.0");
    expect(runtime.run("c1")).toMatchObject({ state: "ok", elapsedMs: 12, stdout: "42\n", defs: ["x"], table: { total: 30 } });
    expect(sent[0]).toMatchObject({ type: "execute", cell: "c1", lang: "python" });
  });

  it("reports errors on their cell; Tout exécuter queues cells in order", async () => {
    const { transport, sent } = fakeTransport();
    const runtime = new NotebookRuntime(transport, async () => ({ ok: true, deps: [] }));
    await runtime.execute([
      { id: "a", lang: "python", code: "x = 1" },
      { id: "b", lang: "python", code: "boom()" },
      { id: "c", lang: "sql", code: "SELECT 1", options: { query: "r" } },
    ]);
    await settle();
    expect(sent.map((m) => m.cell)).toEqual(["a", "b", "c"]);
    expect(sent[2]).toMatchObject({ lang: "sql", options: { query: "r" } });
    expect(runtime.run("b")).toMatchObject({ state: "error", error: { ename: "ValueError", evalue: "boom" } });
    expect(transport.start).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the environment check is declined", async () => {
    const { transport } = fakeTransport();
    const runtime = new NotebookRuntime(transport, async () => ({ ok: false, deps: [] }));
    await runtime.execute([{ id: "a", lang: "python", code: "x = 1" }]);
    expect(transport.start).not.toHaveBeenCalled();
    expect(runtime.run("a").state).toBe("idle");
  });

  it("pages tables, fetches rows to freeze, restarts with clean outputs", async () => {
    const { transport } = fakeTransport();
    const runtime = new NotebookRuntime(transport, async () => ({ ok: true, deps: [] }));
    await runtime.execute([{ id: "a", lang: "python", code: "df" }]);
    await settle();
    expect((await runtime.page("a", 25)).rows).toEqual([[26]]);
    expect(runtime.run("a").table?.offset).toBe(25);
    expect((await runtime.freezeData("a", 50)).rows).toEqual([[1], [2]]);
    await runtime.restart();
    expect(transport.stop).toHaveBeenCalled();
    expect(runtime.kernel).toBe("off");
    expect(runtime.run("a").state).toBe("idle");
  });
});

describe("notebook dependencies (front matter pyproject)", () => {
  it("reads and adds PEP 723 dependencies like marimo writes them", () => {
    const pyproject = 'requires-python = ">=3.12"\ndependencies = [\n    "polars",\n    "duckdb==1.2.2",\n]';
    expect(readDependencies(pyproject)).toEqual(["polars", "duckdb==1.2.2"]);
    expect(withDependency(pyproject, "rich")).toBe('requires-python = ">=3.12"\ndependencies = [\n    "polars",\n    "duckdb==1.2.2",\n    "rich",\n]');
    expect(withDependency(pyproject, "polars>=1.0")).toContain('"polars>=1.0"');
    expect(readDependencies(withDependency(pyproject, "polars>=1.0"))).toEqual(["duckdb==1.2.2", "polars>=1.0"]);
    expect(withDependency(null, "rich")).toBe('requires-python = ">=3.12"\ndependencies = [\n    "rich",\n]');
    expect(readDependencies(withoutDependency(pyproject, "polars"))).toEqual(["duckdb==1.2.2"]);
    expect(packageName("Pandas[all]>=2")).toBe("pandas");
  });
});
