"""FlowNote notebook kernel.

One process per open notebook, started by the desktop app with uv. It reads
one JSON request per line on stdin and writes one JSON event per line on
stdout (protocol version 1):

  requests  execute{cell, lang: python|sql, code, options{query}}
            table_page{cell, offset, limit}   freeze{cell, limit}   shutdown
  events    ready{pid, python, protocol}      status{cell, state, elapsed_ms, defs, refs}
            stream{cell, name, text}          output{cell, mime, data}
            table{cell, columns, rows, total, offset}   frozen{cell, columns, rows, total}
            error{cell, ename, evalue, frames}

Execution is linear (Jupyter style): every cell runs in one shared namespace,
the value of a last expression is displayed. SIGINT interrupts the running
cell; queued cells are then cancelled. Cells report the names they define and
use (`defs`/`refs`), the basis for reactive execution later.

marimo (https://github.com/marimo-team/marimo, Apache 2.0) is the functional
reference: SQL cells assign their result to the cell's `query` variable and
interpolate `{expressions}` like marimo's mo.sql; no marimo code is copied.
"""

import ast
import base64
import builtins
import io
import json
import linecache
import os
import queue
import signal
import sys
import threading
import time
import traceback

PROTOCOL = 1
PAGE_SIZE = 25
_real_stdout = sys.stdout
_write_lock = threading.Lock()


def send(event):
    line = json.dumps(event, ensure_ascii=False, default=str)
    with _write_lock:
        _real_stdout.write(line + "\n")
        _real_stdout.flush()


class CellStream(io.TextIOBase):
    """stdout/stderr of the running cell, forwarded as `stream` events, a line at a time."""

    def __init__(self, name):
        self.name = name
        self.cell = None
        self.buffer = ""

    def writable(self):
        return True

    def write(self, text):
        self.buffer += text
        if "\n" in text or len(self.buffer) > 4096:
            self.flush()
        return len(text)

    def flush(self):
        if self.buffer:
            send({"type": "stream", "cell": self.cell, "name": self.name, "text": self.buffer})
            self.buffer = ""


# --- Names defined and used by a cell (for reactivity later) ---------------


class _Names(ast.NodeVisitor):
    """Top-level names a cell defines, and names it reads without defining first."""

    def __init__(self):
        self.defs = []
        self.refs = []
        self._scopes = [set()]

    def _define(self, name):
        if len(self._scopes) == 1 and name not in self.defs:
            self.defs.append(name)
        self._scopes[-1].add(name)

    def _use(self, name):
        if any(name in scope for scope in self._scopes):
            return
        if hasattr(builtins, name) or name in self.refs:
            return
        self.refs.append(name)

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            self._use(node.id)
        else:
            self._define(node.id)

    def visit_Import(self, node):
        for alias in node.names:
            self._define((alias.asname or alias.name).split(".")[0])

    def visit_ImportFrom(self, node):
        for alias in node.names:
            if alias.name != "*":
                self._define(alias.asname or alias.name)

    def _function(self, node):
        for decorator in node.decorator_list:
            self.visit(decorator)
        self._define(node.name)
        self._scopes.append({a.arg for a in ast.walk(node.args) if isinstance(a, ast.arg)})
        for statement in node.body:
            self.visit(statement)
        self._scopes.pop()

    visit_FunctionDef = visit_AsyncFunctionDef = _function

    def visit_ClassDef(self, node):
        for base in node.bases:
            self.visit(base)
        self._define(node.name)
        self._scopes.append(set())
        for statement in node.body:
            self.visit(statement)
        self._scopes.pop()

    def visit_Lambda(self, node):
        self._scopes.append({a.arg for a in ast.walk(node.args) if isinstance(a, ast.arg)})
        self.visit(node.body)
        self._scopes.pop()

    def _comprehension(self, node):
        self._scopes.append(set())
        for generator in node.generators:
            self.visit(generator.iter)
            self.visit(generator.target)
            for condition in generator.ifs:
                self.visit(condition)
        for field in ("elt", "key", "value"):
            if hasattr(node, field):
                self.visit(getattr(node, field))
        self._scopes.pop()

    visit_ListComp = visit_SetComp = visit_GeneratorExp = visit_DictComp = _comprehension

    def visit_AugAssign(self, node):
        if isinstance(node.target, ast.Name):
            self._use(node.target.id)
        self.generic_visit(node)


def cell_names(tree):
    names = _Names()
    names.visit(tree)
    return names.defs, names.refs


# --- Display --------------------------------------------------------------


def _module(value):
    return type(value).__module__.split(".")[0]


