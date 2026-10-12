# 0040. The NIP-29 module models only the group metadata and group chat its consumers use

## Status

Accepted

Carries forward the substance of @innis/nostr-nip29 ADR-0001, which this record supersedes now that the package is folded into this one.

## Context

NIP-29 is small, but its implementations disagree even on the basics. A survey of six clients (Hubstr, chachi, flotilla, grimoire, nostrord and wisp) found the `h` tag written with and without a relay hint, sometimes by one client on different kinds; chat replies written as a `q` tag with a relay and a pubkey, as a bare `["q", <id>]` beside a `p` tag, or as a quote inside the content; no two clients reading the same subset of the kind 39000 marker tags; and the `livekit` tag implemented by only some. Each client re-derives the edges, and the reasoning stays buried in an application.

The specification itself is much wider than any one consumer: admins, members and roles (kinds 39001–39003), threads (kind 11), the moderation and lifecycle events of kinds 9000–9021, the user's group list (kind 10009) and `supported_kinds`. Modelling all of it from the text alone means designing shapes nothing exercises, and those are the shapes most likely to be wrong.

The helpers lived in their own package, @innis/nostr-nip29: pure functions over events, with no transport and no port, which is what ADR-0001 says this package holds. Kept apart, they duplicated what the core grew beside them, a kind 9 constant and a kind 9 reply builder, and every change to either cost a separate release.

## Decision

- The NIP-29 helpers are this package's NIP-29 module (`src/domain/service/group.ts` and `src/domain/service/group-chat.ts`), exported from the public entry point, so the choices they make beyond the written NIP are stated once, tested, and visible to every consumer.
- The module models only what a consumer built against it uses: kind 39000 group metadata (with its `private`, `closed`, `restricted`, `hidden` and `livekit` markers), read into a `Group` held by its id and the relay it was read from, and kind 9 group chat. Everything else in NIP-29 is absent until a consumer needs it, and is then added with the same scrutiny.
- The module's kinds are the package's kinds: `KIND_GROUP_METADATA` (39000) and `KIND_CHAT_MESSAGE` (9) in `kinds.ts`, with no second constant of its own (ADR-0044).
- A group chat message that answers nothing is built by `buildGroupChatMessage`, which tags its content's mentions and hashtags after the group's `h` tag, as `buildTextNote` and `buildReply` do; a reply to one is `buildReply`, which answers a kind 9 with a kind 9 quoting it, followed by `withGroupTag`, which adds the group's `h` tag. The reply builder knows nothing of groups (ADR-0043, shared ADR-0076). NIP-29's `previous` timeline references, when a consumer needs them, belong to this module, not to the reply builder.
- `withGroupTag(event, group, groupRelay)` is the one function that adds a group's `h` tag to an outgoing event, and `group` names the group either way a caller holds it: by its id, when the caller knows the group it writes in, such as a group chat column or a composer replying inside a group; or by the event answered, whose `h` tags name it as one claim, the form a reaction, repost or zap request uses. A known group is written whatever the event answered states, so a reply inside a group carries the group's `h` tag even when its parent's `h` tags name no one group; an event without one is no group event, and relay selection would route it publicly. The hint is `groupRelay`, or for a group taken from an event, that event's own (shared ADR-0101). An event answered whose `h` tags name different groups names no one group to write, so its `h` tags naming a group are carried as written: the outgoing event is then a group event naming no one group, which relay selection routes as a group event with no relays, never publicly (shared ADR-0014, shared ADR-0045). Only an event with no `h` tag naming a group leaves the outgoing event unchanged. The empty id names no group, and naming a group by it, here or in `buildGroupChatMessage`, throws `InvalidArgumentError` rather than write a tag that routes nowhere.
- Where the module goes beyond the written NIP, the behaviour is recorded as a convention in `nostr-adrs`, never presented as protocol: the `h` tag's relay hint is shared ADR-0101, and the `h` tag is read as one claim, its group id and its hint each (shared ADR-0014).
- The metadata's `name`, `about` and `picture` are read as every optional text or URL field in this package is: exactly as written, an empty one as the empty string, and absent only when no tag states it or its tags disagree (shared ADR-0014, shared ADR-0079). An absent `name` is the group's id.

## Consequences

- An absent part of NIP-29 is not a gap to fill speculatively. A request for admin or lifecycle helpers waits for a consumer that performs them.
- A consumer reading events from other clients treats every convention the module writes as optional on reading.
- A consumer of @innis/nostr-nip29 imports the same functions from this package; `KIND_GROUP_CHAT` is `KIND_CHAT_MESSAGE`; `buildGroupChatMessage` no longer takes a `replyTo`, and a relay hint the caller does not know is left out rather than given as `null` (ADR-0033).
- A caller writing inside a group it knows names that group by its id rather than leaning on its parent's `h` tags, which may name no one group. Do not add a second function that writes an `h` tag, and do not make `withGroupTag` write an empty id, skip a known group, or drop the `h` tags of an event answered whose tags disagree: each sends a group's event to public relays.
- @innis/nostr-nip29 trimmed `name`, `about` and `picture` with the runtime's own trim and read an empty or blank one as absent. A consumer that wants a blank value shown as missing now tests for it itself; do not put the trimming back in the reader. `groupMetadataFilter("")` names the empty id, as any id given is named, rather than every group.
- Shared decisions: nostr-adrs ADR-0014, ADR-0045, ADR-0076, ADR-0079 and ADR-0101.
