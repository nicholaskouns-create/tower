"""Regression for two independent GitHub Pages publishers.

The branch/Jekyll publisher must serve a truthful unverified fallback.
The Actions artifact publisher must overwrite it with the real commit.
Neither path may invent a deployment SHA.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
FALLBACK = ROOT / "build.json"
WORKFLOW = ROOT / ".github/workflows/pages.yml"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class BuildManifestTests(unittest.TestCase):
    def test_branch_fallback_is_present_and_unverified(self):
        manifest = json.loads(FALLBACK.read_text(encoding="utf-8"))
        self.assertEqual(manifest, {
            "commit": None,
            "ref": None,
            "built_at": None,
            "publisher": "branch-pages-unverified",
        })
        self.assertNotIn("build.json", (ROOT / ".gitignore").read_text().splitlines())

    def test_branch_fallback_is_http_served(self):
        handler = partial(QuietHandler, directory=str(ROOT))
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with urlopen(
                f"http://127.0.0.1:{server.server_port}/build.json", timeout=5
            ) as response:
                self.assertEqual(response.status, 200)
                manifest = json.load(response)
                self.assertIsNone(manifest["commit"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

    def test_actions_publisher_overwrites_with_actual_commit(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        lines = re.findall(r"^\s*printf .* > build\.json$", workflow, re.MULTILINE)
        self.assertEqual(len(lines), 1, "expected one build manifest stamp")
        self.assertIn("build.json", workflow)
        self.assertIn("actions/deploy-pages@v4", workflow)
        sha = "0123456789abcdef" * 2 + "01234567"
        self.assertEqual(len(sha), 40)
        with TemporaryDirectory() as directory:
            env = dict(os.environ, GITHUB_SHA=sha, GITHUB_REF_NAME="main")
            result = subprocess.run(
                ["bash", "-e", "-c", lines[0].strip()],
                cwd=directory, env=env, text=True, capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            stamped = json.loads(
                (Path(directory) / "build.json").read_text(encoding="utf-8")
            )
        self.assertEqual(stamped["commit"], sha)
        self.assertEqual(stamped["ref"], "main")
        self.assertEqual(stamped["publisher"], "actions-deploy-pages")
        self.assertRegex(stamped["built_at"], r"^\d{4}-\d{2}-\d{2}T")


if __name__ == "__main__":
    unittest.main()
