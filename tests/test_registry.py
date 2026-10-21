"""Static checks on the experiment registry and the site's module graph.

Set E47_NETWORK=1 to also fetch every GitHub-pinned experiment at its commit and
check its SHA-256 against the registry pin (CI does this).
"""
import hashlib
import json
import os
import re
import unittest
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REG = json.loads((ROOT / "experiments/registry.json").read_text())


class Registry(unittest.TestCase):
    def test_schema(self):
        self.assertEqual(REG["schema"], "e47-tower/registry@1")
        self.assertRegex(REG["pyodide"], r"^\d+\.\d+\.\d+$")
        ids = [e["id"] for e in REG["experiments"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertIn("fib-lucas-tower-validator", ids)
        self.assertIn("tower-census", ids)
        self.assertIn("tower-sweep", ids)

    def test_entries(self):
        for e in REG["experiments"]:
            with self.subTest(e["id"]):
                for k in ("id", "title", "summary", "source", "params", "postprocess"):
                    self.assertIn(k, e)
                self.assertIn(e["postprocess"], ("validator", "census", "generic"))
                s = e["source"]
                if s["kind"] == "local":
                    self.assertTrue((ROOT / s["path"]).is_file(), s["path"])
                else:
                    self.assertEqual(s["kind"], "github")
                    self.assertRegex(s["commit"], r"^[0-9a-f]{40}$")
                    self.assertRegex(s["sha256"], r"^[0-9a-f]{64}$")
                for p in e["params"]:
                    self.assertIn(p["type"], ("int", "bool", "const"))
                    if p["type"] == "int":
                        self.assertLessEqual(p["min"], p["default"])
                        self.assertLessEqual(p["default"], p["max"])

    @unittest.skipUnless(os.environ.get("E47_NETWORK") == "1", "network check disabled")
    def test_github_pins(self):
        for e in REG["experiments"]:
            s = e["source"]
            if s["kind"] != "github":
                continue
            url = f"https://raw.githubusercontent.com/{s['repo']}/{s['commit']}/{s['path']}"
            body = urllib.request.urlopen(url, timeout=30).read()
            self.assertEqual(hashlib.sha256(body).hexdigest(), s["sha256"], url)


class Site(unittest.TestCase):
    def test_modules_resolve(self):
        html = (ROOT / "index.html").read_text()
        entry = re.findall(r'<script type="module" src="([^"]+)"', html)
        self.assertEqual(entry, ["js/app.js"])
        seen, todo = set(), ["js/app.js"]
        while todo:
            f = todo.pop()
            if f in seen:
                continue
            seen.add(f)
            src = (ROOT / f).read_text()
            for imp in re.findall(r"from '\./([^']+)'", src):
                todo.append("js/" + imp)
            for w in re.findall(r"new URL\('\./([^']+)'", src):
                todo.append("js/" + w)
        for f in seen:
            self.assertTrue((ROOT / f).is_file(), f)
        self.assertIn("js/pyworker.js", seen)

    def test_css_and_ids(self):
        html = (ROOT / "index.html").read_text()
        self.assertTrue((ROOT / "css/style.css").is_file())
        for view in ("explore", "run", "compare", "replay"):
            self.assertIn(f'id="view-{view}"', html)


if __name__ == "__main__":
    unittest.main()
