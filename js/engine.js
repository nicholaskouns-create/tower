// Thin wrapper around the Pyodide worker. One run at a time; stop() kills and respawns.
let worker = null, ready = null, info = null, version = '0.27.2';
const listeners = new Set();
export const onStatus = (fn) => listeners.add(fn);
const status = (s) => listeners.forEach((fn) => fn(s));

export function configure(v) { if (v) version = v; }
export const engineInfo = () => info;

export function boot() {
  if (ready) return ready;
  status({ state: 'loading', text: `loading Pyodide ${version} (about 10 MB, cached after the first time)…` });
  worker = new Worker(new URL('./pyworker.js', import.meta.url));
  ready = new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      if (ev.data.type === 'ready') {
        info = { pyodide: ev.data.pyodide, python: ev.data.python };
        worker.removeEventListener('message', onMsg);
        status({ state: 'ready', text: `Pyodide ${info.pyodide} · Python ${info.python}` });
        resolve(info);
      } else if (ev.data.type === 'error') {
        status({ state: 'error', text: `engine failed to load: ${ev.data.message}` });
        ready = null; reject(new Error(ev.data.message));
      }
    };
    worker.addEventListener('message', onMsg);
    worker.onerror = (e) => { status({ state: 'error', text: `engine error: ${e.message}` }); ready = null; reject(e); };
    worker.postMessage({ type: 'init', version });
  });
  return ready;
}

export async function run({ code, params, filename, onOut }) {
  await boot();
  const id = Math.random().toString(36).slice(2);
  status({ state: 'running', text: `running ${filename}…` });
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      const m = ev.data;
      if (m.id !== id) return;
      if (m.type === 'out') onOut && onOut(m.stream, m.text);
      else if (m.type === 'done') { worker.removeEventListener('message', onMsg); status({ state: 'ready', text: `Pyodide ${info.pyodide} · Python ${info.python}` }); resolve(m); }
      else if (m.type === 'error') { worker.removeEventListener('message', onMsg); status({ state: 'ready', text: `Pyodide ${info.pyodide} · Python ${info.python}` }); reject(new Error(m.message)); }
    };
    worker.addEventListener('message', onMsg);
    worker._reject = reject;
    worker.postMessage({ type: 'run', id, code, params, filename });
  });
}

export function stop() {
  if (!worker) return;
  const rej = worker._reject;
  worker.terminate(); worker = null; ready = null; info = null;
  status({ state: 'idle', text: 'stopped; the engine restarts on the next run' });
  rej && rej(new Error('stopped by user'));
}
