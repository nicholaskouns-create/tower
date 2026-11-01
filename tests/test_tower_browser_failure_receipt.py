"""Regression: a failed Tower navigation must retain its original receipt."""
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from browser_readback import capture_readback


class MissingNodePage:
    def evaluate(self, expression):
        return "#/explore"

    def locator(self, selector):
        return self

    def inner_text(self, timeout):
        raise TimeoutError("missing browser node")

    def screenshot(self, **kwargs):
        raise OSError("screenshot unavailable")


class CompletePage:
    def evaluate(self, expression):
        return "#/explore"

    def locator(self, selector):
        return self

    def inner_text(self, timeout):
        return "ok " + "x" * 250

    def screenshot(self, **kwargs):
        Path(kwargs["path"]).write_bytes(b"PNG")


class BrowserFailureReceiptTests(unittest.TestCase):
    def test_missing_nodes_and_screenshot_do_not_mask_navigation_failure(self):
        with TemporaryDirectory() as directory:
            result = {
                "outcome": "browser_failure",
                "error_type": "TimeoutError",
                "error": "original navigation timeout",
            }
            capture_readback(MissingNodePage(), Path(directory) / "shot.png", result)
            self.assertEqual(result["outcome"], "browser_failure")
            self.assertEqual(result["error"], "original navigation timeout")
            self.assertEqual(result["final_hash"], "#/explore")
            self.assertIsNone(result["explorer_message"])
            self.assertIsNone(result["code_excerpt"])
            self.assertEqual(
                result["readback_errors"],
                [
                    {"field": "explorer_message", "error_type": "TimeoutError"},
                    {"field": "code_excerpt", "error_type": "TimeoutError"},
                    {"field": "screenshot", "error_type": "OSError"},
                ],
            )
            self.assertNotIn("missing browser node", str(result))

    def test_successful_readback_keeps_existing_fields(self):
        with TemporaryDirectory() as directory:
            result = {"outcome": "browser_pass"}
            screenshot = Path(directory) / "shot.png"
            capture_readback(CompletePage(), screenshot, result)
            self.assertEqual(result["outcome"], "browser_pass")
            self.assertEqual(result["final_hash"], "#/explore")
            self.assertEqual(result["explorer_message"], "ok " + "x" * 250)
            self.assertEqual(result["code_excerpt"], ("ok " + "x" * 250)[:240])
            self.assertNotIn("readback_errors", result)
            self.assertTrue(screenshot.exists())


if __name__ == "__main__":
    unittest.main()
