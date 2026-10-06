import type { AuthChallenge } from "../value-object/auth-challenge.ts"
import { formatAddressableRef } from "../value-object/addressable-ref.ts"
import {
  KIND_APPLICATION_SPECIFIC_DATA,
  KIND_CLIENT_AUTH,
  KIND_DRAFT_WRAP,
  KIND_EVENT_DELETION,
  KIND_GENERIC_REPOST,
  KIND_HIGHLIGHT,
  KIND_METADATA,
  KIND_PRIVATE_MESSAGE,
  KIND_REACTION,
  KIND_RELAY_LIST,
  KIND_REPOST,
  KIND_TEXT_NOTE,
  KIND_ZAP_REQUEST,
  kindCategory,
} from "../value-object/kinds.ts"
import type { NostrEvent, Rumour, Tag, UnsignedEvent } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import type { ChatRoom } from "../value-object/chat-room.ts"
import type { RelayUrl } from "../value-object/relay-url.ts"
import type { HttpUrl } from "../value-object/http-url.ts"
import type { KIND_LONGFORM_CONTENT, KIND_LONGFORM_CONTENT_DRAFT } from "../value-object/kinds.ts"
import { now } from "./timestamp.ts"
import { buildRumour } from "./rumour.ts"
import { InvalidArgumentError } from "../exception/invalid-argument-error.ts"
import { isNonNegativeInteger } from "./guards.ts"
import { withContentTags } from "./content-tags.ts"
import { normaliseHashtag } from "./hashtag.ts"
import { DEFAULT_REACTION } from "./reaction.ts"
import { replyTargetRef } from "./event-analysis.ts"
import { serialiseEvent } from "./event-json.ts"
import type { Lnurl } from "./zap-address.ts"
import type { JsonSerialisable } from "../value-object/json-serialisable.ts"

/**
 * Build a kind-1 short note (NIP-10) that answers nothing; a reply is {@link buildReply}. In content order, a nostr:
 * `npub` / `nprofile` becomes a `p` tag, and a `note`, `nevent` or `naddr` becomes a `p` tag for a known author
 * followed by a NIP-18 `["q", <event-id or address>, <relay>, <pubkey if a regular event>]` tag; then hashtags become
 * `t` tags. A repeated tag is written once, where it last occurs. `createdAt` pins the `created_at`, which defaults to
 * the system clock ({@link now}).
 */
export const buildTextNote = (content: string, createdAt?: number): UnsignedEvent => ({
  kind: KIND_TEXT_NOTE,
  created_at: createdAt ?? now(),
  tags: withContentTags([], content),
  content,
})

const coordinateOf = (event: Rumour): string | null => {
  const ref = replyTargetRef(event)
  return ref.type === "address" ? formatAddressableRef(ref.address) : null
}

// Deliberate: a reaction or zap request names only an addressable target by coordinate — see shared ADR-0077
const addressableCoordinateOf = (event: Rumour): string | null =>
  kindCategory(event.kind) === "addressable" ? coordinateOf(event) : null

const isProtected = (event: Rumour): boolean => event.tags.some((tag) => tag[0] === "-" && tag.length === 1)

/**
 * Build a NIP-18 repost of `target`, found on `relay`: kind 6 for a kind 1 note, otherwise a kind 16 generic repost
 * with a `k` tag. The `e` tag carries `relay` (NIP-18: it "MUST include a relay URL"), a `p` tag names the author, and
 * a replaceable or addressable target also gets an `a` tag with its coordinate. The content is the target's JSON, its
 * seven NIP-01 fields in NIP-01 order, except for a NIP-70 protected event, whose repost stays empty.
 */
export const buildRepost = (target: NostrEvent, relay: RelayUrl): UnsignedEvent => {
  const isNote = target.kind === KIND_TEXT_NOTE
  const coordinate = coordinateOf(target)
  const tags: Array<Tag> = [["e", target.id, relay], ["p", target.pubkey]]
  if (!isNote) tags.push(["k", String(target.kind)])
  if (coordinate !== null) tags.push(["a", coordinate, relay])
  return {
    kind: isNote ? KIND_REPOST : KIND_GENERIC_REPOST,
    created_at: now(),
    tags,
    content: isProtected(target) ? "" : serialiseEvent(target),
  }
}