def as_table(value):
    """A polars DataFrame for tabular values (polars, pandas, DuckDB), else None."""
    module = _module(value)
    try:
        if module == "polars" and type(value).__name__ == "DataFrame":
            return value
        if module == "polars" and type(value).__name__ == "LazyFrame":
            return value.collect()
        if module == "duckdb" and hasattr(value, "pl"):
            return value.pl()
        if module == "pandas" and type(value).__name__ in ("DataFrame", "Series"):
            import polars as pl

            frame = value.to_frame() if type(value).__name__ == "Series" else value
            return pl.from_pandas(frame.reset_index() if frame.index.name else frame)
    except Exception:
        return None
    return None


def json_cell(value):
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        return value if value == value and value not in (float("inf"), float("-inf")) else str(value)
    return str(value)


class Kernel:
    def __init__(self):
        self.namespace = {"__name__": "__main__", "__builtins__": builtins}
        self.tables = {}
        self.stdout = CellStream("stdout")
        self.stderr = CellStream("stderr")
        self.duckdb = None
        self.names = ([], [])

    # -- tables

    def table_event(self, cell, offset, limit, kind="table"):
        frame = self.tables.get(cell)
        if frame is None:
            return {"type": kind, "cell": cell, "columns": [], "rows": [], "total": 0, "offset": 0}
        page = frame.slice(offset, limit)
        return {
            "type": kind,
            "cell": cell,
            "columns": [{"name": name, "dtype": str(dtype)} for name, dtype in frame.schema.items()],
            "rows": [[json_cell(v) for v in row] for row in page.iter_rows()],
            "total": frame.height,
            "offset": offset,
        }

    def display(self, cell, value):
        frame = as_table(value)
        if frame is not None:
            self.tables[cell] = frame
            send(self.table_event(cell, 0, PAGE_SIZE))
            return
        module = _module(value)
        if module == "matplotlib":
            figure = getattr(value, "figure", None) or (value if hasattr(value, "savefig") else None)
            if figure is not None:
                self.send_figure(cell, figure)
                return
        if module == "plotly" and hasattr(value, "to_html"):
            # Library included: works offline (chosen trade-off: heavier output).
            send({"type": "output", "cell": cell, "mime": "text/html", "data": value.to_html(include_plotlyjs=True, full_html=False)})
            return
        for method, mime in (("_repr_html_", "text/html"), ("_repr_svg_", "image/svg+xml"), ("_repr_png_", "image/png")):
            render = getattr(value, method, None)
            if callable(render):
                try:
                    data = render()
                except Exception:
                    continue
                if data:
                    if mime == "image/png" and isinstance(data, bytes):
                        data = base64.b64encode(data).decode()
                    send({"type": "output", "cell": cell, "mime": mime, "data": data})
                    return
        text = repr(value)
        if len(text) > 20000:
            text = text[:20000] + "…"
        send({"type": "output", "cell": cell, "mime": "text/plain", "data": text})

    def send_figure(self, cell, figure):
        buffer = io.BytesIO()
        figure.savefig(buffer, format="png", bbox_inches="tight", dpi=144)
        send({"type": "output", "cell": cell, "mime": "image/png", "data": base64.b64encode(buffer.getvalue()).decode()})

    def flush_figures(self, cell, shown):
        """Figures drawn by the cell (plt.plot…) are shown as images."""
        pyplot = sys.modules.get("matplotlib.pyplot")
        if pyplot is None:
            return
        for number in pyplot.get_fignums():
            figure = pyplot.figure(number)
            if figure not in shown:
                self.send_figure(cell, figure)
        pyplot.close("all")

    # -- execution

    def run_python(self, cell, code):
        filename = f"<cellule {cell}>"
        # Lets tracebacks show the line of code.
        linecache.cache[filename] = (len(code), None, code.splitlines(True), filename)
        tree = ast.parse(code, filename=filename)
        self.names = defs, refs = cell_names(tree)
        last = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last = ast.Expression(tree.body.pop().value)
        exec(compile(tree, filename, "exec"), self.namespace)
        shown = []
        if last is not None:
            value = eval(compile(last, filename, "eval"), self.namespace)
            if value is not None:
                figure = getattr(value, "figure", None)
                if figure is not None:
                    shown.append(figure)
                self.display(cell, value)
        self.flush_figures(cell, shown)
        return defs, refs

    def run_sql(self, cell, code, options):
        import duckdb

        if self.duckdb is None:
            self.duckdb = duckdb
        # `{expression}` is interpolated as in marimo's mo.sql (an f-string).
        query = eval("f" + repr(code), self.namespace)
        # DuckDB finds DataFrames by name in the calling frame: run it in the notebook's namespace.
        self.namespace["__flownote_sql__"] = query
        try:
            exec("__flownote_rel__ = __import__('duckdb').sql(__flownote_sql__)", self.namespace)
            relation = self.namespace.pop("__flownote_rel__", None)
        finally:
            self.namespace.pop("__flownote_sql__", None)
        name = (options or {}).get("query") or "_df"
        # Python variables the query reads (DataFrames named in it): its dependencies.
        identifiers = set(__import__("re").findall(r"[A-Za-z_][A-Za-z0-9_]*", query))
        refs = sorted(n for n in identifiers if n in self.namespace and not n.startswith("__"))
        self.names = ([name], refs)
        if relation is not None:
            frame = relation.pl()
            self.namespace[name] = frame
            self.tables[cell] = frame
            send(self.table_event(cell, 0, PAGE_SIZE))
        return [name] if relation is not None else [], refs

    def error_event(self, cell, error):
        frames = []
        for frame in traceback.extract_tb(error.__traceback__):
            if frame.filename.startswith("<cellule"):
                frames.append({"where": "cellule", "line": frame.lineno, "code": frame.line or "", "name": frame.name})
            elif not frame.filename.endswith("flownote_kernel.py"):
                frames.append({"where": frame.filename, "line": frame.lineno, "code": frame.line or "", "name": frame.name})
        event = {"type": "error", "cell": cell, "ename": type(error).__name__, "evalue": str(error), "frames": frames}
        if isinstance(error, SyntaxError):
            event["frames"] = [{"where": "cellule", "line": error.lineno or 0, "code": (error.text or "").rstrip("\n"), "name": "", "offset": error.offset or 0}]
        return event

    def execute(self, request):
        cell = request.get("cell")
        start = time.perf_counter()
        send({"type": "status", "cell": cell, "state": "running"})
        self.stdout.cell = self.stderr.cell = cell
        sys.stdout, sys.stderr = self.stdout, self.stderr
        self.tables.pop(cell, None)
        self.names = ([], [])
        state = "ok"
        try:
            if request.get("lang") == "sql":
                self.run_sql(cell, request.get("code", ""), request.get("options"))
            else:
                self.run_python(cell, request.get("code", ""))
        except KeyboardInterrupt:
            state = "interrupted"
            send({"type": "error", "cell": cell, "ename": "Interrompu", "evalue": "Exécution interrompue.", "frames": []})
        except BaseException as error:  # noqa: BLE001 - every error is reported on its cell
            if isinstance(error, SystemExit):
                error = RuntimeError("SystemExit")
            state = "error"
            send(self.error_event(cell, error))
        finally:
            self.stdout.flush()
            self.stderr.flush()
            sys.stdout, sys.stderr = _real_stdout, sys.__stderr__
        elapsed = round((time.perf_counter() - start) * 1000)
        defs, refs = self.names
        send({"type": "status", "cell": cell, "state": state, "elapsed_ms": elapsed, "defs": defs, "refs": refs})
        return state


