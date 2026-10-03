# 0029. `canFilterMatch` is the one test of a filter, and `serialiseReqMessage` leaves out what it refuses

## Status

Accepted

## Context

Shared ADR-0069 decides that a filter that can match nothing matches nothing — an empty list in any list attribute, a `#` key that is not `#` plus one letter, a `since` after its `until` — and that only a client's send path leaves such a filter out. `compileFilter` used to answer two ways at once, matching nothing for an empty `ids` but everything for an empty tag list, and `serialiseReqMessage` sent such filters as they came. TypeScript can keep a multi-letter `#` key out of the `NostrFilter` type but not out of a value built at run time.

## Decision

- `canFilterMatch(filter)` is the one test, and `compileFilter` matches nothing for any filter it refuses. A key whose value is `undefined` is absent. A key whose value is `null`, which `NostrFilter` does not admit but a value built at run time can carry, throws `InvalidArgumentError`: shared ADR-0069 makes `null` a refused field, never an absent one, and this package builds filters and parses none, so a `null` here is the caller's fault. Because `serialiseReqMessage` and `compileFilter` both pass through the test, neither writes nor matches such a filter.
- `NostrFilter` admits only `#` plus one letter as a tag condition; a filter carrying another at run time matches nothing.
- `serialiseReqMessage` leaves out every filter `canFilterMatch` refuses and returns `null` when none is left, so a `REQ` that selects nothing is not sent. `@innis/nostr-relay-pool` answers such a subscription with an end of stored events and opens no connection for it.
- `serialiseReqMessage` writes each filter's fields in innis/nostr-core's `Filter` order — `ids`, `authors`, `kinds`, the tag conditions in the caller's order, `since`, `until`, `limit`, `search` (NIP-50) — and leaves out any other key, as that `Filter` does, so both cores send the same bytes (shared ADR-0069). NIP-01 leaves the order open, and `hashFilters` sorts keys, so digests are unchanged.

## Consequences

- A caller of `serialiseReqMessage` handles `null`; there is no way to put a `REQ` with no satisfiable filter on the wire through this package.
- Do not skip an empty list or an unknown `#` key to be forgiving: both turn "nothing" into "everything".
- Shared decision: nostr-adrs ADR-0069.
