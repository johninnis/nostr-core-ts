# 0030. `buildDmGiftWraps` takes the rumour alone and wraps to the room it names, signed by the rumour's author

## Status

Accepted

## Context

Shared ADR-0074 decides that a rumour's chat room is its author and every pubkey its `p` tags name, and that it is wrapped to every member of that room, the sender included. `buildDmGiftWraps` took a `receivers` list beside the rumour, which gave the room two sources of truth. NIP-17 also says "Clients MUST verify if pubkey of the `kind:13` is the same pubkey as that of the `unsignedMessageRumor`, otherwise any sender can impersonate any other"; the seal is signed by the `Signer` passed in, whose key is chosen by software outside this library (an extension's current account, a bunker's key).

## Decision

- `buildDmGiftWraps({ signer, createEphemeralSigner, rumour, clock?, randomUint32? })` wraps the rumour once to each member of `chatRoomMembers(rumour)`, sorted, the sender included, and returns the wraps in that order, each with the member it is addressed to. It has no `receivers` input.
- Before encrypting anything it asks the signer for its key. A signer that cannot give it returns its own `SignerFailure`; a signer whose key is not the rumour's author returns `pubkey-mismatch` (ADR-0002), and no seal is built. The PHP nostr-core refuses the same pairing up front in `GiftWrapper`.

## Consequences

- What a rumour addresses is what is wrapped, and a seal can only ever name the rumour's own author: a wrap a recipient would refuse as `rumour-pubkey-mismatch` is never built.
- There is no way through this package to wrap to a subset of the room; a disappearing message that skips the sender's copy would be a separate, explicitly named operation. Do not add a `receivers` override.
- A rumour that `p`-tags its own author, as a private reaction to the sender's own message does (shared ADR-0074), is wrapped to the author once: `chatRoomMembers` names each member once, so the tag adds no member and no second wrap.
- Shared decision: nostr-adrs ADR-0074.
