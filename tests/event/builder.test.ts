import { assertEquals, assertExists } from "@std/assert"
import {
  buildClientAuth,
  buildDeletion,
  buildHighlightFromEvent,
  buildHighlightFromUrl,
  buildPrivateMessage,
  buildReaction,
  buildRepost,
  buildTextNote,
  buildZapRequest,
} from "../../src/domain/service/builder.ts"
import { formatAddressableRef } from "../../src/domain/value-object/addressable-ref.ts"
import { encodeEventIdToNote, encodeNaddr, encodeNevent, encodePubkeyToNpub } from "../../src/domain/service/bech32.ts"
import {
  KIND_CLIENT_AUTH,
  KIND_DELETION,
  KIND_GENERIC_REPOST,
  KIND_HIGHLIGHT,
  KIND_LONGFORM,
  KIND_PRIVATE_MESSAGE,
  KIND_REACTION,
  KIND_REPOST,
  KIND_SHORT_NOTE,
  KIND_ZAP_REQUEST,
} from "../../src/domain/value-object/kinds.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"
import { parseEventId } from "../../src/domain/value-object/event-id.ts"
import { parseRelayUrl } from "../../src/domain/value-object/relay-url.ts"
import { parseSig } from "../../src/domain/value-object/sig.ts"

const pk1 = parsePublicKey("a".repeat(64))
const pk2 = parsePublicKey("b".repeat(64))
const eid1 = parseEventId("c".repeat(64))
const eid2 = parseEventId("d".repeat(64))

Deno.test("buildTextNote - creates kind 1 event with content", () => {
  const event = buildTextNote("Hello world")
  assertEquals(event.kind, KIND_SHORT_NOTE)
  assertEquals(event.content, "Hello world")
})

Deno.test("buildTextNote - uses provided createdAt timestamp", () => {
  const event = buildTextNote("test", null, 1700000000)
  assertEquals(event.created_at, 1700000000)
})

Deno.test("buildTextNote - extracts hashtags from content", () => {
  const event = buildTextNote("Hello #nostr and #bitcoin", null, 1700000000)
  const tTags = event.tags.filter((t) => t[0] === "t")
  assertEquals(tTags.length, 2)
  const [firstTag, secondTag] = tTags
  assertExists(firstTag)
  assertExists(secondTag)
  assertEquals(firstTag[1], "nostr")
  assertEquals(secondTag[1], "bitcoin")
})

Deno.test("buildTextNote - does not extract hashtags from HTML entities", () => {
  const event = buildTextNote("&#123; test", null, 1700000000)
  const tTags = event.tags.filter((t) => t[0] === "t")
  assertEquals(tTags.length, 0)
})

Deno.test("buildTextNote - deduplicates hashtags", () => {
  const event = buildTextNote("#nostr #Nostr #NOSTR", null, 1700000000)
  const tTags = event.tags.filter((t) => t[0] === "t")
  assertEquals(tTags.length, 1)
  const [firstTag] = tTags
  assertExists(firstTag)
  assertEquals(firstTag[1], "nostr")
})

Deno.test("buildTextNote - creates reply with NIP-10 root e-tag", () => {
  const event = buildTextNote("reply text", {
    replyToId: eid1,
    replyToAuthorPubkey: pk1,
  }, 1700000000)
  assertEquals(event.kind, KIND_SHORT_NOTE)
  const eTag = event.tags.find((t) => t[0] === "e" && t[3] === "root")
  assertEquals(eTag?.[1], eid1)
  assertEquals(eTag?.[3], "root")
})

Deno.test("buildTextNote - includes p-tag for reply author", () => {
  const event = buildTextNote("reply text", {
    replyToId: eid1,
    replyToAuthorPubkey: pk1,
  }, 1700000000)
  const pTags = event.tags.filter((t) => t[0] === "p")
  assertEquals(pTags.some((t) => t[1] === pk1), true)
})

Deno.test("buildTextNote - creates root and reply e-tags for threaded reply", () => {
  const event = buildTextNote("deep reply", {
    replyToId: eid2,
    replyToAuthorPubkey: pk2,
    rootEventId: eid1,
  }, 1700000000)
  const rootTag = event.tags.find((t) => t[0] === "e" && t[3] === "root")
  assertEquals(rootTag?.[1], eid1)
  const replyTag = event.tags.find((t) => t[0] === "e" && t[3] === "reply")
  assertEquals(replyTag?.[1], eid2)
})

