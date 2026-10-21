// III. Comparison view: any two run records, side by side, with numeric and textual diffs.
import { $, h, short, fmtMs, fmtTime, toNumber, setHash } from './util.js';
import * as R from './records.js';
import { lineDiff, diffHTML, diffStats } from './diff.js';
import { importFiles } from './replay.js';
import * as X from './experiments.js';

let booted = false, showAll = false;

// Flatten a result into path -> leaf. Arrays of rows keyed by 'n' align on n, not position.
export function flatten(v, prefix = '', out = {}) {
  if (Array.isArray(v)) {
    const byN = v.length && v.every((x) => x && typeof x === 'object' && 'n' in x);
    v.forEach((x, i) => flatten(x, `${prefix}[${byN ? 'n=' + x.n : i}]`, out));
  } else if (v && typeof v === 'object') {
    for (const k of Object.keys(v).sort()) flatten(v[k], prefix ? `${prefix}.${k}` : k, out);
  } else out[prefix] = v;
  return out;
}

function fmtNum(x) {
  if (x == null) return '';
  if (x === 0) return '0';
  const a = Math.abs(x);
  return a !== 0 && (a < 1e-4 || a >= 1e9) ? x.toExponential(4) : String(+x.toPrecision(10));
}

function options(sel, current) {
  const runs = R.all();
  sel.replaceChildren(h('option', { value: '' }, runs.length ? '— choose a run —' : '— no runs yet —'), ...runs.map((r) => h('option', { value: r.id, selected: r.id === current }, R.label(r))));
}

function metaTable(a, b) {
  const rows = [
    ['experiment', a.experiment, b.experiment],
    ['kind', a.replay_of ? 'replay' : a.variant ? 'variant' : 'original', b.replay_of ? 'replay' : b.variant ? 'variant' : 'original'],
    ['source', `${a.source.repo}@${short(a.source.commit)}`, `${b.source.repo}@${short(b.source.commit)}`],
    ['code sha256', short(a.code_sha256, 16), short(b.code_sha256, 16)],
    ['output sha256', short(a.output_sha256, 16), short(b.output_sha256, 16)],
    ['checks', `${a.checks.pass}/${a.checks.total}`, `${b.checks.pass}/${b.checks.total}`],
    ['exit code', a.exit_code, b.exit_code],
    ['duration (Python)', fmtMs(a.duration_ms), fmtMs(b.duration_ms)],
    ['engine', `Pyodide ${a.engine.pyodide} · Py ${a.engine.python}`, `Pyodide ${b.engine.pyodide} · Py ${b.engine.python}`],
    ['timestamp', fmtTime(a.timestamp), fmtTime(b.timestamp)],
  ];
  const keys = [...new Set([...Object.keys(a.params || {}), ...Object.keys(b.params || {})])];
  for (const k of keys) rows.push([`param · ${k}`, String(a.params?.[k] ?? '—'), String(b.params?.[k] ?? '—')]);
  return h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'A'), h('th', {}, 'B'))),
    h('tbody', {}, rows.map(([k, x, y]) => h('tr', { class: String(x) !== String(y) && !['timestamp', 'duration (Python)'].includes(k) ? 'diff' : '' }, h('td', {}, k), h('td', {}, x), h('td', {}, y)))));
}

function resultTable(a, b) {
  const fa = flatten({ result: a.result, derived_checks: a.checks }), fb = flatten({ result: b.result, derived_checks: b.checks });
  const keys = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].filter((k) => !k.endsWith('last_line'));
  const rows = [];
  let nd = 0;
  for (const k of keys) {
    const x = fa[k], y = fb[k];
    const same = JSON.stringify(x) === JSON.stringify(y);
    if (!same) nd++;
    if (same && !showAll) continue;
    const nx = toNumber(x), ny = toNumber(y);
    let d = '', rel = '';
    if (nx != null && ny != null) { d = fmtNum(ny - nx); rel = nx !== 0 ? fmtNum((ny - nx) / Math.abs(nx)) : ''; }
    rows.push(h('tr', { class: same ? '' : 'diff' }, h('td', {}, k), h('td', { class: 'num' }, x === undefined ? '—' : String(x)), h('td', { class: 'num' }, y === undefined ? '—' : String(y)), h('td', { class: 'num' }, d), h('td', { class: 'num' }, rel)));
  }
  const toggle = h('label', {}, h('input', { type: 'checkbox', checked: showAll, onchange: (e) => { showAll = e.target.checked; render(); } }), 'show unchanged values');
  const tbl = rows.length ? h('table', {}, h('thead', {}, h('tr', {}, ['value', 'A', 'B', 'B − A', '(B − A)/|A|'].map((c) => h('th', {}, c)))), h('tbody', {}, rows))
    : h('div', { class: 'empty' }, 'Every structured value is identical.');
  return { el: h('div', {}, toggle, h('div', { class: 'table-wrap', style: 'max-height:46vh' }, tbl)), nd, total: keys.length };
}