/**
 * Build a NIP-25 kind 7 reaction to `target`; `reaction` defaults to `+` ("like"). Tags follow the NIP's example:
 * `["e", <id>, <relay>, <author>]`, `["p", <author>, <relay>]` and `["k", <kind>]`, plus `["a", <coordinate>, <relay>,
 * <author>]` for an addressable target (NIP-25: "If the event being reacted to is an addressable event, an `a` SHOULD
 * be included"); a replaceable target is named by its `e` tag alone. `relay` is where the target can be found; without
 * one the `e` tag's relay is empty and the `p` tag has none.
 */
export const buildReaction = (
  target: Rumour,
  reaction: string = DEFAULT_REACTION,
  relay: RelayUrl | null = null,
): UnsignedEvent => {
  const hint = relay ?? ""
  const coordinate = addressableCoordinateOf(target)
  const tags: Array<Tag> = [
    ["e", target.id, hint, target.pubkey],
    hint === "" ? ["p", target.pubkey] : ["p", target.pubkey, hint],
    ["k", String(target.kind)],
  ]
  if (coordinate !== null) tags.push(["a", coordinate, hint, target.pubkey])
  return { kind: KIND_REACTION, created_at: now(), tags, content: reaction }
}

/**
 * Build `author`'s NIP-09 kind 5 deletion request for `target`, which must be a published event of theirs: an `a` tag
 * with its coordinate for a replaceable or addressable event, which asks relays to delete every version up to the
 * request's `created_at`, otherwise an `e` tag with its id, and a `k` tag naming its kind (NIP-09: requests "SHOULD
 * include a `k` tag"). Throws `InvalidArgumentError` when `target` is another author's event: a deletion request names
 * only events "that have an identical `pubkey` as the deletion request" (NIP-09, shared ADR-0086). Throws it too when
 * `target` is itself a deletion request: "Publishing a deletion request event against a deletion request has no
 * effect" (NIP-09, shared ADR-0093), so the request would be a no-op.
 */
export const buildDeletion = (author: PublicKey, target: NostrEvent): UnsignedEvent => {
  if (target.pubkey !== author) {
    throw new InvalidArgumentError("A NIP-09 deletion request can only name an event by its own author")
  }
  if (target.kind === KIND_EVENT_DELETION) {
    throw new InvalidArgumentError("A NIP-09 deletion request against a deletion request has no effect")
  }
  const coordinate = coordinateOf(target)
  const reference: Tag = coordinate === null ? ["e", target.id] : ["a", coordinate]
  return { kind: KIND_EVENT_DELETION, created_at: now(), tags: [reference, ["k", String(target.kind)]], content: "" }
}

/**
 * Build a kind-22242 NIP-42 client-authentication event responding to a relay's AUTH `challenge`.
 * Emits the `relay` and `challenge` tags the relay expects; sign it and send it back in an
 * `["AUTH", <event>]` message. The event is single-use and short-lived — build a fresh one per challenge. The
 * challenge is an {@link AuthChallenge}, so an empty one cannot be answered.
 */
export const buildClientAuth = (relay: RelayUrl, challenge: AuthChallenge): UnsignedEvent => ({
  kind: KIND_CLIENT_AUTH,
  created_at: now(),
  tags: [["relay", relay], ["challenge", challenge]],
  content: "",
})

/**
 * Build a kind-9802 highlight quoting `text` from the web page `sourceUrl` (NIP-84), with a `comment` tag unless
 * `comment` is `null`. The source is `["r", <url>, "source"]`: NIP-84 says "The source url MUST have the `source`
 * attribute", to tell it from a URL the comment mentions. It is an `HttpUrl`, the form `analyseEvent` reads it back in.
 */
