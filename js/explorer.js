// I. Repository explorer: public GitHub tree at a pinned commit, source with highlighting.
import { $, h, esc, short, setHash } from './util.js';
import * as gh from './github.js';
import * as X from './experiments.js';

export const PINS = {
  validator: { repo: 'nicholaskouns-create/E47-Kartekeya', path: 'research/e47/validation/e47_fib_lucas_tower_validate.py', refs: ['main'] },
  paper: { repo: 'nicholaskouns-create/E47-Kartekeya', path: 'research/e47/papers/fib_lucas_tower/tower_paper.tex', refs: ['c14e98bd6d701723c887a5ba3a34b8caf902ab55'] },
  census: { repo: X.SELF_REPO, path: 'experiments/tower_census.py', refs: ['main', 'release/v0.1-workbench'], local: true },
};
const LANG = { py: 'python', tex: 'latex', js: 'javascript', mjs: 'javascript', json: 'json', md: 'markdown', yml: 'yaml', yaml: 'yaml', sh: 'bash', html: 'xml', xml: 'xml', svg: 'xml', css: 'css', toml: 'ini', ini: 'ini', ts: 'typescript', sql: 'sql', r: 'r', jl: 'julia', c: 'c', cpp: 'cpp', rs: 'rust', go: 'go' };
const IMG = /\.(png|jpe?g|gif|webp|svg)$/i;
const BIN = /\.(pdf|zip|gz|tar|npz|npy|pkl|pickle|xlsx|docx|pptx|mp4|mov|mp3|wav|woff2?|ttf|ico|bin|h5|parquet)$/i;

const st = { repo: PINS.validator.repo, ref: 'main', sha: null, entries: [], path: null, filter: '' };
let booted = false;

function msg(text, kind = 'warn') {
  const el = $('#ex-msg');
  if (!text) { el.hidden = true; return; }
  el.hidden = false; el.className = 'msg' + (kind === 'info' ? ' info' : ''); el.textContent = text;
}

async function loadRefs() {
  const sel = $('#ex-ref');
  try {
    const bs = await gh.branches(st.repo);
    bs.sort((a, b) => (a.name === 'main' ? -1 : b.name === 'main' ? 1 : a.name.localeCompare(b.name)));
    sel.replaceChildren(...bs.map((b) => h('option', { value: b.name }, b.name)));
    if (!bs.some((b) => b.name === st.ref)) sel.append(h('option', { value: st.ref }, st.ref));
  } catch (e) {
    sel.replaceChildren(h('option', { value: st.ref }, st.ref));
    if (e instanceof gh.RateLimitError) msg(e.message); else msg(e.message);
  }
  sel.value = st.ref;
}

async function loadTree() {
  $('#ex-tree').replaceChildren(h('div', { class: 'tiny' }, 'loading tree…'));
  try {
    st.sha = await gh.resolveRef(st.repo, st.ref);
    const sha = $('#ex-sha');
    sha.replaceChildren(h('a', { href: gh.commitUrl(st.repo, st.sha), target: '_blank', rel: 'noopener', title: st.sha }, `@ ${short(st.sha, 10)}`));
    const t = await gh.tree(st.repo, st.sha);
    st.entries = t.entries;
    msg(t.truncated ? 'GitHub truncated this tree (very large repository); some deep paths may be missing.' : '');
    renderTree();
  } catch (e) {
    st.entries = [];
    $('#ex-tree').replaceChildren(h('div', { class: 'tiny' }, 'tree unavailable'));
    msg(e.message);
  }
}

function renderTree() {
  const f = st.filter.toLowerCase();
  const files = st.entries.filter(([p, t]) => t === 'f' && (!f || p.toLowerCase().includes(f)));
  $('#ex-count').textContent = `${files.length} file${files.length === 1 ? '' : 's'}${f ? ' match' : ''} · ${st.repo}@${short(st.sha)}`;
  const root = { dirs: new Map(), files: [] };
  for (const [p, , size] of files) {
    const parts = p.split('/'); let node = root;
    for (const d of parts.slice(0, -1)) { if (!node.dirs.has(d)) node.dirs.set(d, { dirs: new Map(), files: [] }); node = node.dirs.get(d); }
    node.files.push([parts[parts.length - 1], p, size]);
  }
  const openAll = !!f && files.length < 400;
  const build = (node, prefix) => {
    const out = [];
    for (const [name, child] of [...node.dirs].sort((a, b) => a[0].localeCompare(b[0]))) {
      const full = prefix + name + '/';
      const det = h('details', { open: openAll || (st.path && st.path.startsWith(full)) }, h('summary', {}, name + '/'));
      det.append(...build(child, full));
      out.push(det);
    }
    for (const [name, p, size] of node.files.sort((a, b) => a[0].localeCompare(b[0]))) {
      out.push(h('a', { class: 'f' + (p === st.path ? ' on' : ''), href: `#/explore?repo=${encodeURIComponent(st.repo)}&ref=${encodeURIComponent(st.ref)}&path=${encodeURIComponent(p)}`, title: `${p} · ${size} bytes`, 'data-path': p }, name));
    }
    return out;
  };
  $('#ex-tree').replaceChildren(...build(root, ''));
}

function renderCode(text, lang) {
  const code = $('#ex-code code');
  let html = esc(text);
  if (window.hljs && lang) { try { html = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value; } catch {} }
  // Gutter of line numbers that stays correct even when highlight spans cross lines.
  const n = text.split('\n').length;
  code.innerHTML = `<span style="display:grid;grid-template-columns:auto 1fr"><span class="ln" style="white-space:pre">${Array.from({ length: n }, (_, i) => i + 1).join('\n')}</span><span style="white-space:pre">${html}</span></span>`;
}

