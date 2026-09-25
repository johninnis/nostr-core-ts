import type { EventId } from "../value-object/event-id.ts"
import { isValidEventId } from "../value-object/event-id.ts"
import type { EventOrAddressRef } from "../value-object/event-or-address-ref.ts"
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
import { eventOrAddressRefFromTag } from "./event-or-address-ref.ts"
import { isParameterisedReplaceable } from "./kinds.ts"
import { getTagValue } from "./tags.ts"
import { DEFAULT_REACTION } from "./reaction.ts"

/** Reply-graph view derived from an event's tags — root/reply pointers, mentioned ids/pubkeys, and a `kind`-aware reply flag. */
interface EventRefs {
  readonly rootEvent: EventOrAddressRef | null
  readonly replyToEvent: EventOrAddressRef | null
  readonly mentionedEvents: ReadonlyArray<EventId>
  readonly mentionedPubkeys: ReadonlyArray<PublicKey>
  readonly isReply: boolean
}

/** Per-kind projection for NIP-18 reposts — the original event being reposted (`e` tag, else `a` tag), or `null` if neither was present. */
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

/**
 * The {@link EventOrAddressRef} a reply uses to point at `event`: its coordinate for an addressable
 * (parameterised-replaceable) event with a `d` tag, otherwise its event id. This is the value `transformEvent`
 * derives as a reply's `rootEvent` / `replyToEvent` when the reply tags `event`.
 */
export const replyTargetRef = (event: RenderableEvent): EventOrAddressRef => {
  if (isParameterisedReplaceable(event.kind)) {
    const dTag = getTagValue(event.tags, "d") ?? ""
    if (dTag) return { type: "address", address: { kind: event.kind, pubkey: event.pubkey, dTag } }
  }
  return { type: "event", id: event.id }
}

const buildRefs = (raw: RenderableEvent): EventRefs => {
  const tags: ReadonlyArray<Tag> = raw.tags
  const isComment = raw.kind === KIND_COMMENT
  let rootEvent: EventOrAddressRef | null = null
  let replyToEvent: EventOrAddressRef | null = null
  const eTags: Array<string> = []
  const eRefsPositional: Array<EventOrAddressRef> = []
  const aRefsPositional: Array<EventOrAddressRef> = []
  const mentionedPubkeys: Array<string> = []
  let hasExplicitMarkers = false

  const quotedEventIds = new Set<string>()
  for (const tag of tags) {
    if (tag[0] === "q" && tag[1]) quotedEventIds.add(tag[1])
  }

  for (const tag of tags) {
    if (!tag[0] || !tag[1]) continue
    const ref = eventOrAddressRefFromTag(tag)

    if (tag[0] === "E") {
      if (ref) rootEvent = ref
    } else if (tag[0] === "e") {
      const isQuoted = quotedEventIds.has(tag[1])
      if (isComment) {
        if (ref && !isQuoted) replyToEvent = ref
      } else {
        const marker = tag[3] ?? null
        if (marker) hasExplicitMarkers = true
        if (ref && marker === "root") rootEvent = ref
        else if (ref && marker === "reply") replyToEvent = ref
        else if (ref && !isQuoted) eRefsPositional.push(ref)
      }
      eTags.push(tag[1])
    } else if (tag[0] === "A") {
      if (ref && !rootEvent) rootEvent = ref
    } else if (tag[0] === "a") {
      if (!ref) continue
      if (isComment) {
        if (!replyToEvent) replyToEvent = ref
      } else {
        const marker = tag[3] ?? null
        if (marker) hasExplicitMarkers = true
        if (marker === "root" && !rootEvent) rootEvent = ref
        else if (marker === "reply" && !replyToEvent) replyToEvent = ref
        else if (!marker) aRefsPositional.push(ref)
      }
    }

    if (tag[0] === "p") {
      mentionedPubkeys.push(tag[1])
    }
  }

  if (!isComment && !hasExplicitMarkers) {
    if (!rootEvent) rootEvent = eRefsPositional[0] ?? null
    if (!replyToEvent && eRefsPositional.length > 1) replyToEvent = eRefsPositional.at(-1) ?? null
    if (!rootEvent) rootEvent = aRefsPositional[0] ?? null
    if (!replyToEvent && aRefsPositional.length > 1) replyToEvent = aRefsPositional.at(-1) ?? null
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

const firstRefTagged = (tags: ReadonlyArray<Tag>, name: "e" | "a"): EventOrAddressRef | null => {
  for (const tag of tags) {
    if (tag[0] !== name) continue
    const ref = eventOrAddressRefFromTag(tag)
    if (ref) return ref
  }
  return null
}

const buildKindData = (kind: number, raw: RenderableEvent): KindData => {
  if (kind === KIND_REPOST || kind === KIND_GENERIC_REPOST) return buildRepostKindData(raw)
  if (kind === KIND_REACTION) return buildReactionKindData(raw)
  if (kind === KIND_HIGHLIGHT) return buildHighlightKindData(raw)
  if (kind === KIND_LONGFORM) return buildLongformKindData(raw)
  return {}
}

const buildRepostKindData = (raw: RenderableEvent): KindData => ({
  repost: { originalEventId: firstRefTagged(raw.tags, "e") ?? firstRefTagged(raw.tags, "a") },
})

const buildReactionKindData = (raw: RenderableEvent): KindData => {
  const newestFirst = raw.tags.toReversed()
  return {
    reaction: {
      content: raw.content || DEFAULT_REACTION,
      targetEventId: firstRefTagged(newestFirst, "e") ?? firstRefTagged(newestFirst, "a"),
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
    else if (sourceEventId === null && (tag[0] === "e" || tag[0] === "a")) sourceEventId = eventOrAddressRefFromTag(tag)
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
