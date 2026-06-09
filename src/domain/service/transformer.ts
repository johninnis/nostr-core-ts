import type { EventId } from "../value-object/event-id.ts"
import { isValidEventId } from "../value-object/event-id.ts"
import type { RenderableEvent, Tag } from "../value-object/nostr-event.ts"
import {
  KIND_COMMENT,
  KIND_GENERIC_REPOST,
  KIND_HIGHLIGHT,
  KIND_LONGFORM,
  KIND_REACTION,
  KIND_REPOST,
  KIND_SHORT_NOTE,
} from "../value-object/kinds.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import { isValidPublicKey } from "../value-object/public-key.ts"
import { parseAddressableRef } from "../value-object/addressable-ref.ts"
import { encodeNaddr } from "./bech32.ts"
import { isParameterisedReplaceable } from "./kinds.ts"
import { getTagValue } from "./tags.ts"
import { DEFAULT_REACTION } from "./reaction.ts"

/**
 * Opaque pointer to a parent event in NIP-10 reply graphs. Two shapes coexist:
 *
 * - a hex `EventId` (from an `e` / `E` tag), or
 * - a NIP-19 `naddr1...` bech32 string (from an `a` / `A` tag for parameterised-replaceable parents).
 *
 * Consumers that need to branch should use `isValidEventId(value)` — true ⇒ event-id, false ⇒ naddr.
 */
export type EventOrAddressRef = string

/** Reply-graph view derived from an event's tags — root/reply pointers, mentioned ids/pubkeys, and a `kind`-aware reply flag. */
interface EventRefs {
  readonly rootEvent: EventOrAddressRef | null
  readonly replyToEvent: EventOrAddressRef | null
  readonly mentionedEvents: ReadonlyArray<EventId>
  readonly mentionedPubkeys: ReadonlyArray<PublicKey>
  readonly isReply: boolean
}

/** Per-kind projection for NIP-18 reposts — the original event being reposted as a hex id (`e` tag) or `naddr1...` coordinate (`a` tag), or `null` if neither was present. */
interface RepostData {
  readonly originalEventId: EventOrAddressRef | null
}

/** Per-kind projection for NIP-25 reactions — the reaction's wire content and the target being reacted to. */
interface ReactionData {
  /** Wire form of the reaction (`event.content`, defaulting to `+` for empty content). Pass through `formatReactionEmoji` to get a display string. */
  readonly content: string
  readonly targetEventId: EventOrAddressRef | null
}

/** Per-kind projection for NIP-84 highlights — the highlighted text, surrounding context, caller comment, and the source URL or quoted event. */
interface HighlightData {
  readonly text: string
  readonly context: string | null
  readonly comment: string | null
  readonly sourceUrl: string | null
  readonly sourceEventId: EventOrAddressRef | null
}

/** Per-kind projection for NIP-23 long-form articles — title, summary, image, optional publish timestamp, and topic (`t`) tags. */
interface LongformData {
  readonly title: string | null
  readonly summary: string | null
  readonly image: string | null
  readonly publishedAt: number | null
  readonly topics: ReadonlyArray<string>
}

/** Container for the kind-specific projections on `TransformedEvent.kindData` — at most one of the four is set, matching the event's kind. */
interface KindData {
  readonly repost?: RepostData
  readonly reaction?: ReactionData
  readonly highlight?: HighlightData
  readonly longform?: LongformData
}

/** Result of `transformEvent` — the raw event, its derived reference graph (`refs`), and any kind-specific projection (`kindData`). */
interface TransformedEvent {
  readonly raw: RenderableEvent
  readonly refs: EventRefs
  readonly kindData: KindData
}

const encodeAddressTag = (value: string): string | null => {
  const parsed = parseAddressableRef(value)
  if (!parsed || !parsed.dTag) return null
  return encodeNaddr(parsed)
}

