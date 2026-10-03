# 0018. The NIP-05 verifier is fire-and-forget with an injected fault sink

## Status

Accepted

## Context

`createNip05Verifier().verify` queues lookups and returns immediately, serialising per domain. A fault inside a queued lookup has no caller to propagate to. The verifier used to default its sink to a helper that re-throws in a microtask: a side effect on the host process, which the application layer that holds the verifier cannot reach without depending on the layer that owns such effects, and which the package then also exported for hosts to pass back in.

## Decision

`createNip05Verifier(httpClient, listener, signal?)` takes the `HttpClient` it resolves through, a `Nip05VerifierListener` — `onVerified(pubkey, verified)`, the optional `onLookupFailed(pubkey, failure)` and `onError(error)`, everything the verifier reports — and the signal that ends its work. Each lookup is bounded by the resolver's default deadline. The verifier stamps no time on a verdict: a host that keeps one reads its own clock. Queue processing runs detached; its faults go to the listener's `onError` sink, which the host must supply. The package ships no sink of its own: what a background fault should do — re-throw it in a microtask so the host's unhandled-rejection handler sees it, log it, report it to telemetry — is a decision about the host runtime, and a helper for it is application policy rather than protocol behaviour (ADR-0001). This is the only `.catch` in the application layer. It passes the sink by reference, `promise.catch(listener.onError)`, which is the form `innis/no-catch-in-layer` permits for a detached promise; an inline handler there would be flagged. `whenIdle()` resolves when every queued lookup has finished or been dropped, and an aborted `signal` drops queued and in-flight entries without a verdict. A fault, whether thrown by a lookup or by the host's own `onVerified`, ends its domain's queue: the fault goes to `onError`, the entries still waiting on that domain are dropped without a verdict, and the domain's state is cleared in a `finally`, so a later `verify` for that domain, or for any pubkey that was dropped, starts a fresh lookup.

## Consequences

Tests and shutdown paths drain with `whenIdle()` instead of polling. A host bug in `onVerified` costs the pubkeys queued behind it their verdict for this round, never the domain for the life of the verifier; do not move the clean-up out of the `finally`, or a fault leaves the domain marked busy while `whenIdle()` reports the verifier idle. Expected lookup failures are not faults: they go to `onLookupFailed` (ADR-0015). Every host names where a background fault goes; there is no silent default to reinstate, and the application layer keeps no reference to the host runtime.

Shared decision: nostr-adrs ADR-0040.
