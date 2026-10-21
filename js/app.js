// E47-Tower v0.1 — hash router tying the four views together.
import { $, $$, parseHash } from './util.js';
import * as X from './experiments.js';
import * as explorer from './explorer.js';
import * as runner from './runner.js';
import * as compare from './compare.js';
import * as replay from './replay.js';
import { hooks, adapters } from './integrations.js';

const VIEWS = { explore: explorer, run: runner, compare, replay };
window.E47Tower = { hooks, adapters };   // v0.2 adapters attach here

async function route() {
  const { view, q } = parseHash();
  const name = VIEWS[view] ? view : 'explore';
  $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + name));
  $$('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.view === name));
  try { await VIEWS[name].show(q); } catch (e) { console.error(e); }
}

(async function main() {
  await X.loadRegistry();
  const b = X.buildInfo();
  $('#build-info').textContent = b && b.commit ? `deployed from tower@${b.commit.slice(0, 7)}` : 'local preview (no deploy commit)';
  window.addEventListener('hashchange', route);
  if (!location.hash) history.replaceState(null, '', '#/explore');
  route();
})();
