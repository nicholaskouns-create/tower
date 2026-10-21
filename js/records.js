// Run records: the unit of provenance. Kept in localStorage; importable/exportable as JSON.
export const SCHEMA = 'e47-tower/run@1';
const KEY = 'e47tower:runs';
const subs = new Set();

let runs = load();
function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(runs)); }
  catch {
    // Quota: drop stdout of the oldest records first, never the records themselves.
    for (const r of runs) { if (r.stdout && r.stdout.length > 2000) { r.stdout = r.stdout.slice(0, 2000) + '\n…[trimmed for storage; output_sha256 still covers the full text]'; r.stdout_trimmed = true; } }
    try { localStorage.setItem(KEY, JSON.stringify(runs)); } catch {}
  }
  subs.forEach((fn) => fn(runs));
}

export const all = () => runs.slice().sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
export const get = (id) => runs.find((r) => r.id === id);
export function add(rec) { runs = runs.filter((r) => r.id !== rec.id); runs.push(rec); persist(); return rec; }
export function remove(id) { runs = runs.filter((r) => r.id !== id); persist(); }
export const subscribe = (fn) => subs.add(fn);

export function label(r) {
  if (!r) return '';
  const p = Object.entries(r.params || {}).filter(([k]) => k !== 'mode').map(([k, v]) => `${k}=${v}`).join(' ');
  const kind = r.replay_of ? 'replay' : r.variant ? 'variant' : 'original';
  const t = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${r.experiment}${p ? ' · ' + p : ''} · ${kind} · ${r.checks ? `${r.checks.pass}/${r.checks.total}` : 'exit ' + r.exit_code} · ${t}`;
}

// Accept a record, an array of records, or {runs:[...]} and return validated records.
export function validate(obj) {
  const list = Array.isArray(obj) ? obj : obj && Array.isArray(obj.runs) ? obj.runs : [obj];
  const ok = [];
  for (const r of list) {
    if (!r || r.schema !== SCHEMA || !r.id || typeof r.code !== 'string' || !r.code_sha256) {
      throw new Error('Not an E47-Tower run record (expected schema "' + SCHEMA + '" with id, code and code_sha256).');
    }
    ok.push(r);
  }
  return ok;
}
