# 0037. `decodeNostrEntity` reads a bare entity, and `parseNostrInput` is the one reader of a `nostr:` URI a person typed

## Status

Accepted

## Context

`decodeNostrEntity` stripped a leading `nostr:` and the space around it before decoding, so `"  NOSTR:npub1…  "` decoded as an `npub`. innis/nostr-core's NIP-19 codec reads the bech32 string exactly as written and refuses anything else, so the two cores answered differently for the same input. The tolerance served one kind of caller only: a person pasting an identifier, often copied as a NIP-21 URI with stray space. Every other caller already holds a bare entity — the identifier a content reference matched after its `nostr:` prefix, an `npub` the application encoded itself — and for those the tolerance was a second way to accept input, which let a malformed reference decode where innis/nostr-core refuses it.

## Decision

`decodeNostrEntity` decodes a bare NIP-19 entity exactly as written: a `nostr:` prefix, or space around the entity, makes it `null`, as in innis/nostr-core. Reading what a person typed is `parseNostrInput`'s job: it strips a `nostr:` prefix in any case and the space, tab, line feed, carriage return, NUL and vertical tab around the input and after the prefix (`stripNostrUriPrefix`), once, and then decodes the entity. A content reference passes `decodeNostrEntity` the identifier its pattern matched, which never carries the prefix.

## Consequences

- A bare entity decodes the same way here and in innis/nostr-core; only the user-input edge tolerates a URI or space.
- An application reading pasted text calls `parseNostrInput`, or `stripNostrUriPrefix` where the text may also be something other than a NIP-19 entity (a NIP-05 address); it does not hand pasted text to `decodeNostrEntity`.
- Do not move the prefix and space tolerance back into `decodeNostrEntity` to save a caller a call: that makes every caller tolerant, not just the one reading a person's input.
