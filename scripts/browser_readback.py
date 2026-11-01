"""Preserve Tower browser-failure receipts when the page is partially rendered.

The browser smoke must retain the original navigation error even when DOM
selectors or screenshot capture fail during cleanup. No private URL or page
content is copied into a cleanup-error receipt.
"""
from __future__ import annotations

from pathlib import Path


def capture_readback(page, screenshot: Path, result: dict) -> None:
    """Best-effort DOM/screenshot readback without changing outcome or error."""
    def optional(field: str, operation):
        try:
            return operation()
        except Exception as error:
            result.setdefault("readback_errors", []).append(
                {"field": field, "error_type": type(error).__name__}
            )
            return None

    result["final_hash"] = optional(
        "final_hash", lambda: page.evaluate("location.hash")
    )
    result["explorer_message"] = optional(
        "explorer_message",
        lambda: page.locator("#ex-msg").inner_text(timeout=1500),
    )
    code = optional(
        "code_excerpt",
        lambda: page.locator("#ex-code code").inner_text(timeout=1500),
    )
    result["code_excerpt"] = code[:240] if code is not None else None

    def screenshot_capture():
        screenshot.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot), full_page=True, timeout=20000)

    optional("screenshot", screenshot_capture)
