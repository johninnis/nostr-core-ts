# 0023. `analyseEvent` reads a reply's root and parent the way its kind threads, with one NIP-10 marker reader

## Status

Accepted

## Context

Shared ADR-0012 decides when an event is a reply, and which kinds thread: kind 1 (NIP-10), kind 1111 (NIP-22), kind 1244 (NIP-A0, read as kind 1111 is), kind 42 (NIP-28), kind 1311 (NIP-53) and kind 9 (NIP-C7), each threading by its own tags. Shared ADR-0085 decides in which order a comment's address, event and external-content tags name its root and parent, and shared ADR-0014 that tags of one name naming different targets name none. What remains here is how this package exposes those readings.

## Decision

- `analyseEvent(raw).refs` carries `rootEvent` and `replyToEvent`, each a `ThreadRef` or `null`, and `isReply`. Each is read independently: an event that names a parent and no root has `rootEvent` `null`, and one that names a root and no parent has `replyToEvent` `null`. Neither is filled in from the other.
- `isReply` is true only for a kind that threads, and only when the parent resolves or, outside kind 42, the root does: a kind 42's root is its channel, which answers no message.
- Each kind is read the way its NIP threads it:
  - Kind 1, and any kind that does not thread: its `e` tags, marked when any carries a marker and positional otherwise, a single unmarked `e` tag naming the parent (`shortNoteThreadTags`).
  - Kind 1111 and kind 1244: the comment's root and parent, by shared ADR-0085.
  - Kind 42: its `e` tags by their markers alone, the `root` marker naming its channel and the `reply` marker its parent (`channelMessageThreadTags`, which `buildReply` reads too).
  - Kind 1311: its `e` tags, as one claim, name its parent; it has no root.
  - Kind 9: its first `q` tag naming an event id is its parent; it has no root.
- `nip10Marker` is the one reader of an `e` tag's marker, used by `analyseEvent` and by `buildReply`.
- A comment's address is what `replyTargetRef` gives for an addressable event, so a comment and the article it answers agree on one key.

## Consequences

- A chat, channel, live chat or voice reply reads as the reply its own clients thread it as, and the same event reads the same way here and in innis/nostr-core's `ReplyChainAnalyser` (innis/nostr-core ADR-0085).
- A caller wanting "the thread to open" reads `rootEvent ?? replyToEvent` itself; `buildReply` reads a parent's root that way, as innis/nostr-core's `RumourFactory::createReply` does.
- A channel message naming only its channel is no reply, though its root resolves.
- Do not write a second marker test beside `nip10Marker`, do not copy the parent into an absent root, and do not widen the threading kinds without a NIP and the shared record.
- Shared decisions: nostr-adrs ADR-0012, ADR-0014 and ADR-0085.
