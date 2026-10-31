"""Regression: public missing build.json must not be labelled a local preview."""
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class DeploymentLabelTests(unittest.TestCase):
    def test_public_local_and_pinned_commit(self):
        script = r"""
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const source = readFileSync('js/deployment.js', 'utf8');
const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const { deploymentLabel } = await import(url);
const pin = '218713029c50aeffdf907fd26b14f3085fa43a14';
assert.equal(deploymentLabel({commit: pin}, 'nicholaskouns-create.github.io'), 'deployed from tower@2187130');
assert.equal(deploymentLabel({commit: null}, 'localhost'), 'local preview (no deploy commit)');
assert.equal(deploymentLabel({commit: null}, '127.0.0.1'), 'local preview (no deploy commit)');
assert.equal(deploymentLabel({commit: null}, 'nicholaskouns-create.github.io'), 'deployment commit unverified (build.json missing or invalid)');
assert.equal(deploymentLabel({commit: 'main'}, 'nicholaskouns-create.github.io'), 'deployment commit unverified (build.json missing or invalid)');
assert.equal(deploymentLabel(null, 'nicholaskouns-create.github.io'), 'deployment commit unverified (build.json missing or invalid)');
"""
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_app_uses_hostname_aware_label(self):
        app = (ROOT / 'js/app.js').read_text(encoding='utf-8')
        self.assertIn("import { deploymentLabel } from './deployment.js';", app)
        self.assertIn("deploymentLabel(X.buildInfo(), location.hostname)", app)
        self.assertNotIn("'local preview (no deploy commit)'", app)


if __name__ == '__main__':
    unittest.main()