/**
 * The {@link EventOrAddressRef} a reply uses to point at `event`: an `naddr1...` coordinate for an
 * addressable (parameterised-replaceable) event with a `d` tag, otherwise the hex event id. This is
 * the inverse of {@link encodeAddressTag} and the value `buildRefs` produces for a reply's parent.
 */
export const replyTargetRef = (event: RenderableEvent): EventOrAddressRef => {
  if (isParameterisedReplaceable(event.kind)) {
    const dTag = getTagValue(event.tags, "d") ?? ""
    if (dTag) return encodeNaddr({ kind: event.kind, pubkey: event.pubkey, dTag })
  }
  return event.id
}

const buildRefs = (raw: RenderableEvent): EventRefs => {
  const tags: ReadonlyArray<Tag> = raw.tags
  const isComment = raw.kind === KIND_COMMENT
  let rootEvent: EventOrAddressRef | null = null
  let replyToEvent: EventOrAddressRef | null = null
  const eTags: Array<string> = []
  const aTagsPositional: Array<string> = []
  const mentionedPubkeys: Array<string> = []
  let hasExplicitMarkers = false

  const quotedEventIds = new Set<string>()
  for (const tag of tags) {
    if (tag[0] === "q" && tag[1]) quotedEventIds.add(tag[1])
  }

  for (const tag of tags) {
    if (!tag[0] || !tag[1]) continue

    if (tag[0] === "E") {
      rootEvent = tag[1]
    } else if (tag[0] === "e") {
      if (isComment) {
        if (!quotedEventIds.has(tag[1])) replyToEvent = tag[1]
      } else {
        const marker = tag[3] ?? null
        if (marker) hasExplicitMarkers = true
        if (marker === "root") rootEvent = tag[1]
        else if (marker === "reply") replyToEvent = tag[1]
      }
      eTags.push(tag[1])
    } else if (tag[0] === "A") {
      const naddr = encodeAddressTag(tag[1])
      if (naddr && !rootEvent) rootEvent = naddr
    } else if (tag[0] === "a") {
      const naddr = encodeAddressTag(tag[1])
      if (!naddr) continue
      if (isComment) {
        if (!replyToEvent) replyToEvent = naddr
      } else {
        const marker = tag[3] ?? null
        if (marker) hasExplicitMarkers = true
        if (marker === "root" && !rootEvent) rootEvent = naddr
        else if (marker === "reply" && !replyToEvent) replyToEvent = naddr
        else if (!marker) aTagsPositional.push(naddr)
      }
    }

    if (tag[0] === "p") {
      mentionedPubkeys.push(tag[1])
    }
  }

  if (!isComment && !hasExplicitMarkers) {
    const threadETags = eTags.filter((id) => !quotedEventIds.has(id))
    if (!rootEvent && threadETags.length > 0) rootEvent = threadETags[0] ?? null
    if (!replyToEvent && threadETags.length > 1) replyToEvent = threadETags[threadETags.length - 1] ?? null
    if (!rootEvent && aTagsPositional.length > 0) rootEvent = aTagsPositional[0] ?? null
    if (!replyToEvent && aTagsPositional.length > 1) replyToEvent = aTagsPositional[aTagsPositional.length - 1] ?? null
  }

  if (!rootEvent && replyToEvent) rootEvent = replyToEvent

  const isReplyKind = raw.kind === KIND_SHORT_NOTE || isComment
  const isReply = isReplyKind && (rootEvent !== null || replyToEvent !== null)

  return {
    rootEvent,
    replyToEvent,
    mentionedEvents: [...new Set(eTags)].filter(isValidEventId),
    mentionedPubkeys: [...new Set(mentionedPubkeys)].filter(isValidPublicKey),
    isReply,
  }
}