Deno.test("buildTextNote - reply to an addressable parent uses an a-tag root, not an e-tag", () => {
  const naddr = encodeNaddr({ kind: KIND_LONGFORM, pubkey: pk1, dTag: "my-article" })
  const coord = formatAddressableRef({ kind: KIND_LONGFORM, pubkey: pk1, dTag: "my-article" })
  const event = buildTextNote("Amen", {
    replyToId: naddr,
    replyToAuthorPubkey: pk1,
  }, 1700000000)
  const aTag = event.tags.find((t) => t[0] === "a" && t[3] === "root")
  assertEquals(aTag?.[1], coord)
  assertEquals(event.tags.some((t) => t[0] === "e"), false)
})

Deno.test("buildTextNote - reply to a note within an addressable thread mixes a-tag root and e-tag reply", () => {
  const naddr = encodeNaddr({ kind: KIND_LONGFORM, pubkey: pk1, dTag: "my-article" })
  const coord = formatAddressableRef({ kind: KIND_LONGFORM, pubkey: pk1, dTag: "my-article" })
  const event = buildTextNote("nested", {
    replyToId: eid2,
    replyToAuthorPubkey: pk2,
    rootEventId: naddr,
  }, 1700000000)
  const rootTag = event.tags.find((t) => t[3] === "root")
  assertEquals(rootTag?.[0], "a")
  assertEquals(rootTag?.[1], coord)
  const replyTag = event.tags.find((t) => t[3] === "reply")
  assertEquals(replyTag?.[0], "e")
  assertEquals(replyTag?.[1], eid2)
})

Deno.test("buildTextNote - includes thread pubkeys without duplicates", () => {
  const event = buildTextNote("reply", {
    replyToId: eid1,
    replyToAuthorPubkey: pk1,
    threadPubkeys: [pk2, pk2, pk1],
  }, 1700000000)
  const pTags = event.tags.filter((t) => t[0] === "p")
  const pubkeys = pTags.map((t) => t[1])
  assertEquals(pubkeys.includes(pk2), true)
  assertEquals(pubkeys.includes(pk1), true)
})

Deno.test("buildTextNote - reply includes relay hint in root e-tag", () => {
  const event = buildTextNote("reply with relay", {
    replyToId: eid1,
    replyToAuthorPubkey: pk1,
    rootRelayHint: "wss://relay.example.com",
  }, 1700000000)
  const rootTag = event.tags.find((t) => t[0] === "e" && t[3] === "root")
  assertEquals(rootTag?.[1], eid1)
  assertEquals(rootTag?.[2], "wss://relay.example.com")
})

Deno.test("buildTextNote - threaded reply includes root and reply e-tags with markers", () => {
  const event = buildTextNote("deep reply", {
    replyToId: eid2,
    replyToAuthorPubkey: pk2,
    rootEventId: eid1,
    rootAuthorPubkey: pk1,
  }, 1700000000)
  const rootTag = event.tags.find((t) => t[0] === "e" && t[3] === "root")
  assertEquals(rootTag?.[1], eid1)
  const replyTag = event.tags.find((t) => t[0] === "e" && t[3] === "reply")
  assertEquals(replyTag?.[1], eid2)
  assertEquals(event.tags.find((t) => t[0] === "k"), undefined)
})

Deno.test("buildTextNote - threaded reply p-tags both reply author and root author", () => {
  const event = buildTextNote("deep reply", {
    replyToId: eid2,
    replyToAuthorPubkey: pk2,
    rootEventId: eid1,
    rootAuthorPubkey: pk1,
  }, 1700000000)
  const pTags = event.tags.filter((t) => t[0] === "p").map((t) => t[1])
  assertEquals(pTags.includes(pk1), true)
  assertEquals(pTags.includes(pk2), true)
})

Deno.test("buildTextNote - threaded reply does not duplicate root author already in threadPubkeys", () => {
  const event = buildTextNote("deep reply", {
    replyToId: eid2,
    replyToAuthorPubkey: pk2,
    rootEventId: eid1,
    rootAuthorPubkey: pk1,
    threadPubkeys: [pk1],
  }, 1700000000)
  const pk1Count = event.tags.filter((t) => t[0] === "p" && t[1] === pk1).length
  assertEquals(pk1Count, 1)
})

Deno.test("buildTextNote - reply p-tag includes relay hint", () => {
  const event = buildTextNote("reply", {
    replyToId: eid1,
    replyToAuthorPubkey: pk1,
    rootRelayHint: "wss://write.relay.io",
  }, 1700000000)
  const pTag = event.tags.find((t) => t[0] === "p")
  assertEquals(pTag?.[1], pk1)
  assertEquals(pTag?.[2], "wss://write.relay.io")
})

