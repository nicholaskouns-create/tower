"""Restricted Drive originals are blocked before browser requests, not merely logged on failure.

This test extracts the two pure routing helpers without importing Playwright.
It exercises the same functions used by the live browser smoke.
"""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "scripts" / "probe_live_explore.py").read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)
NAMES = {"canonical_restricted_original", "guard_restricted_original_route"}
FUNCS = [node for node in TREE.body if isinstance(node, ast.FunctionDef)
         and node.name in NAMES]
ORIGINALS = next(
    ast.literal_eval(node.value)
    for node in TREE.body
    if isinstance(node, ast.Assign)
    and any(isinstance(target, ast.Name) and target.id == "RESTRICTED_ORIGINALS"
            for target in node.targets)
)
ENV = {"urlsplit": urlsplit, "RESTRICTED_ORIGINALS": ORIGINALS}
exec(compile(ast.Module(body=FUNCS, type_ignores=[]), "<browser-guard>", "exec"), ENV)


class FakeRoute:
    def __init__(self, url):
        self.request = SimpleNamespace(url=url)
        self.actions = []

    def abort(self, reason):
        self.actions.append(("abort", reason))

    def continue_(self):
        self.actions.append(("continue", None))


class RestrictedOriginalBrowserGuard(unittest.TestCase):
    def test_restricted_originals_and_query_variants_are_blocked(self):
        for original in ORIGINALS:
            for url in (original, original + "?access_token=PRIVATE_VALUE",
                        original + "/?usp=sharing",
                        original.replace("https://", "http://", 1),
                        original.replace("https://", "http://", 1)
                        + "?access_token=PRIVATE_VALUE"):
                with self.subTest(url=url.split("?")[0]):
                    route = FakeRoute(url)
                    blocked = []
                    ENV["guard_restricted_original_route"](route, blocked)
                    self.assertEqual(route.actions, [("abort", "blockedbyclient")])
                    self.assertEqual(blocked, [original])
                    self.assertNotIn("PRIVATE_VALUE", str(blocked))

    def test_public_and_unrelated_docs_continue(self):
        for url in (
            "https://nicholaskouns-create.github.io/tower/#/explore",
            "https://raw.githubusercontent.com/nicholaskouns-create/E47-Kartekeya/main/README.md",
            "https://docs.google.com/document/d/unrelated/edit",
            "http://docs.google.com/document/d/unrelated/edit",
            "https://drive.google.com/file/d/unrelated/view",
        ):
            with self.subTest(url=url):
                route = FakeRoute(url)
                blocked = []
                ENV["guard_restricted_original_route"](route, blocked)
                self.assertEqual(route.actions, [("continue", None)])
                self.assertEqual(blocked, [])

    def test_live_browser_installs_guard_and_asserts_no_attempt(self):
        self.assertEqual(len(FUNCS), 2)
        self.assertIn('context.route("**/*", lambda route: guard_restricted_original_route(', SOURCE)
        self.assertIn('if result["restricted_originals_blocked"]:', SOURCE)
        self.assertNotIn('if any(x["url"] in RESTRICTED_ORIGINALS for x in result["request_failures"]):', SOURCE)


if __name__ == "__main__":
    unittest.main()
