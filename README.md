# E47-Tower

**A working research environment for the Fibonacci–Lucas tower of E47.** Browse the source, run it, compare runs, replay them, and take the receipts with you, all on one static page. Python runs in your browser through [Pyodide](https://pyodide.org). Nothing is uploaded and you don't need an account.

> Three spins of size *j* = (*F_n* − 1)/2. One Casimir selector at mean ± one standard deviation. Out fall the multiplicities *F_n* and *F_{n−2}*, the Pell relation *J*(*J*+1) = 5*j*(*j*+1), the kept dimension *D* = *F_n*² + *F_{n−2}L_n* (47 at *n* = 5), and the limit *D*/(2*j*+1)² → 3/φ.

## v0.1: four instruments

| | Feature | What it does |
|---|---|---|
| I | **Repository explorer** | Browses the public [E47-Kartekeya](https://github.com/nicholaskouns-create/E47-Kartekeya) repo and this one at a resolved commit SHA. It shows a file tree with a filter, source with syntax highlighting and line numbers, a permalink, and an “Open on GitHub” link. Pinned shortcuts go to the tower validator, the tower paper (`tower_paper.tex`, taken from `main`, or from `research/fib-lucas-tower-paper` until it merges) and `tower_census.py`. “Open in runner” turns any `.py` file into an experiment pinned to its commit. |
| II | **Experiment runner** | Runs experiments from [`experiments/registry.json`](experiments/registry.json) in a Pyodide Web Worker. Next to the output sits an editable code panel: edit, rerun, and both the original and the variant results are kept. Each run captures stdout, PASS/FAIL counts, duration, parameters, source commit, SHA-256 hashes of the code and output, and the Pyodide and Python versions. |
| III | **Comparison view** | Puts any two run records side by side. They can come from this session, from earlier sessions (localStorage), or from uploaded JSON or packet zips. It shows metadata and parameters, every structured value with B − A and the relative difference, both figures, the stdout diff, and the code diff when the code differs. |
| IV | **Replay + export** | Replay re-executes a record's *stored* code with its stored parameters, a fresh `decimal` context and seed 0. It then reports a **bit-for-bit match** on SHA-256(stdout + `\0` + canonical JSON of the result). It also re-fetches GitHub sources at their commit to show whether the code is byte-identical or a variant. **Export** downloads a research packet zip: `run.json` (the receipt), `output.csv`, the exact script, `stdout.txt`, `figure.svg`/`figure.png`, and `SOURCES.md` with commit-pinned links and a one-line reproduce command. Import accepts a run JSON or a packet zip. |

### Experiments in the registry

* **`fib-lucas-tower-validator`** is `research/e47/validation/e47_fib_lucas_tower_validate.py` from E47-Kartekeya PR #135. The page fetches it from `raw.githubusercontent.com` at the pinned main commit `7f81505` and checks its SHA-256 against the registry pin. It runs unmodified and gives 35/35 PASS, including the exact 125×125 integer Casimir: rank *K* = 78, dim ker *K* = 47, Ω_c = 47/125.
* **`tower-census`** is [`experiments/tower_census.py`](experiments/tower_census.py) at one tower index *n* (odd, 3 ∤ *n*, up to 199). It reports *j*, *J*, *n*(*j*) and *n*(*J*), counted directly from the weight census of V_j^{⊗3} by inclusion–exclusion and then checked against *F_n* and *F_{n−2}*. It also reports *D*, *D*/(2*j*+1)² as an exact fraction, and the gap to 3/φ carried to *n* + 40 digits. For *j* ≤ 2 it can build the exact integer Casimir and compute the selector rank over ℚ.
* **`tower-sweep`** runs the same script over every tower member 5 ≤ *n* ≤ *n_max*. It checks strict monotonicity of the gap and draws the limit plot.

The same script runs outside the browser and prints the same stdout byte for byte. Every packet's `SOURCES.md` gives the command:

```sh
python3 experiments/tower_census.py --params '{"mode":"sweep","n_max":61}'
python3 experiments/tower_census.py --n 5 --casimir
```

### Adding an experiment

Add an entry to `experiments/registry.json`:

* **`source`**: either `{"kind":"local","path":…}` or `{"kind":"github","repo":…,"path":…,"commit":<40-hex>,"sha256":<64-hex>}`.
* **`params`**: a list of `int`, `bool` and `const` fields. They reach the script as a `PARAMS` dict.
* **`postprocess`**: one of `validator`, `census` or `generic`.

A script may set a JSON-serialisable `RESULT`. Lines of the form `[PASS] …` / `[FAIL] …` are counted. Imports of numpy, scipy or sympy are fetched into the browser on demand.

## Run locally

```sh
git clone https://github.com/nicholaskouns-create/tower && cd tower
python -m http.server 8000
# open http://localhost:8000
python -m unittest discover -s tests -v      # census + registry + module-graph tests
```

There is no build step. The only generated file is `build.json`, which the Pages workflow writes with the deploy commit so that run records of local experiments are pinned to it. Without it, records say “working tree”.

GitHub's public REST API allows 60 requests per hour per IP. The explorer caches every answer (trees by commit, permanently) and fetches file bodies from `raw.githubusercontent.com`, which does not count against that limit. If the limit is hit, the page says so and shows the reset time, and pinned files still open.

## Layout

```
index.html               one page, four views (#/explore, #/run, #/compare, #/replay)
css/style.css            off-white, black ink, one deep red; EB Garamond + IBM Plex Mono
js/app.js                hash router
js/explorer.js           I   repository explorer          js/github.js   cached public API + raw
js/runner.js             II  experiment runner            js/engine.js   worker wrapper
js/pyworker.js               Pyodide Web Worker + run harness
js/compare.js            III comparison view              js/diff.js     line diff
js/replay.js             IV  replay, packet export/import js/plot.js     SVG figures
js/experiments.js        registry, pinned sources, run records, derived tables/figures
js/records.js            run-record store + schema (e47-tower/run@1)
js/integrations.js       v0.2 extension points (hooks + adapters), inert in v0.1
experiments/             registry.json, tower_census.py
tests/                   test_tower_census.py, test_registry.py
.github/workflows/       ci.yml (experiments, pinned validator, tests), pages.yml (deploy)
```

## v0.2 roadmap

The deployed site needs its own authenticated integrations. Connections someone has in a chat assistant don't transfer into a web page. Public browsing and local computation stay registration-free, and private reads and writes go through a signed-in session. Every item below plugs into `js/integrations.js` (`hooks.on('run:recorded' | 'packet:built', …)` and `adapters.register(name, impl)`) without changing the four views.

1. **Supabase run records.** Write each run record to the existing `research-run`, `dataset` and `certificate` tables through the `research-engine-ingest` function. Read shared runs back with `research-engine-read`, and link to `theorem-relationship` and `source-artifact` rows so a theorem can be followed into code.
2. **Notion notebook saves.** A deliberate “Save to notebook” action appends selected plots, observations and run links to an existing experiment page.
3. **Linear issue from a result.** “Turn this into work” opens an issue in *E47 — Open Questions & Next Builds* with the reproduce command, parameters and commit-pinned links.
4. **Composable “Open this result in…”** hands a result to another instrument (Protected Information → Quantum Communication → Time). Each transfer carries basis, dimensions, units, normalisation and provenance.
5. **Heavy jobs.** A Python worker or a GitHub Actions `workflow_dispatch` runs large simulations and returns the same `e47-tower/run@1` record, so Compare and Replay work unchanged.
6. **Search and notebook.** Unified search over equations, notes, code and certificates. Also a richer editor (CodeMirror) and parameter sweeps extended from Time's sweep machinery.

## Honesty

The finite statements here (multiplicities, Pell relation, kept dimension, Casimir spectrum, rank 78 / nullity 47) are exact integer or rational computations. Whether the tower's limit 3/φ, or its tetrahedral reading, corresponds to physical geometry is an open question that no run here asserts or refutes.
