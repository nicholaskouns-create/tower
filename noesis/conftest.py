"""Let a plain `pytest` run from a fresh checkout.

`test_service.py` and `test_auth_bridge.py` import the sibling auth-kernel repository
(see AUTH_INTEGRATION.md). If `auth_kernel` is not importable, look for the sibling
checkout beside this repository. If it is still absent, leave those two modules out and
say so in the report header, rather than aborting the whole run at collection.
"""
import importlib.util
import sys
from pathlib import Path

_SIBLING = Path(__file__).resolve().parents[2] / "auth-kernel"
if importlib.util.find_spec("auth_kernel") is None and (_SIBLING / "auth_kernel.py").is_file():
    sys.path.insert(0, str(_SIBLING))

_HAVE = importlib.util.find_spec("auth_kernel") is not None
collect_ignore = [] if _HAVE else ["test_service.py", "test_auth_bridge.py"]


def pytest_report_header(config):
    if not _HAVE:
        return "noesis: auth-kernel not found beside this repo; test_service.py and test_auth_bridge.py not collected"
    return None
