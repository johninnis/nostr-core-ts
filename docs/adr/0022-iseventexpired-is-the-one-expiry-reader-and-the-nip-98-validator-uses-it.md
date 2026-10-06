# 0022. `isEventExpired` is the one expiry reader, and the NIP-98 validator uses it

## Status

Accepted

## Context

Shared ADR-0011 decides when an event is expired, and shared ADR-0096 how a decimal tag value is read. The NIP-98 validator in this package carried its own copy of the expiry check, which disagreed with it.

## Decision

`isEventExpired(event, at)` implements shared ADR-0011, over `expiryOf(event)`, the one derivation of an event's expiry: the earliest `expiration` value `parseDecimalInteger` reads, or `null` when none parses. The NIP-98 validator calls it and has no expiry rule or failure of its own: an expired event is `expired`.

## Consequences

Every reader of an expiry in this package gives one answer. Do not give a reader its own expiry check.

The derivation is public as `expiryOf`, so a store holding only indexed tag values can reach the same instant without decoding the event — as innis/nostr-core's `ExpirationDerivation::earliestStated` does for PHP stores.

Shared decisions: nostr-adrs ADR-0011 and ADR-0096.
