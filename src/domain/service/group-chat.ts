import type { Rumour, Tag, UnsignedEvent } from "../value-object/nostr-event.ts"
import type { RelayUrl } from "../value-object/relay-url.ts"
import { parseRelayUrl } from "../value-object/relay-url.ts"
import { KIND_CHAT_MESSAGE } from "../value-object/kinds.ts"
import { soleValue } from "../value-object/sole-tag-value.ts"
import { withContentTags } from "./content-tags.ts"
import { soleTagValue } from "./tags.ts"
import { now } from "./timestamp.ts"
import { InvalidArgumentError } from "../exception/invalid-argument-error.ts"

interface GroupPointer {
  readonly id: string
  readonly relayHint: RelayUrl | null
}

const groupTag = ({ id, relayHint }: GroupPointer): Tag => {
  if (id === "") {
    throw new InvalidArgumentError("A NIP-29 group is named by a non-empty id, and the empty id names none")
  }
  return relayHint === null ? ["h", id] : ["h", id, relayHint]
}

const namedGroupId = (value: string): string | null => value === "" ? null : value

// Deliberate: the group id and the hint are each one claim, so tag order never decides — see shared ADR-0014
const groupPointerOf = (event: Rumour): GroupPointer | null => {
  const id = soleTagValue(event.tags, "h", namedGroupId).value
  if (id === null) return null
  const hints = event.tags.flatMap((tag) => tag[0] === "h" && tag[1] === id ? parseRelayUrl(tag[2]) ?? [] : [])
  return { id, relayHint: soleValue(hints).value }
}

/**
 * The event's NIP-29 group `h` tag as its `h` tags state it, read as one claim (shared ADR-0014): `["h", <group-id>,
 * <relay>]` when every `h` tag naming a non-empty group id names the same one and those carrying a relay hint name
 * the same relay, in its canonical form, and `["h", <group-id>]` when none carries a hint or the hints disagree; a hint
 * that is not a relay URL takes no part (shared ADR-0101). `null` when no `h` tag names a non-empty group id, or when
 * they name different ones.
 */
export const groupTagOf = (event: Rumour): Tag | null => {
  const pointer = groupPointerOf(event)
  return pointer === null ? null : groupTag(pointer)
}

/**
 * The relay hint the event's group `h` tags state as one claim, as a canonical relay URL, or `null` when the event has
 * no one group, no tag carries a relay URL as its hint, or the hints disagree (shared ADR-0014, shared ADR-0101).
 */
export const groupRelayHintOf = (event: Rumour): RelayUrl | null => groupPointerOf(event)?.relayHint ?? null

const namingGroupTags = (event: Rumour): ReadonlyArray<Tag> =>
  event.tags.filter((tag) => tag[0] === "h" && namedGroupId(tag[1] ?? "") !== null)

const groupTagsFor = (group: Rumour | string, groupRelay: RelayUrl | null): ReadonlyArray<Tag> => {
  if (typeof group === "string") return [groupTag({ id: group, relayHint: groupRelay })]
  const pointer = groupPointerOf(group)
  // Deliberate: h tags naming no one group are carried as written, so the event never routes publicly — see shared ADR-0014
  if (pointer === null) return namingGroupTags(group)
  return [groupTag({ id: pointer.id, relayHint: groupRelay ?? pointer.relayHint })]
}

/**
 * Add a NIP-29 group's `h` tag to an outgoing event (a reply, reaction, repost or zap request) so the group's relay
 * accepts it and it routes back to the group. `group` names the group in one of two ways: by its id, when the caller
 * knows the group it is writing in, such as a group chat column or a composer replying inside a group, so the tag is
 * written whatever the event answered states; or by the event the outgoing event answers, whose `h` tags name it as one
 * claim (shared ADR-0014). The tag's relay hint is `groupRelay`, the group's resolved hosting relay, or for a group
 * taken from an event, otherwise that event's own hint (shared ADR-0101). When that event's `h` tags name different
 * groups, its `h` tags naming a group are carried as written, so the outgoing event is a group event naming no one
 * group, which relay selection never routes publicly (shared ADR-0014, shared ADR-0045). The event is returned unchanged
 * when `group` is `null` or is an event with no `h` tag naming a group. Throws `InvalidArgumentError` for the empty id,
 * which names no group. A group chat reply is `buildReply` followed by this (shared ADR-0076).
 */
export const withGroupTag = (
  event: UnsignedEvent,
  group: Rumour | string | null,
  groupRelay: RelayUrl | null,
): UnsignedEvent => {
  const groupTags = group === null ? [] : groupTagsFor(group, groupRelay)
  return groupTags.length === 0 ? event : { ...event, tags: [...event.tags, ...groupTags] }
}

/** The fields needed to build a kind 9 group chat message that answers nothing. */
export interface GroupChatInput {
  readonly groupId: string
  readonly content: string
  /** The group's hosting relay, written as the relay of the `h` tag (shared ADR-0101). */
  readonly relayHint?: RelayUrl
  /** Pins the `created_at`, which defaults to the system clock ({@link now}). */
  readonly createdAt?: number
}

/**
 * Build an unsigned kind 9 group chat message that answers nothing, carrying the group's `h` tag, with the relay hint
 * when known, then the tags its content's mentions and hashtags need, as `buildTextNote` writes them. Throws
 * `InvalidArgumentError` for the empty `groupId`, which names no group. A reply is `buildReply(content, parent)`, which
 * quotes a kind 9 parent with a NIP-C7 `q` tag, followed by {@link withGroupTag} naming the group: there is one reply
 * builder, and it knows nothing of groups (shared ADR-0076).
 */
export const buildGroupChatMessage = (input: GroupChatInput): UnsignedEvent => ({
  kind: KIND_CHAT_MESSAGE,
  created_at: input.createdAt ?? now(),
  tags: withContentTags([groupTag({ id: input.groupId, relayHint: input.relayHint ?? null })], input.content),
  content: input.content,
})
