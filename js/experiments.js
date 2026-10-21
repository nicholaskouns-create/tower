// Experiment registry, source loading (pinned + hashed), execution and run-record assembly.
import { sha256, canonical, uid, toNumber } from './util.js';
import * as gh from './github.js';
import * as engine from './engine.js';
import { SCHEMA } from './records.js';
import { linePlot, sectorBar } from './plot.js';

export const SELF_REPO = 'nicholaskouns-create/tower';
let registry = null, build = null;
const adhoc = new Map(JSON.parse(localStorage.getItem('e47tower:adhoc') || '[]'));

export async function loadRegistry() {
  if (registry) return registry;
  const [reg, b] = await Promise.all([
    fetch('experiments/registry.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('build.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  registry = reg; build = b || { commit: null, ref: null };
  engine.configure(reg.pyodide);
  return registry;
}
export const buildInfo = () => build;

export function list() {
  return [...registry.experiments, ...adhoc.values()];
}
export function find(id) { return list().find((e) => e.id === id); }

// Any Python file seen in the explorer can become an experiment, pinned to its commit.
export function addAdhoc(repo, path, commit) {
  const id = `gh:${repo.split('/')[1]}:${path}@${commit.slice(0, 7)}`;
  if (!adhoc.has(id)) {
    adhoc.set(id, {
      id, title: `${path.split('/').pop()} @ ${commit.slice(0, 7)}`, adhoc: true,
      summary: `Run ${repo}/${path} exactly as committed at ${commit.slice(0, 7)}. Standard library runs immediately; numpy, scipy and sympy imports are fetched into the browser on demand. Scripts that need files or a network beyond that will fail honestly.`,
      source: { kind: 'github', repo, path, commit }, params: [], postprocess: 'generic',
    });
    localStorage.setItem('e47tower:adhoc', JSON.stringify([...adhoc]));
  }
  return id;
}

// Returns {code, source} where source is fully pinned: repo, path, commit, sha256, url.
export async function loadSource(exp) {
  const s = exp.source;
  if (s.kind === 'github') {
    const code = await gh.rawText(s.repo, s.commit, s.path);
    const digest = await sha256(code);
    return {
      code,
      source: { kind: 'github', repo: s.repo, path: s.path, commit: s.commit, sha256: digest, pinned_sha256: s.sha256 || null,
        integrity: s.sha256 ? (s.sha256 === digest ? 'matches registry pin' : 'DOES NOT match registry pin') : 'no pin recorded',
        url: gh.blobUrl(s.repo, s.commit, s.path), raw: gh.rawUrl(s.repo, s.commit, s.path) },
    };
  }
  const code = await fetch(s.path, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`${s.path}: HTTP ${r.status}`); return r.text(); });
  const digest = await sha256(code);
  const commit = build && build.commit;
  return {
    code,
    source: { kind: 'local', repo: SELF_REPO, path: s.path, commit: commit || null, sha256: digest,
      integrity: commit ? 'served from the deployed commit' : 'local working tree (no deploy commit; see build.json)',
      url: gh.blobUrl(SELF_REPO, commit || 'main', s.path), raw: gh.rawUrl(SELF_REPO, commit || 'main', s.path) },
  };
}

export function defaults(exp) {
  const p = {};
  for (const d of exp.params || []) p[d.name] = d.type === 'const' ? d.value : d.default;
  return p;
}

export function checkParams(exp, params) {
  const errs = [];
  for (const d of exp.params || []) {
    const v = params[d.name];
    if (d.type === 'int') {
      if (!Number.isInteger(v)) errs.push(`${d.label || d.name} must be an integer`);
      else {
        if (d.min != null && v < d.min) errs.push(`${d.label || d.name} ≥ ${d.min}`);
        if (d.max != null && v > d.max) errs.push(`${d.label || d.name} ≤ ${d.max}`);
        if (d.constraint === 'tower' && (v % 2 === 0 || v % 3 === 0)) errs.push(`n = ${v} is not on the tower: n must be odd and not divisible by 3 (5, 7, 11, 13, 17, 19, …)`);
      }
    }
  }
  return errs;
}

export async function outputHash(stdout, result) { return sha256(stdout + '\u0000' + canonical(result)); }

export async function execute({ exp, code, source, params, originalSha, parentId = null, replayOf = null, onOut }) {
  const filename = source.path.split('/').pop();
  const codeHash = await sha256(code);
  let stdout = '', stderr = '';
  const started = new Date().toISOString();
  const res = await engine.run({ code, params, filename, onOut: (stream, t) => { if (stream === 'stdout') stdout += t + '\n'; else stderr += t + '\n'; onOut && onOut(stream, t); } });
  const info = engine.engineInfo();
  const rec = {
    schema: SCHEMA, id: uid(), experiment: exp.id, title: exp.title,
    params, code, code_sha256: codeHash, original_code_sha256: originalSha || source.sha256,
    variant: codeHash !== (originalSha || source.sha256), parent_id: parentId, replay_of: replayOf,
    source, engine: { runtime: 'pyodide', pyodide: info.pyodide, python: info.python, worker: true, seed: 0 },
    timestamp: started, duration_ms: Math.round(res.python_ms * 10) / 10, wall_ms: Math.round(res.wall_ms * 10) / 10,
    exit_code: res.exit_code, stdout, stderr, result: res.result ?? null,
  };
  rec.checks = countChecks(stdout);
  rec.output_sha256 = await outputHash(stdout, rec.result);
  rec.derived = derive(exp, rec);
  return rec;
}

export function countChecks(stdout) {
  const pass = (stdout.match(/^\[PASS\]/gm) || []).length, fail = (stdout.match(/^\[FAIL\]/gm) || []).length;
  const m = /RESULT:\s*(\d+)\s*\/\s*(\d+)/.exec(stdout);
  const last = stdout.trim().split('\n').pop() || '';
  return { pass, fail, total: pass + fail, reported: m ? `${m[1]}/${m[2]}` : null, last_line: last };
}

// Deterministic, JS-side views of a record: the table (for CSV), the figure, a one-line headline.
export function derive(exp, rec) {
  const kind = exp ? exp.postprocess : 'generic';
  const ok = rec.exit_code === 0 && rec.checks.fail === 0;
  const out = { ok, table: null, figure: null, headline: null };
  if (kind === 'validator' || kind === 'generic') {
    const rows = [];
    for (const line of rec.stdout.split('\n')) {
      const m = /^\[(PASS|FAIL)\]\s+(.*?)(?:\s{2,}(.*))?$/.exec(line);
      if (m) rows.push({ status: m[1], check: m[2], value: m[3] ?? '' });
    }
    if (rows.length) out.table = { columns: ['status', 'check', 'value'], rows };
    const pts = [];
    for (const line of rec.stdout.split('\n')) {
      const m = /n=(\d+)\s+j=(\d+)\s+D\/\(2j\+1\)\^2=(\S+)\s+\|err\|=(\S+)/.exec(line);
      if (m) pts.push({ n: +m[1], j: +m[2], ratio: m[3], err: +m[4] });
    }
    if (pts.length) {
      out.series = { columns: ['n', 'j', 'ratio', 'err'], rows: pts };
      out.figure = { kind: 'line', title: '|D/(2j+1)² − 3/φ| along the tower', subtitle: `validator output · ${rec.source.repo}@${(rec.source.commit || '').slice(0, 7)}`, xlabel: 'tower index n', ylabel: 'gap to 3/φ (log scale)', logy: true, points: pts.map((p) => [p.n, p.err]) };
    }
    out.headline = rec.checks.total ? `${rec.checks.pass} / ${rec.checks.total} checks ${ok ? 'pass' : 'with failures'}` : `exit code ${rec.exit_code}`;
  } else if (kind === 'census') {
    const r = rec.result || {};
    const rows = r.rows || [];
    const cols = ['n', 'j', 'J', 'n_j', 'n_J', 'D', 'dim_total', 'ratio', 'ratio_float', 'gap_3_over_phi_str', 'nj_over_nJ'];
    if (rows.length) out.table = { columns: cols, rows };
    if (r.mode === 'sweep' && rows.length) {
      out.figure = { kind: 'line', title: '|D/(2j+1)² − 3/φ| along the tower', subtitle: `tower_census sweep 5 ≤ n ≤ ${rec.params.n_max} · ${rows.length} members`, xlabel: 'tower index n', ylabel: 'gap to 3/φ (log scale)', logy: true, points: rows.map((x) => [x.n, toNumber(x.gap_3_over_phi_str)]) };
      const last = rows[rows.length - 1];
      out.headline = `${rows.length} tower members to n = ${last.n}; gap to 3/φ falls to ${last.gap_3_over_phi_str}`;
    } else if (rows.length) {
      const x = rows[0];
      out.figure = { kind: 'sector', n: x.n, j: x.j, J: x.J, nj: x.n_j, nJ: x.n_J, D: x.D, total: x.dim_total };
      const cs = r.casimir && !r.casimir.skipped ? ` · exact Casimir: dim ker K = ${r.casimir.dim_ker_K}, Ω_c = ${r.casimir.Omega_c}` : '';
      out.headline = `n = ${x.n}: n(j) = ${x.n_j}, n(J) = ${x.n_J}, D = ${x.D}${cs}`;
    }
    if (!out.headline) out.headline = `exit code ${rec.exit_code}`;
  }
  return out;
}

export function figureSVG(rec) {
  const f = rec.derived && rec.derived.figure;
  if (!f) return null;
  if (f.kind === 'line') return linePlot(f);
  if (f.kind === 'sector') {
    const n = (v) => toNumber(v) ?? Number(v);
    return sectorBar({ n: f.n, j: f.j, J: f.J, nj: n(f.nj), nJ: n(f.nJ), D: n(f.D), total: n(f.total) });
  }
  return null;
}
