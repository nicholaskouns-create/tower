// Web Worker that hosts Pyodide, so long computations never freeze the page.
// Protocol: {type:'init', version} -> {type:'ready', pyodide, python}
//           {type:'run', id, code, params, filename} -> {type:'out', id, stream, text}* then {type:'done', ...}
let pyodide = null;
let harness = null;
let current = null;

const HARNESS = `
import sys, json, time, random, decimal, traceback
def _safe(o):
    # JSON numbers lose precision past 2**53 in JavaScript: carry big integers as exact strings.
    if isinstance(o, bool) or o is None:
        return o
    if isinstance(o, int):
        return o if abs(o) <= 2**53 else str(o)
    if isinstance(o, dict):
        return {str(k): _safe(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_safe(v) for v in o]
    return o
def _e47_run(code, params_json, filename):
    params = json.loads(params_json)
    ns = {"__name__": "__main__", "__file__": filename, "PARAMS": params}
    decimal.setcontext(decimal.Context())   # fresh numeric context each run
    random.seed(0)                          # deterministic seed for replay
    old_argv = sys.argv
    sys.argv = [filename]
    exit_code = 0
    t0 = time.perf_counter()
    try:
        exec(compile(code, filename, "exec"), ns)
    except SystemExit as e:
        exit_code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
    except BaseException:
        traceback.print_exc()
        exit_code = 1
    finally:
        sys.argv = old_argv
        sys.stdout.flush(); sys.stderr.flush()
    dt = (time.perf_counter() - t0) * 1000.0
    res = _safe(ns.get("RESULT"))
    try:
        res_json = json.dumps(res, default=str)
    except Exception as e:
        res_json = json.dumps({"_unserialisable": repr(e)})
    return json.dumps({"exit_code": exit_code, "result_json": res_json, "python_ms": dt})
`;

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === 'init') {
      importScripts(`https://cdn.jsdelivr.net/pyodide/v${m.version}/full/pyodide.js`);
      pyodide = await loadPyodide({ indexURL: `https://cdn.jsdelivr.net/pyodide/v${m.version}/full/` });
      pyodide.setStdout({ batched: (t) => current && self.postMessage({ type: 'out', id: current, stream: 'stdout', text: t }) });
      pyodide.setStderr({ batched: (t) => current && self.postMessage({ type: 'out', id: current, stream: 'stderr', text: t }) });
      pyodide.runPython(HARNESS);
      harness = pyodide.globals.get('_e47_run');
      const python = pyodide.runPython('import sys; sys.version.split()[0]');
      self.postMessage({ type: 'ready', pyodide: pyodide.version, python });
    } else if (m.type === 'run') {
      current = m.id;
      // Third-party imports (numpy, scipy, sympy, …) are fetched on demand; stdlib needs nothing.
      try { await pyodide.loadPackagesFromImports(m.code); } catch (e) { self.postMessage({ type: 'out', id: m.id, stream: 'stderr', text: `[package load] ${e.message}` }); }
      const t0 = performance.now();
      const out = JSON.parse(harness(m.code, JSON.stringify(m.params || {}), m.filename || 'experiment.py'));
      const wall = performance.now() - t0;
      current = null;
      self.postMessage({ type: 'done', id: m.id, exit_code: out.exit_code, result: JSON.parse(out.result_json), python_ms: out.python_ms, wall_ms: wall });
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, message: String(e && e.message || e) });
    current = null;
  }
};
