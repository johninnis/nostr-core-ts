import type { EventOrAddressRef } from "../value-object/event-or-address-ref.ts"
import type { ExternalContentRef, ThreadRef } from "../value-object/thread-ref.ts"
import type { Rumour, Tag } from "../value-object/nostr-event.ts"
import {
  isRepostKind,
  KIND_COMMENT,
  KIND_HIGHLIGHT,
  KIND_LONGFORM_CONTENT,
  KIND_REACTION,
  KIND_TEXT_NOTE,
  kindCategory,
} from "../value-object/kinds.ts"
import { formatEventOrAddressRef } from "../value-object/event-or-address-ref.ts"
import { eventOrAddressRefFromTag } from "./event-or-address-ref.ts"
import { parseDecimalInteger } from "./decimal.ts"
import { normaliseHashtag } from "./hashtag.ts"
import type { HttpUrl } from "../value-object/http-url.ts"
import { parseHttpUrl } from "../value-object/http-url.ts"
import { soleValue } from "../value-object/sole-tag-value.ts"
import { extractTagValues, nip10Marker, soleTagValue } from "./tags.ts"
import { getDTag } from "./replaceable.ts"
import { DEFAULT_REACTION } from "./reaction.ts"

/**
 * Reply-graph view derived from an event's tags — root/reply pointers and a `kind`-aware reply flag. A pointer is an
 * event or an address; a NIP-22 comment's can also be the external content its `I` / `i` names.
 */
interface ReplyChain {
  readonly rootEvent: ThreadRef | null
  readonly replyToEvent: ThreadRef | null
  readonly isReply: boolean
}

/**
 * Kind metadata of a NIP-18 repost — `original`, the event it reposts (its one `e` target, else its one `a` target), or
 * `null` when it names none.
 */
interface RepostMetadata {
  readonly type: "repost"
  readonly original: EventOrAddressRef | null
}

/** Kind metadata of a NIP-25 reaction — the reaction's wire content and the target being reacted to. */
interface ReactionMetadata {
  readonly type: "reaction"
  /**
   * The reaction as written (`event.content`), with empty content read as `+`, which NIP-25 treats the same way: a
   * like.
   */
  readonly content: string
  readonly target: EventOrAddressRef | null
}

/**
 * Kind metadata of a NIP-84 highlight — the highlighted text, surrounding context, caller comment, and the source URL
 * or quoted event. The source URL is the one web (`http` / `https`) URL the `r` tags marked `source` name, else the one
 * web URL the `r` tags not marked `mention` name, read through {@link parseHttpUrl} and held as the `HttpUrl` it gives:
 * an `r` tag holding text, another scheme or a value that does not parse is never the source (NIP-84: `r` tags "may
 * contain a URL or text"), a URL the comment mentions is never the source, and tags naming different URLs name none
 * (shared ADR-0014, shared ADR-0087).
 */
interface HighlightMetadata {
  readonly type: "highlight"
  readonly text: string
  readonly context: string | null
  readonly comment: string | null
  readonly sourceUrl: HttpUrl | null
  readonly source: EventOrAddressRef | null
}

/**
 * Kind metadata of a NIP-23 long-form article — title, summary, image, optional publish timestamp, and topic (`t`)
 * tags. The image is an `HttpUrl`, `null` when its tag is absent or is not an `http` or `https` URL. An article whose
 * `d` tags disagree has no identifier and so no metadata (shared ADR-0014).
 */
interface LongformMetadata {
  readonly type: "longform"
  readonly title: string | null
  readonly summary: string | null
  readonly image: HttpUrl | null
  readonly publishedAt: number | null
  readonly topics: ReadonlyArray<string>
}

/** The kind metadata on `AnalysedEvent.kindData`, discriminated by `type`. */
type KindMetadata = RepostMetadata | ReactionMetadata | HighlightMetadata | LongformMetadata

/**
 * What `analyseEvent` reads from an event: the event itself (`raw`), its reply chain (`refs`), and its kind metadata
 * (`kindData`, `null` for kinds without any, and for a long-form article whose `d` tags disagree).
 */
interface AnalysedEvent {
  readonly raw: Rumour
  readonly refs: ReplyChain
  readonly kindData: KindMetadata | null
}

const coordinateIdentifier = (event: Rumour): string | null => {
  const category = kindCategory(event.kind)
  if (category === "replaceable") return ""
  return category === "addressable" ? getDTag(event.tags) : null
}