Deno.test("buildTextNote - adds a p-tag for an embedded npub reference", () => {
  const pubkey = parsePublicKey("1".repeat(64))
  const npub = encodePubkeyToNpub(pubkey)
  const event = buildTextNote(`hi nostr:${npub}`)
  const pTags = event.tags.filter((t) => t[0] === "p")
  if (!pTags.some((t) => t[1] === pubkey)) throw new Error("expected p tag for npub")
})

Deno.test("buildTextNote - adds a q tag (no e mention) for an embedded note reference", () => {
  const eventId = parseEventId("2".repeat(64))
  const note = encodeEventIdToNote(eventId)
  const event = buildTextNote(`see nostr:${note}`)
  const qTags = event.tags.filter((t) => t[0] === "q")
  const eTags = event.tags.filter((t) => t[0] === "e")
  if (!qTags.some((t) => t[1] === eventId)) throw new Error("expected q tag")
  if (eTags.length > 0) throw new Error("quoted events are q-only per NIP-18; no e mention tag")
})

Deno.test("buildTextNote - adds q and p tags (no e mention) for an embedded nevent reference", () => {
  const eventId = parseEventId("3".repeat(64))
  const pubkey = parsePublicKey("4".repeat(64))
  const nevent = encodeNevent(eventId, { authorPubkey: pubkey })
  const event = buildTextNote(`x nostr:${nevent}`)
  if (!event.tags.some((t) => t[0] === "q" && t[1] === eventId)) throw new Error("expected q tag")
  if (event.tags.some((t) => t[0] === "e")) throw new Error("quoted events are q-only per NIP-18; no e tag")
  if (!event.tags.some((t) => t[0] === "p" && t[1] === pubkey)) throw new Error("expected p tag")
})

Deno.test("buildTextNote - adds an a-tag and a p-tag for an embedded naddr reference", () => {
  const pubkey = parsePublicKey("5".repeat(64))
  const naddr = encodeNaddr({ kind: 30023, pubkey, dTag: "my-post" })
  const event = buildTextNote(`q nostr:${naddr}`)
  if (!event.tags.some((t) => t[0] === "a" && t[1] === `30023:${pubkey}:my-post`)) throw new Error("expected a tag")
  if (!event.tags.some((t) => t[0] === "p" && t[1] === pubkey)) throw new Error("expected p tag")
})

Deno.test("buildTextNote - empty content produces no hashtag tags", () => {
  const event = buildTextNote("", null, 1700000000)
  assertEquals(event.tags.length, 0)
})

Deno.test("buildRepost - creates kind 6 event for a kind-1 note", () => {
  const event = buildRepost({ eventId: eid1, pubkey: pk1, kind: KIND_SHORT_NOTE })
  assertEquals(event.kind, KIND_REPOST)
})

Deno.test("buildRepost - includes e-tag and p-tag", () => {
  const event = buildRepost({ eventId: eid1, pubkey: pk1, kind: KIND_SHORT_NOTE })
  const [eTag, pTag] = event.tags
  assertExists(eTag)
  assertExists(pTag)
  assertEquals(eTag[0], "e")
  assertEquals(eTag[1], eid1)
  assertEquals(pTag[0], "p")
  assertEquals(pTag[1], pk1)
})

Deno.test("buildRepost - a non-note target is a kind-16 generic repost with a k tag", () => {
  const event = buildRepost({ eventId: eid1, pubkey: pk1, kind: KIND_HIGHLIGHT })
  assertEquals(event.kind, KIND_GENERIC_REPOST)
  assertEquals(event.tags.some((t) => t[0] === "k" && t[1] === String(KIND_HIGHLIGHT)), true)
  assertEquals(event.tags.some((t) => t[0] === "a"), false)
})

Deno.test("buildRepost - an addressable target is a kind-16 repost with a, k and e tags", () => {
  const event = buildRepost({ eventId: eid1, pubkey: pk1, kind: KIND_LONGFORM, dTag: "my-article" })
  assertEquals(event.kind, KIND_GENERIC_REPOST)
  assertEquals(event.tags.some((t) => t[0] === "e" && t[1] === eid1), true)
  assertEquals(event.tags.some((t) => t[0] === "k" && t[1] === String(KIND_LONGFORM)), true)
  assertEquals(event.tags.some((t) => t[0] === "a" && t[1] === `${KIND_LONGFORM}:${pk1}:my-article`), true)
})

