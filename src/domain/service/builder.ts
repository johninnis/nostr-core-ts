import type { AddressableEventRef } from "../value-object/addressable-ref.ts"
import { formatAddressableRef } from "../value-object/addressable-ref.ts"
import type { EventId } from "../value-object/event-id.ts"
import { isValidEventId } from "../value-object/event-id.ts"
import type { EventOrAddressRef } from "./transformer.ts"
import {
  KIND_DELETION,
  KIND_HIGHLIGHT,
  KIND_REACTION,
  KIND_REPOST,
  KIND_SHORT_NOTE,
  KIND_ZAP_REQUEST,
} from "../value-object/kinds.ts"
import type { NostrEvent, Tag, UnsignedEvent } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { now } from "../value-object/timestamp.ts"
import { decodeNostrEntity, NOSTR_ENTITY_REGEX } from "./bech32.ts"
import { DEFAULT_REACTION } from "./reaction.ts"
import { hasPubkey, hasTag } from "./tags.ts"

const extractHashtagsFromContent = (content: string): ReadonlyArray<string> => {
  const matches = content.matchAll(/(?<![&\w])#([a-zA-Z0-9_]+)/gu)
  const tags = new Set<string>()
  for (const match of matches) {
    const tag = match[1]
    if (tag) tags.add(tag.toLowerCase())
  }
  return [...tags]
}

const extractReferenceTags = (content: string): ReadonlyArray<Tag> => {
  const tags: Array<Tag> = []
  const seenPubkeys = new Set<string>()
  const seenEventIds = new Set<string>()

  for (const match of content.matchAll(NOSTR_ENTITY_REGEX)) {
    const entity = match[1]
    if (!entity) continue
    const decoded = decodeNostrEntity(entity)
    if (!decoded) continue

    if ((decoded.type === "npub" || decoded.type === "nprofile") && !seenPubkeys.has(decoded.pubkey)) {
      seenPubkeys.add(decoded.pubkey)
      tags.push(["p", decoded.pubkey])
    }

    if (decoded.type === "note" && !seenEventIds.has(decoded.eventId)) {
      seenEventIds.add(decoded.eventId)
      tags.push(["q", decoded.eventId])
      tags.push(["e", decoded.eventId, "", "mention"])
    }

    if (decoded.type === "nevent" && !seenEventIds.has(decoded.eventId)) {
      seenEventIds.add(decoded.eventId)
      tags.push(decoded.pubkey ? ["q", decoded.eventId, "", decoded.pubkey] : ["q", decoded.eventId])
      tags.push(["e", decoded.eventId, "", "mention"])
      if (decoded.pubkey && !seenPubkeys.has(decoded.pubkey)) {
        seenPubkeys.add(decoded.pubkey)
        tags.push(["p", decoded.pubkey])
      }
    }

    if (decoded.type === "naddr") {
      tags.push(["a", formatAddressableRef(decoded)])
      if (!seenPubkeys.has(decoded.pubkey)) {
        seenPubkeys.add(decoded.pubkey)
        tags.push(["p", decoded.pubkey])
      }
    }
  }

  return tags
}

/** Threading context for `buildTextNote` — the parent event and (optionally) the thread root plus any pubkeys to keep in the conversation. A ref may be a hex event id (`e` tag) or an `naddr1...` coordinate for an addressable parent (`a` tag). */
interface ReplyContext {
  readonly replyToId: EventOrAddressRef
  readonly replyToAuthorPubkey: PublicKey
  readonly rootEventId?: EventOrAddressRef | null
  readonly rootAuthorPubkey?: PublicKey | null
  readonly rootRelayHint?: string | null
  readonly threadPubkeys?: ReadonlyArray<PublicKey>
}

const threadTag = (ref: EventOrAddressRef, relay: string, marker: string): Tag => {
  if (isValidEventId(ref)) return ["e", ref, relay, marker]
  const decoded = decodeNostrEntity(ref)
  if (decoded && decoded.type === "naddr") return ["a", formatAddressableRef(decoded), relay, marker]
  return ["e", ref, relay, marker]
}

const buildReplyTags = ({
  replyToId,
  replyToAuthorPubkey,
  rootEventId,
  rootAuthorPubkey,
  rootRelayHint = null,
  threadPubkeys = [],
}: ReplyContext): ReadonlyArray<Tag> => {
  const effectiveRootId = rootEventId ?? replyToId
  const isSameAsRoot = !rootEventId || rootEventId === replyToId
  const relay = rootRelayHint ?? ""

  const tags: Array<Tag> = [threadTag(effectiveRootId, relay, "root")]

  if (!isSameAsRoot) tags.push(threadTag(replyToId, relay, "reply"))

  // `hasPubkey` matches on (name, value) ignoring the relay hint, so a duplicate pubkey is
  // dropped regardless of which slot first carried it. Append-order is preserved.
  const pushPubkey = (pk: PublicKey): void => {
    if (!hasPubkey(tags, pk)) tags.push(["p", pk, relay])
  }

  for (const pk of threadPubkeys) pushPubkey(pk)
  pushPubkey(replyToAuthorPubkey)
  if (rootAuthorPubkey) pushPubkey(rootAuthorPubkey)

  return tags
}

/** Build a kind-1 short note, optionally threaded under `replyContext`; hashtags and nostr: references are auto-tagged. */
export const buildTextNote = (
  content: string,
  replyContext: ReplyContext | null = null,
  createdAt: number | null = null,
): UnsignedEvent => {
  const tags: Array<Tag> = []
  if (replyContext) tags.push(...buildReplyTags(replyContext))

  for (const tag of extractReferenceTags(content)) {
    const value = tag[1]
    if (value === undefined) continue
    // `hasTag` matches on `(name, value)`, so an existing `["e", id, "", "root"]` from the reply
    // context correctly blocks an `["e", id, "", "mention"]` added from a body reference.
    if (hasTag(tags, tag[0], value)) continue
    tags.push(tag)
  }

  for (const t of extractHashtagsFromContent(content)) tags.push(["t", t])
  return { kind: KIND_SHORT_NOTE, created_at: createdAt ?? now(), tags, content }
}

/** Build a kind-6 repost of `targetEventId`; `rawEvent` (if given) is JSON-stringified into the content per NIP-18. */
export const buildRepost = (
  targetEventId: EventId,
  targetAuthorPubkey: PublicKey,
  rawEvent: NostrEvent | null = null,
): UnsignedEvent => ({
  kind: KIND_REPOST,
  created_at: now(),
  tags: [["e", targetEventId], ["p", targetAuthorPubkey]],
  content: rawEvent ? JSON.stringify(rawEvent) : "",
})

/** Build a kind-7 reaction to `targetEventId`; defaults to `+` (NIP-25 "like") when no `reaction` is supplied. */
export const buildReaction = (
  targetEventId: EventId,
  targetAuthorPubkey: PublicKey,
  reaction: string = DEFAULT_REACTION,
): UnsignedEvent => ({
  kind: KIND_REACTION,
  created_at: now(),
  tags: [["e", targetEventId], ["p", targetAuthorPubkey]],
  content: reaction,
})

interface EventDeletionTarget {
  readonly eventId: EventId
  readonly kind: number
}

/** Target shape accepted by `buildDeletion` — either a single event id with its kind, or an addressable-event coordinate (NIP-09). */
export type DeletionTarget = EventDeletionTarget | AddressableEventRef

/** Build a kind-5 deletion event for either a single event or an addressable coordinate (NIP-09). */
export const buildDeletion = (target: DeletionTarget): UnsignedEvent => {
  const tags: Array<Tag> = "eventId" in target
    ? [["e", target.eventId], ["k", String(target.kind)]]
    : [["a", formatAddressableRef(target)], ["k", String(target.kind)]]
  return { kind: KIND_DELETION, created_at: now(), tags, content: "" }
}

/** Build a kind-9802 highlight quoting `text` from `sourceUrl` (NIP-84), optionally with a `comment` tag. */
export const buildHighlightFromUrl = (
  text: string,
  sourceUrl: string,
  comment: string | null = null,
): UnsignedEvent => {
  const tags: Array<Tag> = [["r", sourceUrl]]
  if (comment) tags.push(["comment", comment])
  return { kind: KIND_HIGHLIGHT, created_at: now(), tags, content: text }
}

/** Build a kind-9802 highlight quoting `text` from another Nostr event identified by an addressable coordinate. */
export const buildHighlightFromEvent = (text: string, source: AddressableEventRef): UnsignedEvent => ({
  kind: KIND_HIGHLIGHT,
  created_at: now(),
  tags: [["a", formatAddressableRef(source)], ["p", source.pubkey]],
  content: text,
})

interface BuildZapRequestInput {
  readonly recipientPubkey: PublicKey
  readonly relayUrls: ReadonlyArray<string>
  readonly amountMillisats: number
  readonly eventId?: EventId | null
  readonly comment?: string
}

/** Build a kind-9734 zap request (NIP-57); attach `eventId` to zap a specific event rather than the recipient's profile. */
export const buildZapRequest = (
  { recipientPubkey, relayUrls, amountMillisats, eventId = null, comment = "" }: BuildZapRequestInput,
): UnsignedEvent => {
  const tags: Array<Tag> = [
    ["p", recipientPubkey],
    ["relays", ...relayUrls],
    ["amount", String(amountMillisats)],
  ]
  if (eventId) tags.push(["e", eventId])

  return { kind: KIND_ZAP_REQUEST, created_at: now(), tags, content: comment }
}

/** Input for `buildLongform` — NIP-23 long-form article metadata. `kind` is the caller's choice (typically `KIND_LONGFORM` or `KIND_LONGFORM_DRAFT`); `dTag` is the addressable-event identifier. */
interface BuildLongformInput {
  readonly kind: number
  readonly dTag: string
  readonly content: string
  readonly title?: string | null
  readonly summary?: string | null
  readonly image?: string | null
  readonly topics?: ReadonlyArray<string>
  readonly publishedAt?: number | null
  /** Pin the `created_at`. Defaults to the system clock ({@link now}). */
  readonly createdAt?: number
}

/** Build an addressable long-form article event (NIP-23) with the given `d` tag and optional metadata tags. */
export const buildLongform = (
  { kind, dTag, content, title, summary, image, topics, publishedAt, createdAt }: BuildLongformInput,
): UnsignedEvent => {
  const tags: Array<Tag> = [["d", dTag]]
  if (title) tags.push(["title", title])
  if (summary) tags.push(["summary", summary])
  if (image) tags.push(["image", image])
  if (publishedAt != null) tags.push(["published_at", String(publishedAt)])
  for (const topic of topics ?? []) tags.push(["t", topic])
  return { kind, created_at: createdAt ?? now(), tags, content }
}

export type { BuildLongformInput, ReplyContext }