/**
 * The {@link EventOrAddressRef} that points at `event`: its NIP-01 coordinate for a replaceable event (`kind:pubkey:`)
 * or an addressable one (`kind:pubkey:d`, an absent `d` tag addressing as the empty string), otherwise its event id. An
 * addressable event whose `d` tags disagree has no one coordinate and is named by its id. This is the value
 * `analyseEvent` derives as a reply's `rootEvent` / `replyToEvent` when the reply tags `event`, and the coordinate
 * every builder writes in an `a` / `A` tag.
 */
export const replyTargetRef = (event: Rumour): EventOrAddressRef => {
  const dTag = coordinateIdentifier(event)
  return dTag === null
    ? { type: "event", id: event.id }
    : { type: "address", address: { kind: event.kind, pubkey: event.pubkey, dTag } }
}

interface ThreadPointers {
  readonly rootEvent: ThreadRef | null
  readonly replyToEvent: ThreadRef | null
}

const soleRef = (tags: ReadonlyArray<Tag>): EventOrAddressRef | null =>
  soleValue(tags.flatMap((tag) => eventOrAddressRefFromTag(tag) ?? []), formatEventOrAddressRef).value

const soleRefTagged = (tags: ReadonlyArray<Tag>, name: string): EventOrAddressRef | null =>
  soleRef(tags.filter((tag) => tag[0] === name))

const soleNonEmptyValue = (tags: ReadonlyArray<Tag>, name: string): string | null =>
  soleTagValue(tags, name).value || null

const webPageOf = (value: string | undefined): HttpUrl | null => value === undefined ? null : parseHttpUrl(value)

// Deliberate: one claim among the tags' web pages, in one form, so tag order never picks one — see shared ADR-0090
const soleWebPageHint = (tags: ReadonlyArray<Tag>, idTag: "I" | "i"): HttpUrl | null =>
  soleValue(tags.filter((tag) => tag[0] === idTag).flatMap((tag) => webPageOf(tag[2]) ?? [])).value

const externalContentRef = (
  tags: ReadonlyArray<Tag>,
  idTag: "I" | "i",
  kindTag: "K" | "k",
): ExternalContentRef | null => {
  const id = soleNonEmptyValue(tags, idTag)
  const kind = soleNonEmptyValue(tags, kindTag)
  return id === null || kind === null ? null : { type: "external", id, kind, hint: soleWebPageHint(tags, idTag) }
}

const commentPointers = (tags: ReadonlyArray<Tag>): ThreadPointers => ({
  rootEvent: soleRefTagged(tags, "A") ?? soleRefTagged(tags, "E") ?? externalContentRef(tags, "I", "K"),
  replyToEvent: soleRefTagged(tags, "a") ?? soleRefTagged(tags, "e") ?? externalContentRef(tags, "i", "k"),
})

interface ShortNoteThreadTags {
  readonly root: Tag | null
  readonly parent: Tag | null
}

const soleTag = (tags: ReadonlyArray<Tag>): Tag | null => soleRef(tags) === null ? null : tags[0] ?? null

// Deliberate: an undefined marker reads as no marker and q tags play no part — see shared ADR-0012
/**
 * The `e` tags a kind 1 note threads by: `root`, the tag naming its root, and `parent`, the tag naming the event it
 * answers, each `null` when the note names none, read as {@link analyseEvent} reads them (shared ADR-0012). Where
 * several tags agree on one root or one parent, it is the first of them.
 */
export const shortNoteThreadTags = (tags: ReadonlyArray<Tag>): ShortNoteThreadTags => {
  const eTags = tags.filter((tag) => tag[0] === "e" && eventOrAddressRefFromTag(tag) !== null)
  const hasMarkers = eTags.some((tag) => nip10Marker(tag) !== null)

  if (hasMarkers) {
    return {
      root: soleTag(eTags.filter((tag) => nip10Marker(tag) === "root")),
      parent: soleTag(eTags.filter((tag) => nip10Marker(tag) === "reply")),
    }
  }

  return { root: eTags.length > 1 ? eTags[0] ?? null : null, parent: eTags.at(-1) ?? null }
}

const refOf = (tag: Tag | null): EventOrAddressRef | null => tag === null ? null : eventOrAddressRefFromTag(tag)

const shortNotePointers = (tags: ReadonlyArray<Tag>): ThreadPointers => {
  const { root, parent } = shortNoteThreadTags(tags)
  return { rootEvent: refOf(root), replyToEvent: refOf(parent) }
}