const buildKindData = (kind: number, raw: RenderableEvent): KindData => {
  if (kind === KIND_REPOST || kind === KIND_GENERIC_REPOST) return buildRepostKindData(raw)
  if (kind === KIND_REACTION) return buildReactionKindData(raw)
  if (kind === KIND_HIGHLIGHT) return buildHighlightKindData(raw)
  if (kind === KIND_LONGFORM) return buildLongformKindData(raw)
  return {}
}

const buildRepostKindData = (raw: RenderableEvent): KindData => {
  let originalEventId: EventOrAddressRef | null = null

  for (const tag of raw.tags) {
    if (tag[0] === "e" && tag[1] && isValidEventId(tag[1])) {
      originalEventId = tag[1]
      break
    }
  }
  if (!originalEventId) {
    for (const tag of raw.tags) {
      if (tag[0] === "a" && tag[1]) {
        const naddr = encodeAddressTag(tag[1])
        if (naddr) {
          originalEventId = naddr
          break
        }
      }
    }
  }

  return { repost: { originalEventId } }
}

const buildReactionKindData = (raw: RenderableEvent): KindData => {
  const tags = raw.tags
  let targetEventId: EventOrAddressRef | null = null

  for (let i = tags.length - 1; i >= 0; i--) {
    const tag = tags[i]
    if (tag && tag[0] === "e" && tag[1] && isValidEventId(tag[1])) {
      targetEventId = tag[1]
      break
    }
  }
  if (!targetEventId) {
    for (let i = tags.length - 1; i >= 0; i--) {
      const tag = tags[i]
      if (tag && tag[0] === "a" && tag[1]) {
        const naddr = encodeAddressTag(tag[1])
        if (naddr) {
          targetEventId = naddr
          break
        }
      }
    }
  }

  return {
    reaction: {
      content: raw.content || DEFAULT_REACTION,
      targetEventId,
    },
  }
}

const buildHighlightKindData = (raw: RenderableEvent): KindData => {
  let context: string | null = null
  let comment: string | null = null
  let sourceUrl: string | null = null
  let sourceEventId: EventOrAddressRef | null = null

  for (const tag of raw.tags) {
    if (!tag[0] || !tag[1]) continue
    if (tag[0] === "context") context = tag[1]
    else if (tag[0] === "comment") comment = tag[1]
    else if (tag[0] === "r") sourceUrl = tag[1]
    else if (sourceEventId === null) {
      if (tag[0] === "e" && isValidEventId(tag[1])) sourceEventId = tag[1]
      else if (tag[0] === "a") sourceEventId = encodeAddressTag(tag[1])
    }
  }

  // r-tag wins over any e/a candidate captured during the same pass.
  if (sourceUrl !== null) sourceEventId = null

  return {
    highlight: {
      text: raw.content,
      context,
      comment,
      sourceUrl,
      sourceEventId,
    },
  }
}

const buildLongformKindData = (raw: RenderableEvent): KindData => {
  const tags = raw.tags
  let title: string | null = null
  let summary: string | null = null
  let image: string | null = null
  let publishedAt: number | null = null
  const topics: Array<string> = []

  for (const tag of tags) {
    if (!tag[0] || !tag[1]) continue
    if (tag[0] === "title") title = tag[1]
    else if (tag[0] === "summary") summary = tag[1]
    else if (tag[0] === "image") image = tag[1]
    else if (tag[0] === "published_at") {
      const parsed = Number(tag[1])
      if (Number.isSafeInteger(parsed)) publishedAt = parsed
    } else if (tag[0] === "t") topics.push(tag[1])
  }

  return {
    longform: { title, summary, image, publishedAt, topics },
  }
}

/** Decorate a `RenderableEvent` with derived reference data (root/reply/mentions) and kind-specific projections. */
export const transformEvent = (raw: RenderableEvent): TransformedEvent => ({
  raw,
  refs: buildRefs(raw),
  kindData: buildKindData(raw.kind, raw),
})

export type { EventRefs, HighlightData, KindData, LongformData, ReactionData, RepostData, TransformedEvent }
