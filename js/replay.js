// IV. Replay + export: re-execute a record from its own inputs; package a research packet.
import { $, h, esc, short, fmtMs, fmtTime, sha256, download, toCSV, readFileText, setHash, canonical } from './util.js';
import * as R from './records.js';
import * as X from './experiments.js';
import * as gh from './github.js';
import { svgToPngBlob } from './plot.js';
import { lineDiff, diffHTML } from './diff.js';
import { hooks } from './integrations.js';

let booted = false;
const outcomes = new Map();   // record id -> last replay outcome (this session)

function options(current) {
  const sel = $('#rp-run');
  const runs = R.all();
  sel.replaceChildren(h('option', { value: '' }, runs.length ? '— choose a run record —' : '— no runs yet: make one in Run, or import —'), ...runs.map((r) => h('option', { value: r.id, selected: r.id === current }, R.label(r))));
}

// Verify a record's code against itself and (for GitHub sources) against the commit it names.
async function provenance(rec) {
  const codeOk = (await sha256(rec.code)) === rec.code_sha256;
  let commitOk = null, commitNote = '';
  if (rec.source.kind === 'github' && rec.source.commit) {
    try {
      const orig = await gh.rawText(rec.source.repo, rec.source.commit, rec.source.path);
      const oh = await sha256(orig);
      commitOk = oh === rec.code_sha256;
      commitNote = commitOk ? 'code is byte-identical to the file at that commit' : `code differs from the file at that commit (sha256 ${short(oh, 12)}): this is a variant`;
    } catch (e) { commitNote = `could not re-fetch the source at its commit: ${e.message}`; }
  } else if (rec.source.kind === 'local') {
    commitNote = rec.source.commit ? `tower@${short(rec.source.commit)}` : 'recorded from a local working tree (no deploy commit)';
    commitOk = rec.variant ? false : null;
  }
  return { codeOk, commitOk, commitNote };
}

