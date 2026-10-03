# 0002. Every `Signer` method returns a `Result`

## Status

Accepted

## Context

The `Signer` port covers a local key, a NIP-07 browser extension and a NIP-46 remote bunker. `getPublicKey` and `signEvent` used to throw (`SigningError`, `SignerRejectedError`, `PubkeyMismatchError`) while the four cipher methods returned `Result<string, SignerFailure>` — except for a user's decline, which the cipher methods threw as well. The argument for throwing was that a local signer cannot fail, so a `Result` adds a branch to calls that never take it.

But every way a remote signer says "no" is anticipated: nobody is signed in to the extension, the bunker is unreachable, the user declined the prompt, the extension switched accounts and signed as another key, the peer answered with something malformed. Thrown, those outcomes were invisible at the call site; every caller re-classified them with `instanceof` and message matching, and a caller that forgot to catch a decline reported it as a crash.

## Decision

`getPublicKey` returns `Promise<Result<PublicKey, SignerFailure>>` and `signEvent` returns `Promise<Result<NostrEvent, SignerFailure>>`, like the cipher methods. `SignerFailure` is `{ type, message }` with `type` one of `no-signer`, `disconnected`, `rejected`, `pubkey-mismatch`, `public-key-failed`, `sign-failed`, `decrypt-failed`, `encrypt-failed`; `message` is the signer's words for display.

A signed event whose pubkey is not the caller's expected identity is `pubkey-mismatch`, returned by `checkPubkeyMatches`: the key that signed is chosen by software outside this library (the user switching accounts in the extension or the bunker), so a mismatch is the peer's answer, not a broken invariant here.

A local signer's `getPublicKey` and `signEvent` always return `ok`. A throw from its Schnorr primitive is a broken primitive and propagates.

## Consequences

Callers branch on `success` for every signer call and switch on `type` to tell a decline from a failure; nothing needs `try`/`catch` or `instanceof`. `SigningError`, `SignerRejectedError` and `PubkeyMismatchError` no longer exist. Adding a `SignerFailure` mode is a breaking change for every exhaustive caller. Do not make a method throw an anticipated signer outcome again to save the branch a local signer never takes.

Shared decisions: nostr-adrs ADR-0001, ADR-0041 and ADR-0049.
