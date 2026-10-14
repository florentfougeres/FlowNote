/**
 * The running side of a notebook page: kernel state, per-cell runs and their
 * outputs. Outputs live here, never in the document, so running cells leaves
 * the file untouched. The kernel is reached through a transport (Tauri in the
 * app, a fake one in tests).
 *
 * V1 runs cells in the order they are asked (Jupyter style). Each run records
 * the names a cell defines and uses (`defs`/`refs`): the dependency graph for
 * reactive execution (V2) is built from them (see graph.ts).
 */

export type KernelState = "off" | "starting" | "idle" | "busy" | "dead";
export type CellState = "idle" | "queued" | "running" | "ok" | "error" | "interrupted" | "cancelled";

export interface TableData {
  columns: { name: string; dtype: string }[];
  rows: unknown[][];
  total: number;
  offset: number;
}

export interface CellError {
  ename: string;
  evalue: string;
  frames: { where: string; line: number; code: string; name: string; offset?: number }[];
}

export interface CellRun {
  state: CellState;
  elapsedMs?: number;
  stdout: string;
  stderr: string;
  outputs: { mime: string; data: string }[];
  table?: TableData;
  error?: CellError;
  defs: string[];
  refs: string[];
}

export interface CellRequest {
  id: string;
  lang: "python" | "sql";
  code: string;
  options?: Record<string, string>;
}

export type KernelEvent = Record<string, unknown> & { type: string };

export interface KernelTransport {
  /** Starts the kernel; `deps` are the notebook's own dependencies. */
  start(deps: string[]): Promise<void>;
  send(message: Record<string, unknown>): Promise<void>;
  interrupt(): Promise<void>;
  stop(): Promise<void>;
  /** Subscribes to kernel events; returns the unsubscribe function. */
  listen(onEvent: (event: KernelEvent) => void): () => void;
}

const emptyRun = (): CellRun => ({ state: "idle", stdout: "", stderr: "", outputs: [], defs: [], refs: [] });

export class NotebookRuntime {
  kernel: KernelState = "off";
  /** Python version, once the kernel is ready. */
  python: string | null = null;
  /** uv / kernel messages of the last start (shown when starting fails). */
  log = "";
  readonly runs = new Map<string, CellRun>();
  private listeners = new Set<() => void>();
  private unlisten: (() => void) | null = null;
  private starting: Promise<void> | null = null;
  private pendingTables = new Map<string, (table: TableData) => void>();
  private pendingFreezes = new Map<string, (table: TableData) => void>();

