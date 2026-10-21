// II. Experiment runner: pick, parameterise, edit, run in Pyodide, keep every run record.
import { $, h, esc, sha256, short, fmtMs, setHash, toNumber } from './util.js';
import * as X from './experiments.js';
import * as R from './records.js';
import * as engine from './engine.js';
import { hooks } from './integrations.js';

const st = { exp: null, original: null, source: null, originalSha: null, running: false, shown: null, lastOriginal: {} };
let booted = false;

function paramForm(exp, values) {
  const form = $('#rn-params');
  form.replaceChildren();
  for (const d of exp.params || []) {
    if (d.type === 'const') continue;
    let input;
    if (d.type === 'int') input = h('input', { type: 'number', name: d.name, value: values[d.name], min: d.min, max: d.max, step: d.constraint === 'tower' ? 2 : 1 });
    else if (d.type === 'bool') input = h('input', { type: 'checkbox', name: d.name, checked: !!values[d.name] });
    form.append(h('div', { class: 'p' }, h('label', {}, d.label || d.name, input), d.help ? h('small', {}, d.help) : null));
  }
  if (!(exp.params || []).some((d) => d.type !== 'const')) form.append(h('div', { class: 'tiny' }, 'no parameters: the script runs exactly as committed'));
  form.append(h('div', { class: 'err', id: 'rn-perr' }));
}

function readParams(exp) {
  const p = X.defaults(exp);
  for (const d of exp.params || []) {
    if (d.type === 'const') continue;
    const el = $(`#rn-params [name="${d.name}"]`);
    if (d.type === 'int') p[d.name] = Number(el.value);
    if (d.type === 'bool') p[d.name] = el.checked;
  }
  return p;
}

async function updateCodeState() {
  const code = $('#rn-code').value;
  const hsh = await sha256(code);
  const edited = hsh !== st.originalSha;
  const b = $('#rn-codestate');
  b.textContent = edited ? 'variant (edited)' : 'original';
  b.className = 'badge ' + (edited ? 'variant' : '');
  $('#rn-code').classList.toggle('edited', edited);
  $('#rn-hash').textContent = `sha256 ${short(hsh, 12)}${edited ? ` · original ${short(st.originalSha, 12)}` : ''}`;
}

export async function selectExperiment(id, { params = null, code = null } = {}) {
  const exp = X.find(id) || X.list()[0];
  st.exp = exp;
  $('#rn-exp').value = exp.id;
  $('#rn-summary').textContent = exp.summary;
  paramForm(exp, params || X.defaults(exp));
  $('#rn-code').value = 'loading source…';
  $('#rn-source').textContent = '';
  try {
    const { code: src, source } = await X.loadSource(exp);
    st.original = src; st.source = source; st.originalSha = source.sha256;
    $('#rn-code').value = code ?? src;
    const pin = source.kind === 'github' ? `${source.repo}@${short(source.commit, 10)}` : `${source.repo} · ${source.commit ? '@' + short(source.commit, 10) : 'working tree'}`;
    $('#rn-source').replaceChildren(
      h('span', {}, 'source '), h('a', { href: source.url, target: '_blank', rel: 'noopener' }, `${pin} : ${source.path}`),
      h('span', {}, ` · sha256 ${short(source.sha256, 12)} · ${source.integrity}`));
  } catch (e) {
    $('#rn-code').value = `# could not load the source: ${e.message}`;
    st.original = null; st.source = null; st.originalSha = null;
  }
  updateCodeState();
}

function colorOut(text) {
  return esc(text).replace(/^\[PASS\].*$/gm, (l) => `<span class="pass">${l}</span>`).replace(/^\[FAIL\].*$|^Traceback.*$/gm, (l) => `<span class="fail">${l}</span>`);
}

export function showRecord(rec) {
  st.shown = rec;
  const ok = rec.derived && rec.derived.ok;
  const s = $('#rn-status'); s.textContent = ok ? 'pass' : 'fail'; s.className = 'badge ' + (ok ? 'pass' : 'fail');
  $('#rn-headline').innerHTML = `<b>${esc(rec.derived.headline || '')}</b><span class="k">${esc(rec.id)} · ${rec.variant ? 'variant' : 'original'} code ${short(rec.code_sha256, 10)} · ${fmtMs(rec.duration_ms)} in Python · source ${esc(rec.source.repo)}@${rec.source.commit ? esc(short(rec.source.commit)) : 'working tree'} · Pyodide ${esc(rec.engine.pyodide)}</span>`;
  $('#rn-out').innerHTML = colorOut(rec.stdout + (rec.stderr ? '\n' + rec.stderr : ''));
  const svg = X.figureSVG(rec);
  $('#rn-figure').innerHTML = svg || '';
  const t = rec.derived.table;
  const wrap = $('#rn-table');
  if (t && (rec.result && rec.result.rows)) {
    wrap.replaceChildren(h('table', {}, h('thead', {}, h('tr', {}, t.columns.map((c) => h('th', {}, c)))),
      h('tbody', {}, t.rows.map((r) => h('tr', {}, t.columns.map((c) => h('td', { class: toNumber(r[c]) != null ? 'num' : '' }, r[c] ?? '')))))));
  } else wrap.replaceChildren();
  if (rec.variant && st.lastOriginal[rec.experiment]) {
    const o = st.lastOriginal[rec.experiment];
    $('#rn-headline').append(h('a', { href: `#/compare?a=${o}&b=${rec.id}`, class: 'k' }, 'Compare this variant with the latest original run →'));
  }
}