def main():
    cwd = sys.argv[sys.argv.index("--cwd") + 1] if "--cwd" in sys.argv else os.getcwd()
    os.chdir(cwd)  # relative paths in code and queries start from the notebook's folder
    sys.path.insert(0, cwd)
    kernel = Kernel()
    requests = queue.Queue()

    def read():
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                requests.put(json.loads(line))
            except json.JSONDecodeError:
                continue
        requests.put({"type": "shutdown"})

    threading.Thread(target=read, daemon=True).start()
    send({"type": "ready", "pid": os.getpid(), "python": sys.version.split()[0], "protocol": PROTOCOL})

    while True:
        try:
            request = requests.get()
        except KeyboardInterrupt:
            continue  # interrupt while idle: nothing to stop
        kind = request.get("type")
        if kind == "shutdown":
            break
        try:
            if kind == "execute":
                if request.get("skip"):
                    continue
                if kernel.execute(request) == "interrupted":
                    # Queued cells are cancelled after an interrupt.
                    while not requests.empty():
                        pending = requests.get_nowait()
                        if pending.get("type") == "execute":
                            send({"type": "status", "cell": pending.get("cell"), "state": "cancelled"})
                        elif pending.get("type") == "shutdown":
                            return
            elif kind == "table_page":
                send(kernel.table_event(request.get("cell"), int(request.get("offset", 0)), int(request.get("limit", PAGE_SIZE))))
            elif kind == "freeze":
                send(kernel.table_event(request.get("cell"), 0, int(request.get("limit", 50)), kind="frozen"))
        except KeyboardInterrupt:
            continue


if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal.default_int_handler)
    main()
