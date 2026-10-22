"""Optional NOESIS -> auth-kernel protected dispatch. No implicit grants."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from typing import Callable, Any

def receipt_digest(receipt: dict) -> str:
    """Hash canonical receipt bytes, including status and result."""
    return hashlib.sha256(json.dumps(receipt,sort_keys=True,separators=(",",":"),ensure_ascii=True).encode()).hexdigest()

def dispatch(receipt_path: str | Path, record, ledger, requester: str,
             operation: Callable[[dict], Any], *, expected_digest: str):
    """Authorize the exact receipt, then execute the caller-provided operation.

    Kernel state must be shared and durable in a real service. Caller is
    responsible for external transaction idempotency and trusted receipt storage.
    """
    from auth_kernel import allow
    path=Path(receipt_path)
    receipt=json.loads(path.read_text(encoding="utf-8"))
    digest=receipt_digest(receipt)
    if receipt.get("status") != "PASS":
        return {"allowed":False,"reason":"ReceiptNotPassed"}
    if digest != expected_digest:
        return {"allowed":False,"reason":"ReceiptDigestMismatch"}
    if record.tool != "noesis.consume_receipt":
        return {"allowed":False,"reason":"WrongTool"}
    if record.args != {"receipt_sha256":digest}:
        return {"allowed":False,"reason":"TargetMismatch"}
    permitted,_,reason=allow(record,ledger,requester)
    if not permitted:
        return {"allowed":False,"reason":reason}
    return {"allowed":True,"result":operation(receipt)}
