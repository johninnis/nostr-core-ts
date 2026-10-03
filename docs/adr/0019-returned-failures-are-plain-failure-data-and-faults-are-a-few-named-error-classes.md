# 0019. Returned failures are plain `*Failure` data, and faults are a few named `*Error` classes under one root

## Status

Accepted

## Context

Shared ADR-0001 decides the model: an anticipated outcome is returned, never thrown; a parser of untrusted input never throws; a fault is thrown. This is the same force that decided the PHP nostr-core (its ADR-0089), where PHPStan plays the part `tsc` plays here. `tsc` does not record what a function throws, so a thrown "no" is invisible at the call site, while a failure in the return type cannot be reached past. What this record decides is how that model is expressed in TypeScript. Where a catch may convert a fault into a returned failure is a separate decision (ADR-0034).

Returned failures used to be `Error` subclasses named `*Error`, the same shape as thrown faults. That made a returned "no" look throwable, gave every anticipated outcome a stack trace nobody reads, and let callers discriminate with `instanceof` across package copies, which breaks when two copies of the library are loaded. Thrown faults, meanwhile, were plain `Error`s at most sites, so a host could not tell a broken invariant here from anything else that throws. Once they were named classes, each still extended `Error` directly, so a host wanting "any fault from this library" had to list every class, and a class added later escaped the list. innis/nostr-core roots its faults at one abstract `NostrException` for that reason.

## Decision

- **Shapes of a returned failure.** One mode → `T | null`, where `null` is the answer "no". Several modes carrying no data → `Result<T, XFailure>` with `XFailure` a union of string literals. Several modes where some carry data → a discriminated union of readonly object types keyed by `type`, each carrying only the data a caller uses.
- **A returned failure is plain data named `*Failure`.** No class, no `Error` inheritance, no stack. Callers discriminate on the literal or on `type`, never with `instanceof`. Returned failures live in a `failure/` folder of their layer; thrown faults in `exception/`.
- **Faults are a small set of named `Error` subclasses**, never a bare `Error`: `InvariantError` for a value the library produced that breaks its own contract (a digest, key or signature of the wrong length, a brand that does not hold); `InvalidArgumentError` for an argument outside a function's documented contract (metadata a builder cannot write, a NIP-98 expiry that is not a whole number of seconds, a fixture that is not the value it names); `Nip04CryptoError` and `Nip44CryptoError` for a codec's refusal (ADR-0008). The vendored NIP-44 file keeps upstream's plain `Error`s (ADR-0016), which its codec converts.
- **Every fault class extends the abstract `NostrError`**, the TypeScript counterpart of innis/nostr-core's `NostrException`. It is never thrown itself, and a new fault class extends it. `InvalidArgumentError` extends it too: TypeScript has no native argument-validation error to stand where PHP's `InvalidArgumentException` stands, so this library's own argument fault is one of its faults.

## Consequences

- Every anticipated failure appears in a signature, so a caller that ignores it does not compile, and a reader sees every way an operation can say "no" without reading its body.
- A failure crossing a worker, a message channel or a log is ordinary data and serialises without loss.
- A host tells a fault from this library by `instanceof NostrError`, and a particular one by its class; a bug in a tool or a caller's misuse surfaces as what it is — the `TypeError` of a bug, the `InvalidArgumentError` of a malformed key — never disguised as a refusal.
- Adding a mode to a failure family is a breaking change, deliberately.
- Do not turn a returned failure back into a throw, give one a class, or return a failure where the operation is broken rather than refused. Do not throw a bare `Error`, `NostrError` itself, or a fault class that does not extend `NostrError`.
- Shared decisions: nostr-adrs ADR-0001 and ADR-0041.
