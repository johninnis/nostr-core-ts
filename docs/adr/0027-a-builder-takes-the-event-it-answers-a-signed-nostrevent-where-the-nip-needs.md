# 0027. A builder takes the event it answers: a signed `NostrEvent` where the NIP needs a published one, a `Rumour` otherwise

## Status

Accepted

## Context

Shared ADR-0075 decides the protocol: a builder answering or referencing an event takes that event, and nothing else about the target but where it can be found. This package's builders used to take five hand-built descriptions of the target (`ReplyContext`, `EngagementTarget`, bare ids and coordinates), each dropping something the NIP needs. What is left to decide here is which TypeScript type each builder takes.

## Decision

- `buildReply(content, parent, hint?)`, `buildReaction(target, reaction?, relay?)`, `buildPrivateMessage(room, content, replyTo?)`, `buildPrivateReaction(room, target, reaction?)`, `buildHighlightFromEvent(text, source)` and `buildZapRequest({ …, target? })` take a `Rumour`, so a NIP-17 rumour can be answered or reacted to. `buildReply` also takes an `ExternalContentRef`, the NIP-73 content a comment can answer that is no event at all (ADR-0028).
- `buildRepost(target, relay)` and `buildDeletion(author, target)` take a signed `NostrEvent`: a repost's content is the event's JSON, and only a published event can be deleted, by its own author (shared ADR-0086) and never when it is itself a deletion request, against which a request has no effect (NIP-09, shared ADR-0093).
- `ReplyContext` and `EngagementTarget` are removed, and `buildRepost` has no separate raw-event argument.

## Consequences

- A caller must hold the event before it can answer, react to, repost or zap it; that is the point, not a cost to work around by rebuilding a partial event.
- Do not add an overload that takes an id, a pubkey or a coordinate "for when the event is not at hand".
- Shared decisions: nostr-adrs ADR-0016, ADR-0074, ADR-0075, ADR-0086 and ADR-0093.