Deno.test("buildRepost - serialises raw event as content when provided", () => {
  const rawEvent = {
    id: eid1,
    pubkey: pk1,
    kind: 1,
    content: "",
    tags: [],
    created_at: 0,
    sig: parseSig("a".repeat(128)),
  }
  const event = buildRepost({ eventId: eid1, pubkey: pk1, kind: KIND_SHORT_NOTE }, rawEvent)
  assertEquals(event.content, JSON.stringify(rawEvent))
})

Deno.test("buildRepost - uses empty content when no raw event", () => {
  const event = buildRepost({ eventId: eid1, pubkey: pk1, kind: KIND_SHORT_NOTE })
  assertEquals(event.content, "")
})

Deno.test("buildReaction - creates kind 7 event with default + reaction", () => {
  const event = buildReaction({ eventId: eid1, pubkey: pk1, kind: KIND_SHORT_NOTE })
  assertEquals(event.kind, KIND_REACTION)
  assertEquals(event.content, "+")
})

Deno.test("buildReaction - uses custom reaction content", () => {
  const event = buildReaction({ eventId: eid1, pubkey: pk1, kind: KIND_SHORT_NOTE }, "🤙")
  assertEquals(event.content, "🤙")
})

Deno.test("buildReaction - includes e-tag and p-tag", () => {
  const event = buildReaction({ eventId: eid1, pubkey: pk1, kind: KIND_SHORT_NOTE })
  const [eTag, pTag] = event.tags
  assertExists(eTag)
  assertExists(pTag)
  assertEquals(eTag[0], "e")
  assertEquals(eTag[1], eid1)
  assertEquals(pTag[0], "p")
  assertEquals(pTag[1], pk1)
})

Deno.test("buildReaction - an addressable target also carries an a tag", () => {
  const event = buildReaction({ eventId: eid1, pubkey: pk1, kind: KIND_LONGFORM, dTag: "my-article" }, "🔥")
  assertEquals(event.tags.some((t) => t[0] === "e" && t[1] === eid1), true)
  assertEquals(event.tags.some((t) => t[0] === "a" && t[1] === `${KIND_LONGFORM}:${pk1}:my-article`), true)
})

Deno.test("buildDeletion - event target creates kind 5 with e and k tags", () => {
  const event = buildDeletion({ eventId: eid1, kind: KIND_SHORT_NOTE })
  assertEquals(event.kind, KIND_DELETION)
  assertEquals(event.tags.length, 2)
  assertEquals(event.tags[0], ["e", eid1])
  assertEquals(event.tags[1], ["k", String(KIND_SHORT_NOTE)])
  assertEquals(event.content, "")
})

Deno.test("buildDeletion - addressable target creates kind 5 with a and k tags", () => {
  const event = buildDeletion({ kind: 30000, pubkey: pk1, dTag: "my-list" })
  assertEquals(event.kind, KIND_DELETION)
  assertEquals(event.tags.length, 2)
  assertEquals(event.tags[0], ["a", `30000:${pk1}:my-list`])
  assertEquals(event.tags[1], ["k", "30000"])
  assertEquals(event.content, "")
})

Deno.test("buildClientAuth - creates kind 22242 with relay and challenge tags", () => {
  const relay = parseRelayUrl("wss://relay.example.com")
  const event = buildClientAuth(relay, "challenge-123")
  assertEquals(event.kind, KIND_CLIENT_AUTH)
  assertEquals(event.tags.length, 2)
  assertEquals(event.tags[0], ["relay", relay])
  assertEquals(event.tags[1], ["challenge", "challenge-123"])
  assertEquals(event.content, "")
})

Deno.test("buildHighlightFromUrl - creates kind 9802 event", () => {
  const event = buildHighlightFromUrl("highlighted text", "https://example.com")
  assertEquals(event.kind, KIND_HIGHLIGHT)
  assertEquals(event.content, "highlighted text")
})

Deno.test("buildHighlightFromUrl - includes r-tag for source URL", () => {
  const event = buildHighlightFromUrl("text", "https://example.com")
  const [rTag] = event.tags
  assertExists(rTag)
  assertEquals(rTag[0], "r")
  assertEquals(rTag[1], "https://example.com")
})

Deno.test("buildHighlightFromUrl - includes comment tag when provided", () => {
  const event = buildHighlightFromUrl("text", "https://example.com", "my thoughts")
  const commentTag = event.tags.find((t) => t[0] === "comment")
  assertExists(commentTag)
  assertEquals(commentTag[1], "my thoughts")
})