export const buildHighlightFromUrl = (
  text: string,
  sourceUrl: HttpUrl,
  comment: string | null = null,
): UnsignedEvent => {
  const tags: Array<Tag> = [["r", sourceUrl, "source"]]
  if (comment !== null) tags.push(["comment", comment])
  return { kind: KIND_HIGHLIGHT, created_at: now(), tags, content: text }
}

/**
 * Build a kind-9802 highlight quoting `text` from the Nostr event `source` (NIP-84: "`a` and/or `e` tags for nostr
 * events"): its `a` coordinate when it is replaceable or addressable, its `e` id, and a `p` tag for its author.
 */
export const buildHighlightFromEvent = (text: string, source: Rumour): UnsignedEvent => {
  const coordinate = coordinateOf(source)
  const tags: Array<Tag> = coordinate === null ? [] : [["a", coordinate]]
  tags.push(["e", source.id], ["p", source.pubkey])
  return { kind: KIND_HIGHLIGHT, created_at: now(), tags, content: text }
}

/**
 * Input for {@link buildZapRequest}. `relayUrls` is where the recipient's wallet publishes the receipt, so it names at
 * least one relay.
 */
interface BuildZapRequestInput {
  readonly recipientPubkey: PublicKey
  readonly relayUrls: readonly [RelayUrl, ...ReadonlyArray<RelayUrl>]
  readonly amountMillisats: number
  readonly target?: Rumour
  readonly lnurl?: Lnurl
  readonly comment?: string
  /** Pin the `created_at`. Defaults to the system clock ({@link now}). */
  readonly createdAt?: number
}

/**
 * Build a kind-9734 zap request (NIP-57 Appendix A) for `recipientPubkey`: the `relays`, `amount` and `p` tags, the
 * recipient's `lnurl` when given, and for a zapped `target` its `e` tag, `k` tag and, when addressable, its `a`
 * coordinate (NIP-57: "`a` is an optional event coordinate that allows tipping addressable events"); a replaceable
 * target is named by its `e` tag alone. `comment` is the content. Throws `InvalidArgumentError` when
 * `amountMillisats` is not a whole number of at least 1 (NIP-57: "`amount` is the amount in _millisats_ the sender
 * intends to pay, formatted as a string"), which no receipt's invoice could match.
 */
export const buildZapRequest = (
  { recipientPubkey, relayUrls, amountMillisats, target, lnurl, comment = "", createdAt }: BuildZapRequestInput,
): UnsignedEvent => {
  if (!Number.isSafeInteger(amountMillisats) || amountMillisats < 1) {
    throw new InvalidArgumentError(`A zap request asks for a whole number of millisats, not ${amountMillisats}`)
  }
  const tags: Array<Tag> = [["relays", ...relayUrls], ["amount", String(amountMillisats)]]
  if (lnurl !== undefined) tags.push(["lnurl", lnurl])
  tags.push(["p", recipientPubkey])
  if (target !== undefined) {
    tags.push(["e", target.id], ["k", String(target.kind)])
    const coordinate = addressableCoordinateOf(target)
    if (coordinate !== null) tags.push(["a", coordinate])
  }
  return { kind: KIND_ZAP_REQUEST, created_at: createdAt ?? now(), tags, content: comment }
}

/**
 * Input for `buildLongform` — NIP-23 long-form article metadata. `kind` is `KIND_LONGFORM_CONTENT` for a published
 * article or the deprecated `KIND_LONGFORM_CONTENT_DRAFT` for a draft, whose `content` NIP-23 describes as
 * "self-encrypted nip04": the builder writes `content` as given, so a draft's caller encrypts it first. `dTag` is the
 * addressable-event identifier.
 */
interface BuildLongformInput {
  readonly kind: typeof KIND_LONGFORM_CONTENT | typeof KIND_LONGFORM_CONTENT_DRAFT
  readonly dTag: string
  readonly content: string
  readonly title?: string
  readonly summary?: string
  readonly image?: HttpUrl
  readonly topics?: ReadonlyArray<string>
  readonly publishedAt?: number
  /** Pin the `created_at`. Defaults to the system clock ({@link now}). */
  readonly createdAt?: number
}

