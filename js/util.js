// Small shared helpers. No framework: plain ES modules.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Deterministic JSON (sorted keys) so hashes of structured results are stable.
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

export const short = (sha, n = 7) => (sha ? String(sha).slice(0, n) : '—');

export function fmtMs(ms) {
  if (ms == null) return '—';
  return ms < 1000 ? `${ms.toFixed(0)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function fmtTime(iso) {
  try {
    const d = new Date(iso);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ` (${tz})`;
  } catch { return iso; }
}

export function download(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function uid() {
  const t = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const r = [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `run-${t}-${r}`;
}

// Parse "47/25", "1e-5", 3 -> number (or null).
export function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean' || v == null) return null;
  const s = String(v).trim();
  const fr = /^(-?\d+)\/(\d+)$/.exec(s);
  if (fr) return Number(fr[1]) / Number(fr[2]);
  if (/^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s);
  return null;
}

export function csvCell(v) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCSV(columns, rows) {
  return [columns.map(csvCell).join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
}

export function readFileText(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
}

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [view, q = ''] = raw.split('?');
  return { view: view || 'explore', q: new URLSearchParams(q) };
}

export function setHash(view, params = {}, replace = false) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  const url = `#/${view}${q ? '?' + q : ''}`;
  if (replace) history.replaceState(null, '', url); else location.hash = url;
}
