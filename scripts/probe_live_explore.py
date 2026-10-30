#!/usr/bin/env python3
"""Anonymous browser smoke of the deployed Tower #/explore and immutable paper pin.

Evidence is browser-observed, not proof of mathematical or compiler correctness.
Never fetch restricted Drive originals or reinterpret the historical 177/4 census.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys

from playwright.sync_api import sync_playwright

TOWER_URL = "https://nicholaskouns-create.github.io/tower/#/explore"
HIGHLIGHT_URL = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/highlight.min.js"
BUILD_URL = "https://nicholaskouns-create.github.io/tower/build.json"
PAPER_COMMIT = "c14e98bd6d701723c887a5ba3a34b8caf902ab55"
PAPER_PATH = "research/e47/papers/fib_lucas_tower/tower_paper.tex"
PAPER_URL = (
    "https://raw.githubusercontent.com/nicholaskouns-create/E47-Kartekeya/"
    + PAPER_COMMIT + "/" + PAPER_PATH
)
RESTRICTED_ORIGINALS = (
    "https://docs.google.com/document/d/1wCmn5J4Tjo0qVV5AOoHUxD1tXComhPf7lU1ntzKtaMs/edit",
    "https://drive.google.com/file/d/1-bCyEuWcN1rtRb1IJF02O8tTe7RbmaEC/view",
)


def audit(url: str, screenshot: Path) -> dict:
    if not (url.startswith("https://nicholaskouns-create.github.io/tower/")
            or url.startswith("http://127.0.0.1:8765/")):
        raise ValueError("Browser probe is restricted to public Tower Pages or loopback fixture")
    result = {
        "audit_type": "anonymous_live_browser_tower_explore",
        "observed_utc": datetime.now(timezone.utc).isoformat(),
        "checkout_commit": os.getenv("GITHUB_SHA", "local"),
        "entry_url": url,
        "entry_status": None,
        "highlight_url": HIGHLIGHT_URL,
        "highlight_statuses": [],
        "build_url": BUILD_URL,
        "build_statuses": [],
        "paper_url": PAPER_URL,
        "paper_statuses": [],
        "paper_permalink": None,
        "paper_rendered": False,
        "final_hash": None,
        "explorer_message": None,
        "code_excerpt": None,
        "syntax_highlighter_ready": False,
        "deployed_build_label": None,
        "page_errors": [],
        "request_failures": [],
        "restricted_originals_not_requested": list(RESTRICTED_ORIGINALS),
        "historical_census": {
            "links_followed": 177, "failures": 4,
            "scope": "historical baseline, not re-crawled by this browser probe",
        },
        "scope": "live browser JS, highlighter and immutable manuscript; not all exits",
        "outcome": "unverified",
    }
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            channel="chrome", headless=True, args=["--no-sandbox"]
        )
        context = browser.new_context()
        page = context.new_page()
        page.on("pageerror", lambda error: result["page_errors"].append(str(error)))
        page.on("requestfailed", lambda request: result["request_failures"].append(
            {"url": request.url, "failure": request.failure}
        ))
        def on_response(response):
            if response.url.startswith(HIGHLIGHT_URL):
                result["highlight_statuses"].append(response.status)
            if response.url.startswith(BUILD_URL):
                result["build_statuses"].append(response.status)
            if response.url.startswith(PAPER_URL):
                result["paper_statuses"].append(response.status)
        page.on("response", on_response)
        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=60000)
            result["entry_status"] = response.status if response else None
            if result["entry_status"] != 200:
                raise AssertionError("Tower entry did not return HTTP 200")
            page.locator("#view-explore").wait_for(state="visible", timeout=45000)
            page.wait_for_function(
                "() => typeof window.hljs?.highlight === 'function'", timeout=45000
            )
            result["syntax_highlighter_ready"] = True
            # The pin's click handler is installed before the optional GitHub tree fetch.
            # Waiting for tree completion here would reproduce the defect in the test.
            page.wait_for_function(
                """() => typeof document.querySelector('button[data-pin="paper"]')?.onclick === 'function'""",
                timeout=60000,
            )
            page.locator('button[data-pin="paper"]').click()
            page.wait_for_function(
                """() => location.hash.includes('tower_paper.tex') &&
                  document.querySelector('#ex-code code')?.textContent
                    ?.includes('\\\\documentclass')""",
                timeout=90000,
            )
            result["paper_rendered"] = True
            result["paper_permalink"] = page.locator("#ex-gh").get_attribute("href")
            result["deployed_build_label"] = page.locator("#build-info").inner_text()
            if PAPER_COMMIT not in (result["paper_permalink"] or ""):
                raise AssertionError("Rendered manuscript link is not pinned to the verified commit")
            if 200 not in result["highlight_statuses"]:
                raise AssertionError("Browser did not observe HTTP 200 for the replacement highlighter")
            if 200 not in result["paper_statuses"]:
                raise AssertionError("Browser did not observe HTTP 200 for the immutable paper")
            if any(x["url"] in RESTRICTED_ORIGINALS for x in result["request_failures"]):
                raise AssertionError("A restricted original was unexpectedly requested")
            result["outcome"] = "browser_pass"
        except Exception as error:
            result["outcome"] = "browser_failure"
            result["error_type"] = type(error).__name__
            result["error"] = str(error)[:1200]
        finally:
            result["final_hash"] = page.evaluate("location.hash")
            result["explorer_message"] = page.locator("#ex-msg").inner_text()
            result["code_excerpt"] = page.locator("#ex-code code").inner_text()[:240]
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(screenshot), full_page=True, timeout=20000)
            context.close()
            browser.close()
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=TOWER_URL)
    parser.add_argument("--output", default="tower-explore-browser-evidence.json")
    parser.add_argument("--screenshot", default="tower-explore-browser.png")
    args = parser.parse_args()
    output, screenshot = Path(args.output), Path(args.screenshot)
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        result = audit(args.url, screenshot)
    except Exception as error:
        result = {
            "audit_type": "anonymous_live_browser_tower_explore",
            "observed_utc": datetime.now(timezone.utc).isoformat(),
            "entry_url": args.url,
            "outcome": "probe_infrastructure_error",
            "error_type": type(error).__name__,
            "error": str(error)[:1200],
            "historical_census": {"links_followed": 177, "failures": 4},
        }
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result["outcome"] == "browser_pass" else 1


if __name__ == "__main__":
    sys.exit(main())