function render() {
  const a = R.get($('#cp-a').value), b = R.get($('#cp-b').value);
  const body = $('#cp-body');
  if (!a || !b) { body.replaceChildren(h('div', { class: 'empty' }, 'Pick two run records: from this session, from earlier sessions in this browser, or upload run JSON files. Tip: run the census at n = 5 and n = 7, or run an edited variant next to the original.')); return; }
  const same = a.output_sha256 === b.output_sha256;
  const rt = resultTable(a, b);
  const codeOps = a.code_sha256 !== b.code_sha256 ? lineDiff(a.code, b.code) : null;
  const outOps = lineDiff(a.stdout, b.stdout);
  const os = diffStats(outOps);
  const verdict = h('div', { class: 'verdict' }, same ? h('span', {}, h('b', {}, 'Identical output.'), ' Same stdout and structured result, bit for bit (output sha256 ', short(a.output_sha256, 12), ').')
    : h('span', {}, h('b', {}, `${rt.nd} of ${rt.total} values differ`), `; stdout +${os.added} / −${os.removed} lines`, codeOps ? `; code differs (+${diffStats(codeOps).added} / −${diffStats(codeOps).removed} lines)` : '; same code', '.'));
  const figs = [a, b].map((r) => X.figureSVG(r));
  body.replaceChildren(
    verdict,
    h('div', { class: 'cmp-grid' },
      h('div', {}, h('div', { class: 'cmp-h' }, 'Record ', h('i', {}, 'meta & parameters')), metaTable(a, b)),
      h('div', {}, h('div', { class: 'cmp-h' }, 'Outputs ', h('i', {}, 'numeric differences')), rt.el)),
    figs.some(Boolean) ? h('div', { class: 'cmp-grid' }, ...figs.map((s, i) => h('div', { class: 'figure', html: s ? `<div class="tiny">${i ? 'B' : 'A'}</div>` + s : '' }))) : '',
    h('div', { class: 'cmp-h' }, 'stdout ', h('i', {}, 'A → B')), h('pre', { class: 'diff', html: diffHTML(outOps) }),
    codeOps ? h('div', {}, h('div', { class: 'cmp-h' }, 'Code ', h('i', {}, 'A → B')), h('pre', { class: 'diff', html: diffHTML(codeOps) })) : h('p', { class: 'tiny' }, `Both runs used identical code (sha256 ${short(a.code_sha256, 16)}).`),
  );
}

export async function show(q) {
  if (!booted) {
    booted = true;
    const sync = () => setHash('compare', { a: $('#cp-a').value, b: $('#cp-b').value }, true) || render();
    $('#cp-a').onchange = sync; $('#cp-b').onchange = sync;
    $('#cp-upload').onchange = async (e) => {
      const ids = await importFiles([...e.target.files]);
      e.target.value = '';
      if (ids.length) {
        const a = $('#cp-a').value && !$('#cp-b').value ? $('#cp-a').value : ids[0];
        const b = ids.length > 1 ? ids[1] : a === ids[0] ? $('#cp-b').value : ids[0];
        setHash('compare', { a, b });
      }
    };
    R.subscribe(() => { if (location.hash.startsWith('#/compare')) { options($('#cp-a'), $('#cp-a').value); options($('#cp-b'), $('#cp-b').value); render(); } });
  }
  const runs = R.all();
  let a = q.get('a'), b = q.get('b');
  if (a && !b) b = (runs.find((r) => r.id !== a && r.experiment === R.get(a)?.experiment) || runs.find((r) => r.id !== a) || {}).id;
  options($('#cp-a'), a); options($('#cp-b'), b);
  render();
}
