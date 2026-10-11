# 0014. `hashFilters` reaches the shared canonical form by post-processing `JSON.stringify`, and sorts object keys by code point

## Status

Accepted

## Context

Subscription deduplication keys are shared between TypeScript and PHP services, and shared ADR-0006 fixes the canonical form: keys and array elements sorted, compact JSON with `/` unescaped and every non-ASCII code unit escaped as lowercase `\uXXXX`, hashed with SHA-256. `JSON.stringify` does not produce that form: it leaves non-ASCII characters raw and escapes `U+2028` and `U+2029` differently from PHP's encoder, and JavaScript sorts strings by UTF-16 code unit, where a character above `U+FFFF` is a surrogate pair from `U+D800` and so sorts before a character from `U+E000`, though its code point is larger.

## Decision

- `hashFilters` serialises with `JSON.stringify` and then escapes every code unit above `U+007F` as lowercase `\uXXXX`.
- It sorts array elements by that ASCII encoding, where byte, code-unit and code-point order agree.
- It sorts object keys by code point, compared on the raw key. JavaScript's default sort compares UTF-16 code units, so the keys are compared through their code points.
- The shared conformance anchors are asserted in this package's tests, among them a filter whose keys put a character from `U+E000` to `U+FFFF` beside one above `U+FFFF`, its digest computed by the PHP encoder.

## Consequences

The TypeScript side post-processes `JSON.stringify` output rather than carrying its own serialiser. A change to the canonical form is a change to shared ADR-0006 and to the anchors in both implementations together.

No key NIP-01 defines holds a non-ASCII character, so no digest a NIP-01 filter had changes with the key order; only a filter whose keys put a private-use or other `U+E000`–`U+FFFF` character beside an astral one hashes differently than it did when keys were sorted by UTF-16 code unit.

`hashFilters` is total: a filter carrying a `#` key that is not `#` plus one letter, which `NostrFilter` does not admit but a value built at run time can carry (ADR-0029), is hashed like any other value, not refused. The PHP nostr-core refuses to build such a filter, so it never holds one to hash, and no filter set has two digests across the implementations. The digest keys a subscription for deduplication and nothing else; such a filter matches nothing and `serialiseReqMessage` leaves it out, so a caller that hashes it alongside filters that can match opens, at worst, a second subscription for the same filters on the wire. Refusing it here would instead make a filter that ADR-0029 reads as matching nothing into a fault in every caller that hashes before it sends, `@innis/nostr-relay-pool`'s `subscribe` among them. Do not make `hashFilters` throw for it, and do not go back to JavaScript's default key sort.

Shared decision: nostr-adrs ADR-0006.