const buildRefs = (raw: Rumour): ReplyChain => {
  const tags: ReadonlyArray<Tag> = raw.tags
  const isComment = raw.kind === KIND_COMMENT
  const { rootEvent, replyToEvent } = isComment ? commentPointers(tags) : shortNotePointers(tags)

  const threads = raw.kind === KIND_TEXT_NOTE || isComment
  const isReply = threads && (rootEvent !== null || replyToEvent !== null)

  return { rootEvent, replyToEvent, isReply }
}

const lastRefTagged = (tags: ReadonlyArray<Tag>, name: "e" | "a"): EventOrAddressRef | null =>
  tags.filter((tag) => tag[0] === name).map((tag) => eventOrAddressRefFromTag(tag)).findLast((ref) => ref !== null) ??
    null

const buildKindMetadata = (kind: number, raw: Rumour): KindMetadata | null => {
  if (isRepostKind(kind)) return buildRepostMetadata(raw)
  if (kind === KIND_REACTION) return buildReactionMetadata(raw)
  if (kind === KIND_HIGHLIGHT) return buildHighlightMetadata(raw)
  if (kind === KIND_LONGFORM_CONTENT) return getDTag(raw.tags) === null ? null : buildLongformMetadata(raw)
  return null
}

const buildRepostMetadata = (raw: Rumour): RepostMetadata => ({
  type: "repost",
  original: soleRefTagged(raw.tags, "e") ?? soleRefTagged(raw.tags, "a"),
})

const buildReactionMetadata = (raw: Rumour): ReactionMetadata => ({
  type: "reaction",
  content: raw.content || DEFAULT_REACTION,
  target: lastRefTagged(raw.tags, "e") ?? lastRefTagged(raw.tags, "a"),
})

interface MarkedWebPage {
  readonly page: HttpUrl
  readonly marker: string | undefined
}

// Deliberate: an r tag is a source only as a parsed web URL, compared in one form — see shared ADR-0087
const highlightSourceUrl = (tags: ReadonlyArray<Tag>): HttpUrl | null => {
  const pages = tags.flatMap((tag): ReadonlyArray<MarkedWebPage> => {
    const page = tag[0] === "r" ? webPageOf(tag[1]) : null
    return page === null ? [] : [{ page, marker: tag[2] }]
  })
  const marked = pages.filter(({ marker }) => marker === "source")
  const read = marked.length > 0 ? marked : pages.filter(({ marker }) => marker !== "mention")
  return soleValue(read.map(({ page }) => page)).value
}

const buildHighlightMetadata = (raw: Rumour): HighlightMetadata => {
  const sourceUrl = highlightSourceUrl(raw.tags)
  return {
    type: "highlight",
    text: raw.content,
    context: soleTagValue(raw.tags, "context").value,
    comment: soleTagValue(raw.tags, "comment").value,
    sourceUrl,
    source: sourceUrl === null ? soleRefTagged(raw.tags, "a") ?? soleRefTagged(raw.tags, "e") : null,
  }
}

const publishedAtOf = (tags: ReadonlyArray<Tag>): number | null => {
  const value = soleTagValue(tags, "published_at").value
  return value === null ? null : parseDecimalInteger(value)
}

const topicsOf = (tags: ReadonlyArray<Tag>): ReadonlyArray<string> => [
  ...new Set(extractTagValues(tags, "t").flatMap((topic) => normaliseHashtag(topic) ?? [])),
]

const buildLongformMetadata = (raw: Rumour): LongformMetadata => ({
  type: "longform",
  title: soleTagValue(raw.tags, "title").value,
  summary: soleTagValue(raw.tags, "summary").value,
  image: parseHttpUrl(soleTagValue(raw.tags, "image").value),
  publishedAt: publishedAtOf(raw.tags),
  topics: topicsOf(raw.tags),
})

/** Analyse `raw`: read its NIP-10 / NIP-22 reply chain and the metadata its kind defines. */
export const analyseEvent = (raw: Rumour): AnalysedEvent => ({
  raw,
  refs: buildRefs(raw),
  kindData: buildKindMetadata(raw.kind, raw),
})

export type {
  AnalysedEvent,
  HighlightMetadata,
  KindMetadata,
  LongformMetadata,
  ReactionMetadata,
  ReplyChain,
  RepostMetadata,
}
