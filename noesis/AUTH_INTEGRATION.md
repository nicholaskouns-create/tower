# NOESIS / Authorization integration

NOESIS computation and evidence publication remain independent of invocation authority.

The optional Python adapter `auth_bridge.py` imports the existing `auth_kernel` module from the sibling repository at runtime. It requires an issued, signed `Record` with tool `noesis.consume_receipt` and exactly one argument `receipt_sha256`, computed from the canonical JSON receipt. A caller must supply an already configured shared `Ledger`, an authenticated requester identity, and a trusted receipt path. The adapter does **not** create grants, bindings, issuer keys, or authorization state.

`dispatch()` rejects failed receipts, mismatched hashes, altered target arguments, and wrong tools before invoking `auth_kernel.allow()`. The existing kernel checks issue provenance, active subject, principal binding, tool grant, time window, signature, and nonce freshness. A successful allow consumes the nonce.

Example installation: place both repositories side-by-side and set `PYTHONPATH=../auth-kernel` when running a Python service from `tower`.

**Deployment boundary:** GitHub Pages is static. The browser must not hold issuer secrets or make authorization decisions for privileged operations. Run the bridge in a trusted Python service with shared persistent authorization state. This adapter does not make external side effects atomic with nonce consumption. Dispatchers must provide idempotency or transactional outbox handling for exactly-once effects.

No authorization or signing capability is inferred from a matching E47 computation, valid receipt hash, or published GitHub workflow.
