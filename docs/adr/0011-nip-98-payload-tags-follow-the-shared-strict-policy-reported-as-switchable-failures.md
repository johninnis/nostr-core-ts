# 0011. NIP-98 payload tags follow the shared strict policy, reported as switchable failures

## Status

Accepted

## Context

Shared ADR-0024 decides the protocol question: a non-empty body requires a `payload` tag with its exact lowercase SHA-256, an empty body forbids one (the empty-string hash included), and a tag stating more than one value is refused. What remains here is how this package reports those refusals and where it hashes.

## Decision

`checkNip98Event`, and through it `createNip98Validator`, returns the refusals as the `Nip98ValidationFailure` literals `payload-missing`, `payload-mismatch`, `payload-unexpected` and `payload-disagreeing`, compares the hash in constant time, and hashes a body itself in `validateAuthHeader`. `buildNip98AuthEvent` hashes the body it is given and emits the tag only for a non-empty one.

## Consequences

Each rejection reason is a literal the server can switch on and report. A caller holding the body never hashes it: `buildNip98AuthEvent` and `validateAuthHeader` take the body and hash it themselves. `validate`, which takes an event already parsed, takes the body's hash as `bodyHash` from its caller instead. `checkNip98Event` reads the hash of the empty body as no body, as innis/nostr-core's `Nip98Request::fromBodyHash` does, so a caller that hashes every body, empty ones included, needs no case of its own, and `validateAuthHeader` hashes every body it is given. Relaxing the empty-body case to accept the empty-string hash is a change to shared ADR-0024, not to this package.

Shared decisions: nostr-adrs ADR-0014 and ADR-0024.
