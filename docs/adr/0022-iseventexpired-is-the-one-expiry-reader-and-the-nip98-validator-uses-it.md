# 0022. `isEventExpired` is the one expiry reader, and the NIP-98 validator uses it

## Status

Accepted

## Context

Shared ADR-0011 decides when an event is expired, and shared ADR-0096 how a decimal tag value is read. The NIP-98 validator in this package carried its own copy of the expiry check, which disagreed with it.

## Decision

`isEventExpired(event, at)` implements shared ADR-0011, reading each value with `parseDecimalInteger`. The NIP-98 validator calls it and has no expiry rule or failure of its own: an expired event is `expired`.

## Consequences

Every reader of an expiry in this package gives one answer. Do not give a reader its own expiry check.

Shared decisions: nostr-adrs ADR-0011 and ADR-0096.
