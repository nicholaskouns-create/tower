"""Behavioral regression: Tower pin network failures are not 404 evidence.

Run by the existing Tower CI unittest discovery. Uses Node 20 to execute the
actual openPin function extracted from js/explorer.js with deterministic
GitHub probe responses. No network, secrets, or application rewrite.
"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

NODE = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('js/explorer.js', 'utf8');
const start = source.indexOf('export async function openPin(key) {');
const end = source.indexOf('\nexport async function show(', start);
assert.ok(start >= 0 && end > start, 'openPin source must be present');
const body = source.slice(start, end).replace(/^export /, '');
const make = new Function('gh', 'PINS', 'msg', 'setHash', 'renderCode', 'st', '$', 'fetch', 'return (' + body + ');');
async function check(probes) {
  const messages = [], routes = [];
  const gh = { rawExists: async () => {
    const result = probes.shift();
    if (result === 'ERR') throw new Error('offline: raw host unreachable');
    return result;
  }};
  const pins = { paper: { repo: 'test/repo', path: 'paper.tex', refs: ['r1', 'r2'] } };
  const openPin = make(gh, pins, (message, kind) => messages.push({message, kind}),
    (...args) => routes.push(args), () => {}, {}, () => {}, () => {});
  await openPin('paper');
  return { messages, routes };
}
(async () => {
  let result = await check(['ERR', 'ERR']);
  assert.match(result.messages.at(-1).message, /Could not verify paper\.tex: offline/);
  assert.doesNotMatch(result.messages.at(-1).message, /was not found/);
  assert.equal(result.routes.length, 0);

  result = await check([false, false]);
  assert.match(result.messages.at(-1).message, /paper\.tex was not found on r1 or r2/);
  assert.equal(result.routes.length, 0);

  result = await check(['ERR', true]);
  assert.match(result.messages.at(-1).message, /earlier source check was unavailable/);
  assert.doesNotMatch(result.messages.at(-1).message, /is not on r1 yet/);
  assert.equal(result.routes.length, 1);

  result = await check([false, true]);
  assert.match(result.messages.at(-1).message, /is not on r1 yet/);
  assert.equal(result.routes.length, 1);

  result = await check([true]);
  assert.equal(result.routes.length, 1);
  console.log('PIN_PROBE_CLASSIFICATION_PASS 5/5');
})().catch(error => { console.error(error); process.exitCode = 1; });
"""


class PinProbeClassification(unittest.TestCase):
    def test_network_failure_and_missing_source_are_distinct(self):
        result = subprocess.run(
            ["node", "-e", NODE], cwd=ROOT, capture_output=True,
            text=True, timeout=15, check=False
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("PIN_PROBE_CLASSIFICATION_PASS 5/5", result.stdout)


if __name__ == "__main__":
    unittest.main()
