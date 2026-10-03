# 0023. `analyseEvent` reads a reply's root and parent, with one NIP-10 marker reader

## Status

Accepted

## Context

Shared ADR-0012 decides when an event is a reply; shared ADR-0085 in which order a comment's address, event and external-content tags name its root and parent; shared ADR-0014 that tags of one name naming different targets name none. NIP-10 decides the rest: marked `e` tags name the root and the reply, and in the deprecated positional scheme "One "e" tag: `["e", <id>]`: The id of the event to which this event is a reply" while two or more name the root first and the reply last. What remains here is how this package exposes those readings.

## Decision

- `analyseEvent(raw).refs` carries `rootEvent` and `replyToEvent`, each a `ThreadRef` or `null`, and `isReply` by shared ADR-0012. Each is read independently: an event that names a parent and no root has `rootEvent` `null`, and one that names a root and no parent has `replyToEvent` `null`. Neither is filled in from the other.
- `nip10Marker` is the one reader of a kind 1 `e` tag's marker, used by `analyseEvent` and by `buildReply`; when any `e` tag carries a marker, the marked scheme applies to all of them, and otherwise the positional one does, a single unmarked `e` tag naming the parent.
- A comment's root and parent follow shared ADR-0085; an address is what `replyTargetRef` gives for an addressable event, so a comment and the article it answers agree on one key.

## Consequences

- A caller wanting "the thread to open" reads `rootEvent ?? replyToEvent` itself; `buildReply` reads a parent's root that way, as the PHP `RumourFactory::createReply` does.
- Do not write a second marker test beside `nip10Marker`, and do not copy the parent into an absent root.
- Shared decisions: nostr-adrs ADR-0012, ADR-0014 and ADR-0085.
