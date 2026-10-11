# 0011. NIP-98 payload tags follow the shared strict policy, and a tag naming the wrong body is `payload-mismatch` on any body

## Status

Accepted

## Context

Shared ADR-0024 decides the protocol question: a non-empty body requires a `payload` tag with its exact lowercase SHA-256, an empty body needs none and admits one only when it holds the SHA-256 of the empty string, any other value being a mismatch, and a tag stating more than one value is refused. `payload-unexpected` was kept from when every `payload` tag on an empty body was refused. Once the empty body's hash was admitted, it was reached only by a tag naming some other body's hash, which `payload-mismatch` already reports for a non-empty body, so one fault had two literals and which one a server saw depended on the body's length.

## Decision

`checkNip98Event`, and through it `createNip98Validator`, matches a `payload` tag in constant time against the body's hash, the empty body's when no `bodyHash` is given, and returns the refusals as the `Nip98ValidationFailure` literals `payload-missing` (no tag on a non-empty body), `payload-mismatch` (a tag holding any other hash, whatever the body) and `payload-disagreeing` (tags stating more than one value). `validateAuthHeader` hashes a body itself. `buildNip98AuthEvent` hashes the body it is given and emits the tag only for a non-empty one.

## Consequences

Each rejection reason is a literal the server can switch on and report, and a tag naming the wrong body is one literal whichever body was sent. `payload-unexpected` is gone; a consumer that switched on it switches on `payload-mismatch`, and no innis package did. A caller holding the body never hashes it: `buildNip98AuthEvent` and `validateAuthHeader` take the body and hash it themselves. `validate`, which takes an event already parsed, takes the body's hash as `bodyHash` from its caller instead. `checkNip98Event` reads the hash of the empty body as no body, as innis/nostr-core's `Nip98Request::fromBodyHash` does, so a caller that hashes every body, empty ones included, needs no case of its own, and `validateAuthHeader` hashes every body it is given. Which payloads an empty body admits is shared ADR-0024's to decide, not this package's; innis/nostr-core makes the same change under its ADR-0138.

Shared decisions: nostr-adrs ADR-0014 and ADR-0024.
