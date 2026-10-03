# 0003. Every decoded NIP-19 entity names the pubkey it carries

## Status

Accepted

## Context

Several NIP-19 entities carry a public key: `npub`, `nprofile`, an `nevent` with an author, an `naddr`. Paste-handling code that wants "the pubkey in this identifier" had to decode the entity and branch on its type, because each member of the decoded union kept its key under a different path (`pubkey`, or `address.pubkey` for an `naddr`) and a `note` had none. A separate `pubkeyFromNip19` function hid that branch, but it was a wrapper over `decodeNostrEntity` whose only job was to repair the shape of what `decodeNostrEntity` returned.

## Decision

Every member of `DecodedEntity` carries `pubkey`: the key an `npub` or `nprofile` encodes, an `nevent`'s author or `null`, an `naddr`'s author (the same key as `address.pubkey`), and `null` for a `note`. `decodeNostrEntity(input)?.pubkey` is the pubkey any identifier names. There is no separate extractor.

## Consequences

- A caller finds the pubkey without branching on the entity type and without a helper, and a new entity type that carries a key is one more member with a `pubkey`, which the type checker requires.
- An `naddr` states its author twice, in `pubkey` and in `address.pubkey`. That is deliberate: `address` is the coordinate, whole, and `pubkey` is the field every entity shares.
- Do not reintroduce `pubkeyFromNip19` or another wrapper that re-shapes `decodeNostrEntity`'s result; change the result instead.