  constructor(
    private readonly transport: KernelTransport,
    /** Called before the first start (environment checks); false cancels the run. */
    private readonly prepare: () => Promise<{ ok: boolean; deps: string[] }>,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private changed() {
    this.listeners.forEach((l) => l());
  }

  run(id: string): CellRun {
    return this.runs.get(id) ?? emptyRun();
  }

  private update(id: string, change: (run: CellRun) => Partial<CellRun>) {
    const current = this.run(id);
    this.runs.set(id, { ...current, ...change(current) });
  }

  private async ensureKernel(): Promise<boolean> {
    if (this.kernel === "idle" || this.kernel === "busy") return true;
    if (!this.starting) {
      this.starting = (async () => {
        const { ok, deps } = await this.prepare();
        if (!ok) throw new Error("cancelled");
        this.kernel = "starting";
        this.log = "";
        this.changed();
        this.unlisten?.();
        const ready = new Promise<void>((resolve, reject) => {
          this.unlisten = this.transport.listen((event) => {
            if (event.type === "ready") resolve();
            if (event.type === "exit" && this.kernel === "starting") reject(new Error(String(event.log ?? "")));
            this.handle(event);
          });
        });
        await this.transport.start(deps);
        await ready;
      })().finally(() => {
        this.starting = null;
      });
    }
    try {
      await this.starting;
      return true;
    } catch {
      this.changed();
      return false;
    }
  }

  private handle(event: KernelEvent) {
    const cell = typeof event.cell === "string" ? event.cell : null;
    switch (event.type) {
      case "ready":
        this.kernel = "idle";
        this.python = String(event.python ?? "");
        break;
      case "log":
        this.log = (this.log + String(event.text ?? "")).slice(-8000);
        break;
      case "exit":
        this.kernel = "dead";
        for (const [id, run] of this.runs) if (run.state === "running" || run.state === "queued") this.runs.set(id, { ...run, state: "cancelled" });
        break;
      case "status": {
        if (!cell) break;
        const state = event.state as CellState;
        if (state === "running") {
          this.kernel = "busy";
          this.update(cell, () => ({ ...emptyRun(), state: "running" }));
        } else {
          this.update(cell, () => ({ state, elapsedMs: event.elapsed_ms as number | undefined, defs: (event.defs as string[]) ?? [], refs: (event.refs as string[]) ?? [] }));
          if (![...this.runs.values()].some((r) => r.state === "running" || r.state === "queued")) this.kernel = "idle";
        }
        break;
      }
      case "stream":
        if (cell) this.update(cell, (run) => (event.name === "stderr" ? { stderr: run.stderr + String(event.text) } : { stdout: run.stdout + String(event.text) }));
        break;
      case "output":
        if (cell) this.update(cell, (run) => ({ outputs: [...run.outputs, { mime: String(event.mime), data: String(event.data) }] }));
        break;
      case "error":
        if (cell) this.update(cell, () => ({ error: { ename: String(event.ename), evalue: String(event.evalue), frames: (event.frames as CellError["frames"]) ?? [] } }));
        break;
      case "table": {
        if (!cell) break;
        const table = { columns: event.columns, rows: event.rows, total: event.total, offset: event.offset } as TableData;
        this.update(cell, () => ({ table }));
        this.pendingTables.get(cell)?.(table);
        this.pendingTables.delete(cell);
        break;
      }
      case "frozen": {
        if (!cell) break;
        this.pendingFreezes.get(cell)?.({ columns: event.columns, rows: event.rows, total: event.total, offset: 0 } as TableData);
        this.pendingFreezes.delete(cell);
        return;
      }
    }
    this.changed();
  }

  /** Queues cells (in this order) and starts the kernel if needed. */
  async execute(cells: CellRequest[]): Promise<void> {
    if (cells.length === 0) return;
    for (const cell of cells) this.update(cell.id, (run) => ({ ...run, state: "queued" }));
    this.changed();
    if (!(await this.ensureKernel())) {
      for (const cell of cells) this.update(cell.id, (run) => ({ ...run, state: "idle" }));
      this.changed();
      return;
    }
    for (const cell of cells) await this.transport.send({ type: "execute", cell: cell.id, lang: cell.lang, code: cell.code, options: cell.options ?? {} });
  }

  async interrupt() {
    if (this.kernel === "busy") await this.transport.interrupt();
  }

  /** Stops the kernel; the namespace and every output are cleared. */
  async restart() {
    await this.stop();
    this.runs.clear();
    this.changed();
  }

  async stop() {
    this.unlisten?.();
    this.unlisten = null;
    if (this.kernel !== "off" && this.kernel !== "dead") await this.transport.stop();
    this.kernel = "off";
    for (const [id, run] of this.runs) if (run.state === "running" || run.state === "queued") this.runs.set(id, { ...run, state: "cancelled" });
    this.changed();
  }

  /** Another page of a table output. */
  page(id: string, offset: number, limit = 25): Promise<TableData> {
    return new Promise((resolve) => {
      this.pendingTables.set(id, resolve);
      void this.transport.send({ type: "table_page", cell: id, offset, limit });
    });
  }

  /** First rows of a table output, for "Figer". */
  freezeData(id: string, limit: number): Promise<TableData> {
    return new Promise((resolve) => {
      this.pendingFreezes.set(id, resolve);
      void this.transport.send({ type: "freeze", cell: id, limit });
    });
  }
}
