# 0036. `computeEventId` serialises through `JSON.stringify` and keeps its control-character escapes

## Status

Accepted

## Context

Shared ADR-0105 decides that an event's id is computed over a serialisation that writes a control character from U+0000 to U+001F, other than the seven NIP-01 names, as a `\u00XX` escape with lower-case hex digits, as JSON encoders do, and not verbatim as NIP-01's wording says. `JSON.stringify` already writes exactly that serialisation of the array `[0, pubkey, created_at, kind, tags, content]`: the seven NIP-01 escapes, `\u00XX` for every other control character, and every other character of a well-formed string as it is, U+2028 and U+2029 included. A hand-written serialiser that followed NIP-01's wording to the letter would be a second encoder to trust, and its ids would differ from every other implementation's for any event holding such a character.

## Decision

`computeEventId` hashes `JSON.stringify([0, pubkey, created_at, kind, tags, content])` and nothing else. It has no escaping of its own, no post-processing of the encoder's output, and no switch to the verbatim form NIP-01 describes. A test pins the escaped form of U+0001 and the id it yields.

## Consequences

- An event holding a control character has the same id here as in innis/nostr-core, nostr-tools and the relays that use a JSON encoder.
- Do not replace `JSON.stringify` with a serialiser that writes control characters verbatim to follow NIP-01's wording; that is the departure shared ADR-0105 records and keeps.
- Shared decision: nostr-adrs ADR-0105.
