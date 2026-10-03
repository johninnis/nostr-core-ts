# 0017. NIP-19 encoders take relay hints as `RelayUrl`, and decoders return them as `RelayUrl`

## Status

Accepted

## Context

Shared ADR-0084 decides the protocol: an encoder writes only canonical relay URLs, and a decoder canonicalises each hint, keeps each once and drops one with no canonical form. What is this package's is how the encoder's half is enforced. Its encoders took relay hints as plain strings and wrote them verbatim, on the reasoning that some relays' URLs do not satisfy the canonical form; but such a hint is one every decoder drops, so the encoder published hints its own decoder would not return.

## Decision

`encodeNprofile`, `encodeNevent` (through `EncodeNeventOptions.relayUrls`) and `encodeNaddr` take relay hints as `ReadonlyArray<RelayUrl>`, so only a value `parseRelayUrl` produced can be written. `decodeNostrEntity` returns each entity's hints as `ReadonlyArray<RelayUrl>` through `toRelayUrls`.

## Consequences

A caller holding a hint as a string puts it through `parseRelayUrl` before encoding, and one that does not parse is not encoded. A `RelayUrl` is at most 200 characters of ASCII, so a hint can no longer overrun a TLV's one-byte length; the encoders' `null` covers the identifier and the 5000-character bound. Do not widen the encoders back to `string`.

Shared decision: nostr-adrs ADR-0084.
