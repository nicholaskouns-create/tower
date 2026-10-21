// Extension points for v0.2. Nothing here talks to a service in v0.1.
//
// The deployed site needs its own authenticated integrations; the connections a person
// has in a chat assistant do not transfer into a web page. So v0.1 ships a tiny event
// bus and named slots, and every v0.2 adapter plugs into these without touching the views.
//
//   hooks.on('run:recorded',  ({rec}) => …)   // e.g. Supabase: insert into research_runs
//   hooks.on('packet:built',  ({rec, files}) => …)
//   adapters.register('supabase', {...})       // research-run / dataset / certificate tables
//   adapters.register('notion',   {...})       // "Save to notebook" (deliberate action only)
//   adapters.register('linear',   {...})       // "Turn this result into an issue"
//   adapters.register('worker',   {...})       // Python worker / GitHub Actions for heavy jobs
const subs = new Map();
export const hooks = {
  on(evt, fn) { if (!subs.has(evt)) subs.set(evt, new Set()); subs.get(evt).add(fn); return () => subs.get(evt).delete(fn); },
  emit(evt, payload) { for (const fn of subs.get(evt) || []) { try { fn(payload); } catch (e) { console.warn(`[hook ${evt}]`, e); } } },
};

const registry = new Map();
export const adapters = {
  register(name, impl) { registry.set(name, impl); },
  get(name) { return registry.get(name) || null; },
  list() { return [...registry.keys()]; },
};

// Planned adapters, listed so the UI and docs share one source of truth.
export const ROADMAP = [
  { name: 'supabase', what: 'Persist run records to the existing research-run, dataset and certificate tables via research-engine-ingest; read them back with research-engine-read.' },
  { name: 'notion', what: 'Save selected plots, observations and run links into an existing Notion experiment notebook page.' },
  { name: 'linear', what: 'Create an issue in “E47 — Open Questions & Next Builds” with reproduction steps and commit-pinned links.' },
  { name: 'compose', what: '“Open this result in…”: hand a result (basis, dimensions, units, normalisation, provenance) to another instrument.' },
  { name: 'worker', what: 'Run heavy experiments on a Python worker or a GitHub Actions job and return the same run record.' },
];