function renderHistory() {
  const box = $('#rn-history');
  const runs = R.all();
  if (!runs.length) { box.replaceChildren(h('div', { class: 'empty' }, 'No runs yet. Every run you make lands here as a JSON record with its code hash, commit and output.')); return; }
  box.replaceChildren(...runs.slice(0, 40).map((r) => {
    const ok = r.derived && r.derived.ok;
    return h('div', { class: 'rec' },
      h('span', { class: 'dot' + (!ok ? ' fail' : r.variant ? ' variant' : '') }),
      h('span', { class: 't' }, r.title || r.experiment, ' ', h('span', { class: 'badge' + (r.variant ? ' variant' : '') }, r.replay_of ? 'replay' : r.variant ? 'variant' : 'original')),
      h('span', { class: 'm' }, `${Object.entries(r.params || {}).filter(([k]) => k !== 'mode').map(([k, v]) => `${k}=${v}`).join(' ') || 'no params'} · ${r.checks.pass}/${r.checks.total} · ${fmtMs(r.duration_ms)} · ${new Date(r.timestamp).toLocaleTimeString()} · ${short(r.output_sha256, 8)}`),
      h('span', { class: 'acts' },
        h('button', { class: 'btn ghost', onclick: () => { selectExperiment(r.experiment, { params: r.params, code: r.code }).then(() => showRecord(r)); } }, 'view'),
        h('button', { class: 'btn ghost', onclick: () => setHash('compare', { a: r.id }) }, 'compare'),
        h('button', { class: 'btn ghost', onclick: () => setHash('replay', { id: r.id }) }, 'replay'),
        h('button', { class: 'btn ghost', title: 'delete this record', onclick: () => R.remove(r.id) }, '×')));
  }));
}

async function doRun() {
  if (st.running) { engine.stop(); return; }
  const exp = st.exp; if (!exp || !st.source) return;
  const params = readParams(exp);
  const errs = X.checkParams(exp, params);
  $('#rn-perr').textContent = errs.join(' · ');
  if (errs.length) return;
  st.running = true;
  const btn = $('#rn-run'); btn.textContent = 'Stop'; btn.classList.remove('primary');
  $('#rn-out').textContent = ''; $('#rn-figure').innerHTML = ''; $('#rn-table').replaceChildren();
  $('#rn-headline').innerHTML = '<b>running…</b>'; const s = $('#rn-status'); s.textContent = 'running'; s.className = 'badge run';
  const code = $('#rn-code').value;
  try {
    const rec = await X.execute({ exp, code, source: st.source, params, originalSha: st.originalSha, parentId: (await sha256(code)) !== st.originalSha ? st.lastOriginal[exp.id] || null : null,
      onOut: (stream, t) => { const o = $('#rn-out'); o.textContent += t + '\n'; o.scrollTop = o.scrollHeight; } });
    R.add(rec);
    hooks.emit('run:recorded', { rec });
    if (!rec.variant) st.lastOriginal[exp.id] = rec.id;
    showRecord(rec);
  } catch (e) {
    $('#rn-headline').innerHTML = `<b>${esc(e.message)}</b>`; s.textContent = 'error'; s.className = 'badge fail';
  } finally {
    st.running = false; btn.textContent = 'Run'; btn.classList.add('primary');
  }
}

export async function show(q) {
  if (!booted) {
    booted = true;
    engine.onStatus((s) => ($('#rn-engine').textContent = 'Python engine: ' + s.text));
    $('#rn-exp').onchange = (e) => setHash('run', { exp: e.target.value });
    $('#rn-run').onclick = doRun;
    $('#rn-reset').onclick = () => { if (st.original != null) { $('#rn-code').value = st.original; updateCodeState(); } };
    let t; $('#rn-code').addEventListener('input', () => { clearTimeout(t); t = setTimeout(updateCodeState, 150); });
    $('#rn-code').addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); const ta = e.target, s0 = ta.selectionStart; ta.setRangeText('    ', s0, ta.selectionEnd, 'end'); updateCodeState(); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doRun(); }
    });
    R.subscribe(renderHistory);
    for (const r of R.all()) if (!r.variant && !r.replay_of && !st.lastOriginal[r.experiment]) st.lastOriginal[r.experiment] = r.id;
  }
  $('#rn-exp').replaceChildren(...X.list().map((e) => h('option', { value: e.id }, e.adhoc ? `⟶ ${e.title}` : e.title)));
  const id = q.get('exp') || (st.exp && st.exp.id) || X.list()[0].id;
  if (!st.exp || st.exp.id !== id) await selectExperiment(id);
  renderHistory();
  engine.boot().catch(() => {});   // warm the engine while the user reads
}
