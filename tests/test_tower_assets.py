"""Regression check for the Tower's browser syntax-highlighter asset URL."""

from html.parser import HTMLParser
from pathlib import Path
import unittest


class _ScriptSources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.sources.extend(value for key, value in attrs if key == "src")


class TowerAssetTests(unittest.TestCase):
    def test_highlight_browser_bundle_uses_published_cdn_path(self):
        html = (Path(__file__).resolve().parents[1] / "index.html").read_text(encoding="utf-8")
        parser = _ScriptSources()
        parser.feed(html)
        self.assertIn(
            "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/highlight.min.js",
            parser.sources,
        )
        self.assertNotIn(
            "https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/lib/highlight.min.js",
            parser.sources,
        )


if __name__ == "__main__":
    unittest.main()
