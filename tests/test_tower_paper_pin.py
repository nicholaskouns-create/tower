"""Regression for the Tower paper pin: immutable provenance, no known 404 probe.

The 29 October Monorail census observed 404 at the paper path on main.
The original manuscript is present at the same path in E47-Kartekeya
commit c14e98b (Git blob 67d0bd6). No manuscript is copied or rewritten.
"""
import hashlib
import os
import unittest
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = "nicholaskouns-create/E47-Kartekeya"
COMMIT = "c14e98bd6d701723c887a5ba3a34b8caf902ab55"
PATH = "research/e47/papers/fib_lucas_tower/tower_paper.tex"
BLOB_SHA1 = "67d0bd6f7d271ed65a653532ee7fa680101a49dd"


class TowerPaperPin(unittest.TestCase):
    def test_paper_pin_uses_verified_immutable_ref(self):
        source = (ROOT / "js/explorer.js").read_text(encoding="utf-8")
        line = next(x for x in source.splitlines() if x.strip().startswith("paper: {"))
        self.assertIn(f"repo: '{REPO}'", line)
        self.assertIn(f"path: '{PATH}'", line)
        self.assertIn(f"refs: ['{COMMIT}']", line)
        self.assertNotIn("'main'", line)
        self.assertNotIn("'research/fib-lucas-tower-paper'", line)

    @unittest.skipUnless(os.environ.get("E47_NETWORK") == "1", "network check disabled")
    def test_pinned_original_matches_github_blob(self):
        url = f"https://raw.githubusercontent.com/{REPO}/{COMMIT}/{PATH}"
        with urllib.request.urlopen(url, timeout=25) as response:
            self.assertEqual(response.status, 200)
            body = response.read()
        git_blob = b"blob " + str(len(body)).encode("ascii") + b"\0" + body
        self.assertEqual(hashlib.sha1(git_blob).hexdigest(), BLOB_SHA1)
        self.assertIn(b"\\documentclass", body)


if __name__ == "__main__":
    unittest.main()