/**
 * Build an addressable long-form article event (NIP-23) with the given `d` tag and optional metadata tags. Each topic
 * becomes a `t` tag through {@link normaliseHashtag} (NIP-24 `t` values are lowercase); empty and repeated topics are
 * dropped. An empty `dTag` is still written, since an addressable event is keyed on its `d` tag value (NIP-01). An
 * empty `title` or `summary` is written as an empty tag and an absent one is not written (shared ADR-0079); `image` is
 * an `HttpUrl`, so only an `http` or `https` URL can be written. A `publishedAt` that is not a whole number of seconds
 * of zero or more throws `InvalidArgumentError`.
 */
export const buildLongform = (
  { kind, dTag, content, title, summary, image, topics, publishedAt, createdAt }: BuildLongformInput,
): UnsignedEvent => {
  const tags: Array<Tag> = [["d", dTag]]
  if (title !== undefined) tags.push(["title", title])
  if (summary !== undefined) tags.push(["summary", summary])
  if (image !== undefined) tags.push(["image", image])
  if (publishedAt !== undefined) {
    if (!isNonNegativeInteger(publishedAt)) {
      throw new InvalidArgumentError(
        `A long-form article's published_at is a whole number of seconds, not ${publishedAt}`,
      )
    }
    tags.push(["published_at", String(publishedAt)])
  }
  for (const topic of new Set((topics ?? []).map(normaliseHashtag))) if (topic !== null) tags.push(["t", topic])
  return { kind, created_at: createdAt ?? now(), tags, content }
}

/**
 * Input for `buildDraftWrap` — a NIP-37 wrap around a draft event. `dTag` identifies the draft, `draftKind` is the
 * kind of the event the wrap carries and `content` is that draft, JSON-serialised and NIP-44-encrypted to the
 * signer's own pubkey, or an empty string to signal the draft was deleted.
 */
interface BuildDraftWrapInput {
  readonly dTag: string
  readonly draftKind: number
  readonly content: string
  /** Pin the `created_at`. Defaults to the system clock ({@link now}). */
  readonly createdAt?: number
}

/**
 * Build an addressable NIP-37 kind-31234 draft wrap: a `d` tag naming the draft, a `k` tag naming the draft's kind
 * (NIP-37: "The `k` tag is required") and `content` written as given — the caller NIP-44-encrypts the draft to its
 * own pubkey first, or passes an empty string to delete the draft. A `draftKind` that is not a whole number of zero
 * or more throws `InvalidArgumentError`.
 */
export const buildDraftWrap = ({ dTag, draftKind, content, createdAt }: BuildDraftWrapInput): UnsignedEvent => {
  if (!isNonNegativeInteger(draftKind)) {
    throw new InvalidArgumentError(`A draft wrap's k tag is a whole-number event kind, not ${draftKind}`)
  }
  return {
    kind: KIND_DRAFT_WRAP,
    created_at: createdAt ?? now(),
    tags: [["d", dTag], ["k", String(draftKind)]],
    content,
  }
}

/**
 * Build a kind-0 profile metadata event (NIP-01); `metadata` is serialised as the JSON object its content is (e.g.
 * `name`, `about`, `picture`). `metadata` is a `T & JsonSerialisable<T>`, so the compiler refuses a function, a bigint
 * and an un-narrowed `unknown`; past a cast, a value `JSON.stringify` writes as no JSON object, an array or a function
 * among them, throws `InvalidArgumentError`, and a bigint or a cycle throws `JSON.stringify`'s own `TypeError`.
 */
export const buildMetadata = <T extends object>(metadata: T & JsonSerialisable<T>): UnsignedEvent => {
  const content: string | undefined = JSON.stringify(metadata)
  if (content?.startsWith("{") !== true) {
    throw new InvalidArgumentError(`Kind-0 metadata is a JSON object, not ${content ?? typeof metadata}`)
  }
  return { kind: KIND_METADATA, created_at: now(), tags: [], content }
}

