# 0034. A catch converts only a library's own refusal, at the edge where the refused input enters

## Status

Accepted

## Context

ADR-0019 decides that an anticipated outcome is a returned `*Failure` and a fault a thrown `NostrError`. Some of the functions this package wraps — a vendored codec, a noble primitive, `fetch`, `JSON.parse` — report input they refuse only by throwing, and the same throw statement can also carry a bug. A catch that converts every throw into a returned failure would turn a broken invariant into an ordinary "no" that a caller handles and forgets. The PHP nostr-core decided the same question in its ADR-0089, catching only the primitive's own exception where peer ciphertext enters. This was first recorded inside ADR-0019 beside the shape of a failure; the two are revised for different reasons, so it has its own record.

## Decision

A catch converts only a library's own refusal, at the edge where the refused input enters, and lets everything else propagate. Each catch here is that narrow:

- `createLocalSigner` catches only `Nip04CryptoError` and `Nip44CryptoError`;
- a codec converts only the plain `Error` its vendored code or noble primitive throws for input it refuses (ADR-0008);
- `createHttpClient` converts only what `fetch` rejects with for a transport failure or an abort — a `TypeError`, a `DOMException`, or the reason the request's own signal was aborted with — and a body stream's error, which is the stream's report of the same transport;
- `parseJson` converts `JSON.parse`'s one throw, and `decodeUtf8` a fatal `TextDecoder`'s (ADR-0004).

The NIP-05 verifier's detached queue hands a fault to its injected sink rather than converting it (ADR-0018).

## Consequences

- A bug inside a wrapped call surfaces as the fault it is, never disguised as a refusal.
- Do not widen a catch to every throw, and do not add a catch that converts a fault the caller could not have caused by its input.
- Shared decision: nostr-adrs ADR-0001.
