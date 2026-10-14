import { describe, expect, it } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The real kernel (src-tauri/resources/kernel), driven like the app does: one JSON message per line. */
const KERNEL = join(__dirname, "../../src-tauri/resources/kernel/flownote_kernel.py");
const has = (cmd: string, args: string[]) => {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

type Event = Record<string, unknown> & { type: string };

function runKernel(command: string[], cwd: string, messages: Record<string, unknown>[], { interruptAfter }: { interruptAfter?: number } = {}): Promise<Event[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], [...command.slice(1), KERNEL, "--cwd", cwd], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, UV_NO_PROGRESS: "1", UV_PYTHON_PREFERENCE: "only-managed" } });
    const events: Event[] = [];
    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const event = JSON.parse(buffer.slice(0, newline)) as Event;
        buffer = buffer.slice(newline + 1);
        events.push(event);
        if (event.type === "ready" && interruptAfter !== undefined) setTimeout(() => process.kill(event.pid as number, "SIGINT"), interruptAfter);
      }
    });
    child.on("error", reject);
    child.on("close", () => resolve(events));
    for (const message of [...messages, { type: "shutdown" }]) child.stdin.write(`${JSON.stringify(message)}\n`);
  });
}

describe.skipIf(!has("python3", ["--version"]))("kernel (Python, standard library)", () => {
  it("runs cells in a shared namespace, displays the last value, reports errors and names", async () => {
    const events = await runKernel(["python3"], tmpdir(), [
      { type: "execute", cell: "a", lang: "python", code: "x = 21 * 2\nprint('bonjour')\nx" },
      { type: "execute", cell: "b", lang: "python", code: "def f(n):\n    return n + y\nf(x)" },
      { type: "execute", cell: "c", lang: "python", code: "print(x +" },
    ]);
    const of = (cell: string, type: string) => events.filter((e) => e.cell === cell && e.type === type);
    expect(of("a", "stream")[0]).toMatchObject({ name: "stdout", text: "bonjour\n" });
    expect(of("a", "output")[0]).toMatchObject({ mime: "text/plain", data: "42" });
    expect(of("a", "status").at(-1)).toMatchObject({ state: "ok", defs: ["x"], refs: [] });
    expect(of("b", "error")[0]).toMatchObject({ ename: "NameError" });
    expect((of("b", "error")[0].frames as { code: string }[]).map((f) => f.code)).toEqual(["f(x)", "return n + y"]);
    expect(of("b", "status").at(-1)).toMatchObject({ state: "error", defs: ["f"], refs: ["y", "x"] });
    expect(of("c", "error")[0]).toMatchObject({ ename: "SyntaxError" });
  });

  it("an interrupt stops the running cell and cancels the queued ones", async () => {
    const events = await runKernel(
      ["python3"],
      tmpdir(),
      [
        { type: "execute", cell: "long", lang: "python", code: "import time\ntime.sleep(20)" },
        { type: "execute", cell: "next", lang: "python", code: "print('non')" },
      ],
      { interruptAfter: 800 },
    );
    expect(events.find((e) => e.cell === "long" && e.type === "status" && e.state !== "running")).toMatchObject({ state: "interrupted" });
    expect(events.find((e) => e.cell === "next" && e.type === "status")).toMatchObject({ state: "cancelled" });
  }, 30_000);
});

describe.skipIf(!has("uv", ["--version"]))("kernel with DuckDB and polars (uv)", () => {
  it("SQL reads Python DataFrames and relative files; the result is a polars DataFrame", async () => {
    const dir = mkdtempSync(join(tmpdir(), "flownote-kernel-"));
    writeFileSync(join(dir, "ventes.csv"), "mois,montant\n1,10\n2,20\n1,5\n");
    const events = await runKernel(["uv", "run", "--no-project", "--python", "3.13", "--with", "duckdb", "--with", "polars", "--with", "pyarrow", "python"], dir, [
      { type: "execute", cell: "p", lang: "python", code: "import polars as pl\nclients = pl.DataFrame({'id': [1, 2], 'nom': ['Ana', 'Bo']})" },
      { type: "execute", cell: "s", lang: "sql", code: "SELECT c.nom, sum(v.montant) AS total FROM clients c JOIN read_csv('ventes.csv') v ON v.mois = c.id GROUP BY c.nom ORDER BY c.nom", options: { query: "par_client" } },
      { type: "execute", cell: "q", lang: "python", code: "type(par_client).__name__, par_client.height" },
      { type: "execute", cell: "i", lang: "sql", code: "SELECT {len(clients)} AS n", options: {} },
      { type: "freeze", cell: "s", limit: 1 },
    ]);
    const table = events.find((e) => e.cell === "s" && e.type === "table")!;
    expect(table).toMatchObject({ columns: [{ name: "nom" }, { name: "total" }], total: 2 });
    // DuckDB's sum() is a decimal: sent as text to keep its exact value.
    expect((table.rows as unknown[][]).map((row) => row.map(String))).toEqual([["Ana", "15"], ["Bo", "20"]]);
    expect(events.find((e) => e.cell === "s" && e.type === "status" && e.state === "ok")).toMatchObject({ defs: ["par_client"], refs: ["clients"] });
    expect(events.find((e) => e.cell === "q" && e.type === "output")).toMatchObject({ data: "('DataFrame', 2)" });
    expect(events.find((e) => e.cell === "i" && e.type === "table")).toMatchObject({ rows: [[2]] });
    const frozen = events.find((e) => e.type === "frozen")!;
    expect(frozen).toMatchObject({ total: 2 });
    expect((frozen.rows as unknown[][]).map((row) => row.map(String))).toEqual([["Ana", "15"]]);
  }, 300_000);
});