// Deliberate: a room of the sender alone is a note to self, its one receiver the sender — see shared ADR-0074
const roomTags = (room: ChatRoom): ReadonlyArray<Tag> => {
  const others = [...new Set(room.receivers)].filter((receiver) => receiver !== room.sender)
  return (others.length === 0 ? [room.sender] : others).map((receiver): Tag => ["p", receiver])
}

/**
 * Build the sender's kind-14 private direct message rumour (NIP-17) to `room`: a `p` tag for each receiver other than
 * the sender, once (NIP-17: "The set of `pubkey` + `p` tags defines a chat room"), and, when it answers `replyTo`, an
 * `e` tag naming that message (NIP-17: "An `e` tag denotes the direct parent message this post is replying to"). A
 * rumour is never signed; gift-wrap it via `buildDmGiftWraps`. A room with no member besides the sender is a note to
 * self, whose one `p` tag names the sender as its receiver (shared ADR-0074).
 */
export const buildPrivateMessage = (room: ChatRoom, content: string, replyTo: Rumour | null = null): Rumour =>
  buildRumour({
    kind: KIND_PRIVATE_MESSAGE,
    pubkey: room.sender,
    created_at: now(),
    tags: [...roomTags(room), ...(replyTo === null ? [] : [["e", replyTo.id] satisfies Tag])],
    content,
  })

// Deliberate: the target's author is p-tagged last even when it is the sender — see shared ADR-0074
/**
 * Build the sender's NIP-25 kind-7 reaction rumour to `target`, a message of a NIP-17 chat room, sent to `room`: a `p`
 * tag for each receiver other than the sender, once, so the reaction belongs to the same room as the messages it
 * answers (NIP-17: "The set of `pubkey` + `p` tags defines a chat room"), with the target's author tagged last, the
 * sender included when it wrote the target (NIP-25: "the target event `pubkey` should be last the `p` tags"),
 * `["e", <id>, "", <author>]` and `["k", <kind>]`. `reaction` defaults to `+` ("like"). In a note-to-self room the one
 * `p` tag names the sender, like {@link buildPrivateMessage}. Throws `InvalidArgumentError` when the target's author is
 * not a member of `room`, since its `p` tag would move the reaction to another room.
 */
export const buildPrivateReaction = (room: ChatRoom, target: Rumour, reaction: string = DEFAULT_REACTION): Rumour => {
  if (target.pubkey !== room.sender && !room.receivers.includes(target.pubkey)) {
    throw new InvalidArgumentError("A private reaction's target author is not a member of its room")
  }
  const receiverTags = roomTags(room).filter(([, receiver]) => receiver !== target.pubkey)
  return buildRumour({
    kind: KIND_REACTION,
    pubkey: room.sender,
    created_at: now(),
    tags: [["e", target.id, "", target.pubkey], ...receiverTags, ["p", target.pubkey], ["k", String(target.kind)]],
    content: reaction,
  })
}

/**
 * Build a kind-10002 relay list event (NIP-65) from pre-resolved `r` tags; `content` is unused by the spec and defaults
 * to empty.
 */
export const buildRelayList = (tags: ReadonlyArray<Tag>, content: string = ""): UnsignedEvent => ({
  kind: KIND_RELAY_LIST,
  created_at: now(),
  tags,
  content,
})

/**
 * Build a kind-30078 app-settings event (NIP-78) addressed by `dTag`; `content` is opaque to the spec (typically the
 * caller's encrypted payload).
 */
export const buildAppSettings = (dTag: string, content: string): UnsignedEvent => ({
  kind: KIND_APPLICATION_SPECIFIC_DATA,
  created_at: now(),
  tags: [["d", dTag]],
  content,
})

export type { BuildDraftWrapInput, BuildLongformInput, BuildZapRequestInput }