function kv(pairs) {
  return h('dl', { class: 'kv' }, pairs.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}

async function render() {
  const rec = R.get($('#rp-run').value);
  const body = $('#rp-body');
  $('#rp-replay').disabled = !rec; $('#rp-export').disabled = !rec;
  if (!rec) { body.replaceChildren(h('div', { class: 'empty' }, 'Choose a run record. Replay restores its exact code, parameters and engine settings and runs it again; the packet carries everything needed to check it anywhere.')); return; }
  const pv = await provenance(rec);
  const out = outcomes.get(rec.id);
  const left = h('div', {},
    h('div', { class: 'cmp-h' }, 'Record ', h('i', {}, rec.id)),
    kv([
      ['experiment', rec.title || rec.experiment],
      ['parameters', JSON.stringify(rec.params)],
      ['source', h('a', { href: rec.source.url, target: '_blank', rel: 'noopener' }, `${rec.source.repo}@${rec.source.commit ? short(rec.source.commit, 10) : 'working tree'} : ${rec.source.path}`)],
      ['code sha256', `${rec.code_sha256} ${pv.codeOk ? '✓ matches the stored code' : '✗ does NOT match the stored code'}`],
      ['vs commit', pv.commitNote || '—'],
      ['kind', rec.replay_of ? `replay of ${rec.replay_of}` : rec.variant ? `variant${rec.parent_id ? ' of ' + rec.parent_id : ''}` : 'original'],
      ['engine', `Pyodide ${rec.engine.pyodide} · Python ${rec.engine.python} · seed ${rec.engine.seed}`],
      ['when', fmtTime(rec.timestamp)],
      ['duration', `${fmtMs(rec.duration_ms)} in Python (${fmtMs(rec.wall_ms)} wall)`],
      ['checks', `${rec.checks.pass}/${rec.checks.total} · exit ${rec.exit_code} · last line “${rec.checks.last_line}”`],
      ['output sha256', rec.output_sha256],
    ]),
    h('div', { class: 'cmp-h' }, 'Packet ', h('i', {}, 'contents')),
    h('ul', { class: 'packet' }, packetManifest(rec).map((f) => h('li', {}, f))),
  );
  const right = h('div', {}, h('div', { class: 'cmp-h' }, 'Replay ', h('i', {}, out ? fmtTime(out.rec.timestamp) : 'not yet run')));
  if (out) {
    right.append(
      h('div', { class: 'match ' + (out.match ? 'ok' : 'no') }, h('b', {}, out.match ? '✓ Bit-for-bit match.' : '✗ Output differs.')),
      kv([
        ['replay id', out.rec.id],
        ['output sha256', `${out.rec.output_sha256}`],
        ['original', rec.output_sha256],
        ['stdout', out.stdoutSame ? 'identical' : 'differs'],
        ['structured result', out.resultSame ? 'identical' : 'differs'],
        ['engine', `Pyodide ${out.rec.engine.pyodide}${out.rec.engine.pyodide !== rec.engine.pyodide ? ' (recorded on ' + rec.engine.pyodide + ')' : ''}`],
        ['duration', `${fmtMs(out.rec.duration_ms)} (timing is not part of the match)`],
      ]),
      h('p', {}, h('a', { href: `#/compare?a=${rec.id}&b=${out.rec.id}` }, 'Open original and replay in Compare →')),
      out.stdoutSame ? '' : h('pre', { class: 'diff', html: diffHTML(lineDiff(rec.stdout, out.rec.stdout)) }),
    );
  } else right.append(h('p', { class: 'summary' }, 'Replay runs the stored code (not today’s file) with the stored parameters, a fresh numeric context and seed 0, then compares the SHA-256 of stdout plus the structured result.'));
  const fig = X.figureSVG(rec);
  body.replaceChildren(h('div', { class: 'rp-grid' }, left, right), fig ? h('div', { class: 'figure', html: fig }) : '');
}

async function replay() {
  const rec = R.get($('#rp-run').value); if (!rec) return;
  const btn = $('#rp-replay'); btn.disabled = true; btn.textContent = 'Replaying…';
  try {
    const exp = X.find(rec.experiment) || { id: rec.experiment, title: rec.title, postprocess: 'generic' };
    const again = await X.execute({ exp, code: rec.code, source: rec.source, params: rec.params, originalSha: rec.original_code_sha256, parentId: rec.parent_id, replayOf: rec.id });
    again.title = rec.title;
    R.add(again);
    outcomes.set(rec.id, { rec: again, match: again.output_sha256 === rec.output_sha256, stdoutSame: again.stdout === rec.stdout, resultSame: canonical(again.result) === canonical(rec.result) });
    await render();
  } catch (e) {
    $('#rp-body').prepend(h('div', { class: 'msg' }, `Replay failed: ${e.message}`));
  } finally { btn.disabled = false; btn.textContent = 'Replay'; }
}

const scriptName = (rec) => rec.source.path.split('/').pop();
function packetManifest(rec) {
  const f = ['run.json — the complete run record (receipt)', 'output.csv — the result table', `${scriptName(rec)} — the exact script that ran (sha256 ${short(rec.code_sha256, 12)})`, 'stdout.txt — captured output', 'SOURCES.md — commit-pinned links and how to reproduce'];
  if (rec.derived && rec.derived.figure) f.splice(3, 0, 'figure.svg, figure.png — the plot');
  if (rec.derived && rec.derived.series) f.push('series.csv — the plotted series');
  return f;
}

function cliFor(rec) {
  const name = scriptName(rec);
  if (rec.experiment === 'tower-census' || rec.experiment === 'tower-sweep') return `python3 ${name} --params '${JSON.stringify(rec.params)}'`;
  return `python3 ${name}`;
}

function sourcesMD(rec, files) {
  const s = rec.source;
  const L = [];
  L.push(`# Research packet · ${rec.title || rec.experiment}`, '');
  L.push(`Run \`${rec.id}\`, recorded ${fmtTime(rec.timestamp)} with E47-Tower v0.1 (Pyodide ${rec.engine.pyodide}, Python ${rec.engine.python}).`, '');
  L.push('## Sources (commit-pinned)', '');
  L.push(`- Script: [${s.repo}@${s.commit ? short(s.commit, 10) : 'working tree'} : ${s.path}](${s.url})`);
  if (s.raw) L.push(`- Raw file: ${s.raw}`);
  L.push(s.commit ? `- Commit: https://github.com/${s.repo}/commit/${s.commit}` : '- Commit: not recorded (run from a local working tree)');
  L.push(`- Script sha256 as run: \`${rec.code_sha256}\`` + (rec.variant ? ` (a variant; the original hashes to \`${rec.original_code_sha256}\`)` : ' (identical to the source file)'));
  L.push('- Tower validator: https://github.com/nicholaskouns-create/E47-Kartekeya/blob/7f815053339a24f23882ad04c9f60e99260212a6/research/e47/validation/e47_fib_lucas_tower_validate.py');
  L.push('- Tower paper: https://github.com/nicholaskouns-create/E47-Kartekeya/tree/research/fib-lucas-tower-paper/research/e47/papers/fib_lucas_tower', '');
  L.push('## Reproduce', '', 'Outside the browser (Python 3.10 or newer, standard library only):', '', '```');
  L.push(`sha256sum ${scriptName(rec)}   # expect ${rec.code_sha256}`, cliFor(rec), '```', '');
  L.push('Inside E47-Tower: Replay & Export → Import run JSON / packet → choose this zip or run.json → Replay.', '');
  L.push(`Match criterion: SHA-256 of (stdout + "\\0" + canonical JSON of the structured result) = \`${rec.output_sha256}\`.`, '');
  L.push(`Parameters \`${JSON.stringify(rec.params)}\` · exit code ${rec.exit_code} · checks ${rec.checks.pass}/${rec.checks.total}.`, '');
  L.push('## Files', '', ...files.map((f) => `- ${f}`), '');
  return L.join('\n');
}

export async function buildPacket(rec) {
  const zip = new JSZip();
  const dir = zip.folder(`e47-tower-${rec.id}`);
  const files = ['run.json', scriptName(rec), 'stdout.txt', 'output.csv'];
  dir.file('run.json', JSON.stringify(rec, null, 2) + '\n');
  dir.file(scriptName(rec), rec.code);
  dir.file('stdout.txt', rec.stdout + (rec.stderr ? '\n--- stderr ---\n' + rec.stderr : ''));
  const t = rec.derived && rec.derived.table;
  dir.file('output.csv', t ? toCSV(t.columns, t.rows) : toCSV(['key', 'value'], Object.entries(rec.result || {}).map(([key, value]) => ({ key, value }))));
  if (rec.derived && rec.derived.series) { dir.file('series.csv', toCSV(rec.derived.series.columns, rec.derived.series.rows)); files.push('series.csv'); }
  const svg = X.figureSVG(rec);
  if (svg) {
    dir.file('figure.svg', svg); files.push('figure.svg');
    try { dir.file('figure.png', await svgToPngBlob(svg)); files.push('figure.png'); } catch {}
  }
  files.push('SOURCES.md');
  dir.file('SOURCES.md', sourcesMD(rec, files));
  hooks.emit('packet:built', { rec, files });
  return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), files, name: `e47-tower-${rec.id}.zip` };
}