Deno.test("buildHighlightFromUrl - omits comment tag when null", () => {
  const event = buildHighlightFromUrl("text", "https://example.com")
  const commentTag = event.tags.find((t) => t[0] === "comment")
  assertEquals(commentTag, undefined)
})

Deno.test("buildHighlightFromEvent - creates kind 9802 event with a-tag", () => {
  const event = buildHighlightFromEvent("text", { kind: KIND_LONGFORM, pubkey: pk1, dTag: "my-article" })
  assertEquals(event.kind, KIND_HIGHLIGHT)
  assertEquals(event.content, "text")
  const aTag = event.tags.find((t) => t[0] === "a")
  assertExists(aTag)
  assertEquals(aTag[1], formatAddressableRef({ kind: KIND_LONGFORM, pubkey: pk1, dTag: "my-article" }))
})

Deno.test("buildHighlightFromEvent - includes p-tag for author", () => {
  const event = buildHighlightFromEvent("text", { kind: KIND_LONGFORM, pubkey: pk1, dTag: "slug" })
  const pTag = event.tags.find((t) => t[0] === "p")
  assertExists(pTag)
  assertEquals(pTag[1], pk1)
})

Deno.test("buildZapRequest - creates kind 9734 event", () => {
  const event = buildZapRequest({ recipientPubkey: pk1, relayUrls: ["wss://relay.damus.io"], amountMillisats: 21000 })
  assertEquals(event.kind, KIND_ZAP_REQUEST)
})

Deno.test("buildZapRequest - includes p-tag for recipient", () => {
  const event = buildZapRequest({ recipientPubkey: pk1, relayUrls: ["wss://relay.damus.io"], amountMillisats: 21000 })
  const pTag = event.tags.find((t) => t[0] === "p")
  assertExists(pTag)
  assertEquals(pTag[1], pk1)
})

Deno.test("buildZapRequest - includes relays tag", () => {
  const relays = ["wss://relay.damus.io", "wss://nos.lol"]
  const event = buildZapRequest({ recipientPubkey: pk1, relayUrls: relays, amountMillisats: 21000 })
  const relaysTag = event.tags.find((t) => t[0] === "relays")
  assertExists(relaysTag)
  assertEquals(relaysTag[1], "wss://relay.damus.io")
  assertEquals(relaysTag[2], "wss://nos.lol")
})

Deno.test("buildZapRequest - includes amount tag as string", () => {
  const event = buildZapRequest({ recipientPubkey: pk1, relayUrls: ["wss://relay.damus.io"], amountMillisats: 21000 })
  const amountTag = event.tags.find((t) => t[0] === "amount")
  assertExists(amountTag)
  assertEquals(amountTag[1], "21000")
})

Deno.test("buildZapRequest - includes e-tag when eventId provided", () => {
  const event = buildZapRequest({
    recipientPubkey: pk1,
    relayUrls: ["wss://relay.damus.io"],
    amountMillisats: 21000,
    eventId: eid1,
  })
  const eTag = event.tags.find((t) => t[0] === "e")
  assertExists(eTag)
  assertEquals(eTag[1], eid1)
})

Deno.test("buildZapRequest - omits e-tag when eventId is null", () => {
  const event = buildZapRequest({ recipientPubkey: pk1, relayUrls: ["wss://relay.damus.io"], amountMillisats: 21000 })
  const eTag = event.tags.find((t) => t[0] === "e")
  assertEquals(eTag, undefined)
})

Deno.test("buildZapRequest - uses comment as content", () => {
  const event = buildZapRequest({
    recipientPubkey: pk1,
    relayUrls: ["wss://relay.damus.io"],
    amountMillisats: 21000,
    comment: "great post",
  })
  assertEquals(event.content, "great post")
})

Deno.test("buildZapRequest - defaults to empty comment", () => {
  const event = buildZapRequest({ recipientPubkey: pk1, relayUrls: ["wss://relay.damus.io"], amountMillisats: 21000 })
  assertEquals(event.content, "")
})

Deno.test("buildPrivateMessage - creates kind 14 rumor with recipient p-tag and no pubkey", () => {
  const event = buildPrivateMessage(pk1, "hi")
  assertEquals(event.kind, KIND_PRIVATE_MESSAGE)
  assertEquals(event.content, "hi")
  assertEquals(event.tags, [["p", pk1]])
  assertEquals("pubkey" in event, false)
})

Deno.test("buildPrivateMessage - adds q-tag when replying", () => {
  const event = buildPrivateMessage(pk1, "re: hi", eid1)
  assertEquals(event.tags, [["p", pk1], ["q", eid1]])
})
