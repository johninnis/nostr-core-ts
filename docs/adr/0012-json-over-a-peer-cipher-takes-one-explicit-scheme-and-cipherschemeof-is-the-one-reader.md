# 0012. JSON over a peer cipher takes one explicit scheme, and `cipherSchemeOf` is the one reader of a payload's scheme

## Status

Accepted

## Context

Private list entries, NIP-17 seals and rumours, and NIP-46 messages are JSON encrypted to a peer. Shared ADR-0020 decides that outbound encryption never falls back from NIP-44 to NIP-04, and shared ADR-0083 decides how a received payload names its scheme (by NIP-04's `?iv=` separator) and that a private list is written with NIP-44; NIP-46 envelopes are read the same way (shared ADR-0053). What is this package's is how those decisions are expressed: two packages, this one and `@innis/nostr-nip46`, had each written the separator test for themselves, and each JSON-over-cipher caller chose its scheme its own way.

## Decision

- `createJsonCipher(cipher, scheme)` takes a `CipherScheme` that defaults to `"nip44"`; a caller that must speak to a legacy peer passes `"nip04"`. Neither direction tries another scheme on failure.
- `cipherSchemeOf(ciphertext)` is the one reader of a received payload's scheme. `decryptPrivateEntries` and `@innis/nostr-nip46`'s envelope decryption both call it; nothing else tests for `?iv=`.
- Each direction returns only the failures it can produce. Encrypting fails only when the signer does, since a value is serialised before it is encrypted and nothing is read back, so `encrypt` returns the signer's own `SignerFailure`, unwrapped, and so does a builder that only encrypts (`buildDmGiftWraps`, `buildReplaceableListEvent`, `buildNewListEvent`). `decrypt` returns a `JsonDecryptFailure`: `empty-ciphertext`, `json-parse-failed`, or `signer-failed` carrying the `SignerFailure`. The cipher accepts any JSON and reads no shape, so a reader that expects one reports the mismatch in its own failure: `decryptPrivateEntries`'s `PrivateEntriesFailure` carries `json-shape-mismatch`.

## Consequences

A caller that must support legacy peers decides per peer or per payload which scheme to pass, and a payload's own form is read by one function everywhere. Adding a scheme value meaning "either", or a second `?iv=` test, is declined.

Shared decisions: nostr-adrs ADR-0020, ADR-0053 and ADR-0083.
