// Public GitHub access, unauthenticated. The REST API allows 60 requests/hour per IP,
// so every API answer is cached and file bodies come from raw.githubusercontent.com,
// which does not count against that limit.
const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';
const TTL = 15 * 60 * 1000;

export class RateLimitError extends Error {
  constructor(reset) {
    const when = reset ? new Date(reset * 1000) : null;
    super(`GitHub's public API limit (60 requests per hour from your network) is used up${when ? `; it resets at ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}. Pinned files and anything already loaded still open, because file contents come from raw.githubusercontent.com.`);
    this.name = 'RateLimitError'; this.reset = reset;
  }
}

function cacheGet(key, ttl = TTL) {
  try {
    const v = JSON.parse(sessionStorage.getItem('gh:' + key) || localStorage.getItem('gh:' + key) || 'null');
    if (v && (ttl === Infinity || Date.now() - v.t < ttl)) return v.d;
  } catch {}
  return undefined;
}
function cachePut(key, d, persistent = false) {
  const s = JSON.stringify({ t: Date.now(), d });
  try { (persistent ? localStorage : sessionStorage).setItem('gh:' + key, s); } catch { /* quota: fine */ }
}

export async function api(path, { accept, ttl = TTL, persistent = false } = {}) {
  const hit = cacheGet(path, ttl);
  if (hit !== undefined) return hit;
  let res;
  try {
    res = await fetch(API + path, { headers: { Accept: accept || 'application/vnd.github+json' } });
  } catch (e) {
    throw new Error(`Could not reach api.github.com (${e.message}).`);
  }
  if ((res.status === 403 || res.status === 429) && (res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429)) {
    throw new RateLimitError(Number(res.headers.get('x-ratelimit-reset')) || null);
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
  const d = accept === 'application/vnd.github.sha' ? (await res.text()).trim() : await res.json();
  cachePut(path, d, persistent);
  return d;
}

export async function branches(repo) {
  const list = await api(`/repos/${repo}/branches?per_page=100`);
  return list.map((b) => ({ name: b.name, sha: b.commit.sha }));
}

export async function resolveRef(repo, ref) {
  if (/^[0-9a-f]{40}$/.test(ref)) return ref;
  return api(`/repos/${repo}/commits/${encodeURIComponent(ref).replace(/%2F/g, '/')}`, { accept: 'application/vnd.github.sha', ttl: 5 * 60 * 1000 });
}

// Trees are content-addressed by commit, so they can be cached for good.
export async function tree(repo, sha) {
  const key = `/repos/${repo}/git/trees/${sha}?recursive=1`;
  const hit = cacheGet(key, Infinity);
  if (hit !== undefined) return hit;
  const t = await api(key, { ttl: 0 });
  const slim = { truncated: !!t.truncated, entries: t.tree.map((e) => [e.path, e.type === 'tree' ? 'd' : 'f', e.size || 0]) };
  cachePut(key, slim, true);
  return slim;
}

export const rawUrl = (repo, ref, path) => `${RAW}/${repo}/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`;
export const blobUrl = (repo, ref, path) => `https://github.com/${repo}/blob/${ref}/${path}`;
export const commitUrl = (repo, sha) => `https://github.com/${repo}/commit/${sha}`;

const rawCache = new Map();
export async function rawText(repo, ref, path) {
  const url = rawUrl(repo, ref, path);
  if (rawCache.has(url)) return rawCache.get(url);
  let res;
  try { res = await fetch(url); } catch (e) { throw new Error(`Could not reach raw.githubusercontent.com (${e.message}).`); }
  if (res.status === 404) { const e = new Error(`Not found: ${repo}@${ref}:${path}`); e.status = 404; throw e; }
  if (!res.ok) throw new Error(`raw.githubusercontent.com ${res.status} for ${path}`);
  const text = await res.text();
  if (/^[0-9a-f]{40}$/.test(ref)) rawCache.set(url, text);
  return text;
}

export async function rawExists(repo, ref, path) {
  try { await rawText(repo, ref, path); return true; } catch (e) { if (e.status === 404) return false; throw e; }
}