export async function openFile(path, { repo = st.repo, ref = st.ref } = {}) {
  st.path = path;
  const pinnedRef = st.sha || ref;
  $('#ex-path').textContent = `${repo} / ${path}`;
  const gl = $('#ex-gh'); gl.hidden = false; gl.href = gh.blobUrl(repo, pinnedRef, path);
  const cp = $('#ex-copy'); cp.hidden = false; cp.onclick = async () => { await navigator.clipboard.writeText(gh.blobUrl(repo, pinnedRef, path)).catch(() => {}); cp.textContent = 'Copied'; setTimeout(() => (cp.textContent = 'Copy permalink'), 1200); };
  const tr = $('#ex-torun');
  tr.hidden = !/\.py$/.test(path);
  tr.onclick = () => {
    if (!st.sha) return msg('Need the commit SHA to pin the experiment; the tree has not resolved yet.');
    const local = repo === X.SELF_REPO && path === 'experiments/tower_census.py';
    const id = local ? 'tower-census' : X.addAdhoc(repo, path, st.sha);
    setHash('run', { exp: id });
  };
  if (st.entries.length) renderTree();   // opens the folders leading to this file
  const on = document.querySelector('#ex-tree .f.on');
  if (on) on.scrollIntoView({ block: 'center' });
  const ext = (path.split('.').pop() || '').toLowerCase();
  const meta = $('#ex-meta');
  const entry = st.entries.find(([p]) => p === path);
  meta.textContent = `${entry ? entry[2].toLocaleString() + ' bytes · ' : ''}pinned to ${short(pinnedRef, 10)}`;
  if (IMG.test(path) && ext !== 'svg') {
    $('#ex-code code').replaceChildren(h('img', { src: gh.rawUrl(repo, pinnedRef, path), alt: path, style: 'max-width:100%;display:block;padding:14px' }));
    return;
  }
  if (BIN.test(path)) { $('#ex-code code').replaceChildren(h('span', { class: 'tiny' }, 'Binary file. Use “Open on GitHub” to view or download it.')); return; }
  if (entry && entry[2] > 600000) { $('#ex-code code').replaceChildren(h('span', { class: 'tiny' }, `Large file (${entry[2].toLocaleString()} bytes). Open it on GitHub.`)); return; }
  $('#ex-code code').textContent = 'loading…';
  try {
    const text = await gh.rawText(repo, pinnedRef, path);
    renderCode(text, LANG[ext]);
  } catch (e) {
    $('#ex-code code').textContent = e.message;
  }
}

async function selectRepo(repo, ref = 'main') {
  st.repo = repo; st.ref = ref; st.sha = null; st.path = null;
  $('#ex-repo').value = repo;
  await loadRefs();
  await loadTree();
}

export async function openPin(key) {
  const pin = PINS[key];
  msg('');
  let ref = null;
  let probeError = null;
  for (const r of pin.refs) {
    try { if (await gh.rawExists(pin.repo, r, pin.path)) { ref = r; break; } }
    catch (e) { probeError ??= e; msg(e.message); }
  }
  if (!ref) {
    if (pin.local) {          // not pushed yet (local preview): show the copy this site serves
      st.path = pin.path;
      $('#ex-path').textContent = `${pin.repo} / ${pin.path} (served copy; not on GitHub yet)`;
      const text = await fetch(pin.path).then((r) => r.text());
      renderCode(text, 'python');
      return;
    }
    // A failed network probe cannot establish that a manuscript is absent.
    if (probeError) return msg(`Could not verify ${pin.path}: ${probeError.message}`);
    return msg(`${pin.path} was not found on ${pin.refs.join(' or ')}.`);
  }
  if (ref !== pin.refs[0]) {
    const note = probeError
      ? `${pin.path.split('/').pop()} loaded from ${ref}; an earlier source check was unavailable: ${probeError.message}`
      : `${pin.path.split('/').pop()} is not on ${pin.refs[0]} yet; showing it from branch ${ref}.`;
    msg(note, 'info');
  }
  setHash('explore', { repo: pin.repo, ref, path: pin.path });
}

export async function show(q) {
  if (!booted) {
    booted = true;
    $('#ex-repo').onchange = (e) => setHash('explore', { repo: e.target.value, ref: 'main' });
    $('#ex-ref').onchange = (e) => setHash('explore', { repo: st.repo, ref: e.target.value });
    $('#ex-filter').oninput = (e) => { st.filter = e.target.value; renderTree(); };
    document.querySelectorAll('[data-pin]').forEach((b) => (b.onclick = () => openPin(b.dataset.pin)));
  }
  const repo = q.get('repo') || st.repo, ref = q.get('ref') || (repo === st.repo ? st.ref : 'main');
  const path = q.get('path');
  const pinnedPath = !!path && /^[0-9a-f]{40}$/.test(ref);
  if (repo !== st.repo || ref !== st.ref || !st.sha) {
    const keep = $('#ex-msg').classList.contains('info') ? $('#ex-msg').textContent : null;
    if (pinnedPath) {
      // A pinned manuscript must not wait for the unrelated GitHub branches/tree API.
      // Render immutable raw content first, then populate the optional tree.
      st.repo = repo; st.ref = ref; st.sha = ref; st.entries = []; st.path = null;
      $('#ex-repo').value = repo;
      $('#ex-tree').replaceChildren(h('div', { class: 'tiny' }, 'loading pinned tree…'));
      await openFile(path, { repo, ref });
      if (keep) msg(keep, 'info');
      await loadRefs();
      await loadTree();
      return;
    }
    await selectRepo(repo, ref);
    if (keep) msg(keep, 'info');
  }
  if (path) await openFile(path, { repo, ref });
}
