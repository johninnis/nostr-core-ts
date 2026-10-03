# 0015. A JSON document fetch, and NIP-05 resolution on it, report "not found" apart from "no answer" through one reader

## Status

Accepted

## Context

Shared ADR-0040 decides that a NIP-05 lookup has three outcomes — mapped, not found, no answer — and which answers fall in each: a 404 is not found, a redirect (which NIP-05 fetchers "MUST ignore") and a body that is not a JSON object are no answer. What is this package's is where that classification lives. The NIP-11 fetch had its own copy of the same request-and-decode steps with a failure type of its own, so the two readers of a remote JSON document could drift apart on what a 404, a redirect or an array body means.

## Decision

- `readJsonDocument(response)` is the one reader of a JSON document: it takes what `HttpClient.request` answered and returns `Promise<Result<Readonly<Record<string, unknown>>, JsonFetchFailure>>`, resolving to the decoded JSON object; `not-found` for a 404; or `no-answer` (`NoAnswerFailure`, carrying a `message` for display) for every other way of getting no document, a refused redirect and a body that is not a JSON object included.
- `resolveNip05` returns `Promise<Result<PublicKey | null, NoAnswerFailure>>`, resolving to `ok(pubkey)` when mapped, `ok(null)` when not found, `failure` when there is no answer. The verifier passes a verdict to `onVerified` only for `ok`, and a failure to the optional `onLookupFailed`.
- `fetchRelayInformation` returns `Promise<Result<RelayInformation, JsonFetchFailure>>` and reads the fields of whatever object `readJsonDocument` returns; it has no shape check of its own.
- Each of them issues its own `GET`: its URL, the headers its NIP asks for, and the caller's `signal`, bounded by its own default deadline when the caller gives none. The request is the caller's to make; only the reading is shared, so a lookup takes no options object to pass through.

## Consequences

A new reader of a remote JSON document reads it with `readJsonDocument` rather than repeating the decode, so every such reader classifies a status and a body the same way. A caller that needs to know whether a failure was a transport fault or a status reads it from `message` for display only; no caller branches on it, so the failure does not carry it as data.

Shared decision: nostr-adrs ADR-0040.