async function exportPacket() {
  const rec = R.get($('#rp-run').value); if (!rec) return;
  const { blob, name } = await buildPacket(rec);
  download(name, blob, 'application/zip');
}

// Accept run JSON (record, array, {runs}) or a packet zip containing run.json.
export async function importFiles(files) {
  const ids = [];
  for (const f of files) {
    try {
      let text;
      if (/\.zip$/i.test(f.name)) {
        const z = await JSZip.loadAsync(f);
        const entry = Object.values(z.files).find((e) => /(^|\/)run\.json$/.test(e.name));
        if (!entry) throw new Error('no run.json inside the zip');
        text = await entry.async('string');
      } else text = await readFileText(f);
      const recs = R.validate(JSON.parse(text));
      for (const r of recs) {
        r.imported = r.imported || { from: f.name, at: new Date().toISOString(), code_hash_ok: (await sha256(r.code)) === r.code_sha256 };
        if (!r.derived) r.derived = X.derive(X.find(r.experiment), r);
        R.add(r); ids.push(r.id);
      }
    } catch (e) { alert(`${f.name}: ${e.message}`); }
  }
  return ids;
}

export async function show(q) {
  if (!booted) {
    booted = true;
    $('#rp-run').onchange = (e) => setHash('replay', { id: e.target.value }, true) || render();
    $('#rp-replay').onclick = replay;
    $('#rp-export').onclick = exportPacket;
    $('#rp-import').onchange = async (e) => { const ids = await importFiles([...e.target.files]); e.target.value = ''; if (ids.length) setHash('replay', { id: ids[0] }); };
  }
  options(q.get('id') || $('#rp-run').value);
  await render();
}
