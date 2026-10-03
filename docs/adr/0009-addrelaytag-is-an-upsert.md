# 0009. `addRelayTag` is an upsert

## Status

Accepted

## Context

`addTag` is a no-op when an identical `[name, value]` tag exists, because such tags carry no further state. An `r` tag carries a NIP-65 marker (`read`, `write`, or none for both), and relay tags are unique by relay: two `r` tags for one relay with different markers is not a meaningful state.

## Decision

`addRelayTag(tags, url, marker)` writes the `r` tag for `url` with `marker`: appended when no tag for that relay exists, otherwise written in canonical form at the first equivalent tag's position with every other equivalent removed. Equivalence is by canonical relay URL. It keeps the `add*` verb because with no existing entry it behaves exactly like `addTag`, and the most recent call expresses the caller's current intent.

## Consequences

The result holds exactly one `r` tag per relay. A caller that must distinguish insert from overwrite calls `hasRelayEntry` first. Renaming it to `upsertRelayTag` or making it a no-op on duplicates is declined.

`getRelayEntryMarker` reads a relay's marker across every equivalent `r` tag, so a relay held as a `read` tag and a `write` tag reads as `both`, and `setRelayEntryUsage` writes the changed relay back through `addRelayTag` as its one tag.

Shared decision: nostr-adrs ADR-0108.
