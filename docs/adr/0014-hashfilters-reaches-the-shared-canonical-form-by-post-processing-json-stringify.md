# 0014. `hashFilters` reaches the shared canonical form by post-processing `JSON.stringify`

## Status

Accepted

## Context

Subscription deduplication keys are shared between TypeScript and PHP services, and shared ADR-0006 fixes the canonical form: keys and array elements sorted, compact JSON with `/` unescaped and every non-ASCII code unit escaped as lowercase `\uXXXX`, hashed with SHA-256. `JSON.stringify` does not produce that form: it leaves non-ASCII characters raw and escapes `U+2028` and `U+2029` differently from PHP's encoder, and JavaScript sorts strings by UTF-16 code unit.

## Decision

`hashFilters` serialises with `JSON.stringify` and then escapes every code unit above `U+007F` as lowercase `\uXXXX`. It sorts array elements by that ASCII encoding, where byte and code-unit order agree, and object keys by code unit. The shared conformance anchors are asserted in this package's tests.

## Consequences

The TypeScript side post-processes `JSON.stringify` output rather than carrying its own serialiser. A change to the canonical form is a change to shared ADR-0006 and to the anchors in both implementations together.

`hashFilters` is total: a filter carrying a `#` key that is not `#` plus one letter, which `NostrFilter` does not admit but a value built at run time can carry (ADR-0029), is hashed like any other value, not refused. The PHP nostr-core refuses to build such a filter, so it never holds one to hash, and no filter set has two digests across the implementations. The digest keys a subscription for deduplication and nothing else; such a filter matches nothing and `serialiseReqMessage` leaves it out, so a caller that hashes it alongside filters that can match opens, at worst, a second subscription for the same filters on the wire. Refusing it here would instead make a filter that ADR-0029 reads as matching nothing into a fault in every caller that hashes before it sends, `@innis/nostr-relay-pool`'s `subscribe` among them. Do not make `hashFilters` throw for it.

Shared decision: nostr-adrs ADR-0006.
