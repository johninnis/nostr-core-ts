import { assertEquals, assertExists, assertThrows } from "@std/assert"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import { buildRumour, chatRoomMembers } from "../../src/domain/service/rumour.ts"
import {
  buildClientAuth,
  buildDeletion,
  buildHighlightFromEvent,
  buildHighlightFromUrl,
  buildPrivateMessage,
  buildPrivateReaction,
  buildTextNote,
} from "../../src/domain/service/builder.ts"
import { formatAddressableRef } from "../../src/domain/value-object/addressable-ref.ts"
import { encodeEventIdToNote, encodeNaddr, encodeNevent, encodePubkeyToNpub } from "../../src/domain/service/bech32.ts"
import {
  KIND_CLIENT_AUTH,
  KIND_EVENT_DELETION,
  KIND_HIGHLIGHT,
  KIND_LONGFORM_CONTENT,
  KIND_PRIVATE_MESSAGE,
  KIND_REACTION,
  KIND_TEXT_NOTE,
} from "../../src/domain/value-object/kinds.ts"
import { analyseEvent } from "../../src/domain/service/event-analysis.ts"
import type { NostrEvent, Rumour } from "../../src/domain/value-object/nostr-event.ts"
import {
  authChallengeFixture,
  eventIdFixture,
  httpUrlFixture,
  publicKeyFixture,
  relayUrlFixture,
  sigFixture,
} from "../../testing.ts"

const pk1 = publicKeyFixture("a".repeat(64))
const pk2 = publicKeyFixture("b".repeat(64))
const pk3 = publicKeyFixture("c".repeat(64))
const eid1 = eventIdFixture("c".repeat(64))

Deno.test("buildTextNote - creates kind 1 event with content", () => {
  const event = buildTextNote("Hello world")
  assertEquals(event.kind, KIND_TEXT_NOTE)
  assertEquals(event.content, "Hello world")
})

Deno.test("buildTextNote - uses provided createdAt timestamp", () => {
  const event = buildTextNote("test", 1700000000)
  assertEquals(event.created_at, 1700000000)
})

Deno.test("buildTextNote - extracts hashtags from content", () => {
  const event = buildTextNote("Hello #nostr and #bitcoin", 1700000000)
  const tTags = event.tags.filter((t) => t[0] === "t")
  assertEquals(tTags.length, 2)
  const [firstTag, secondTag] = tTags
  assertExists(firstTag)
  assertExists(secondTag)
  assertEquals(firstTag[1], "nostr")
  assertEquals(secondTag[1], "bitcoin")
})

Deno.test("buildTextNote - does not extract hashtags from HTML entities", () => {
  const event = buildTextNote("&#123; test", 1700000000)
  const tTags = event.tags.filter((t) => t[0] === "t")
  assertEquals(tTags.length, 0)
})

Deno.test("buildTextNote - deduplicates hashtags", () => {
  const event = buildTextNote("#nostr #Nostr #NOSTR", 1700000000)
  const tTags = event.tags.filter((t) => t[0] === "t")
  assertEquals(tTags.length, 1)
  const [firstTag] = tTags
  assertExists(firstTag)
  assertEquals(firstTag[1], "nostr")
})

Deno.test("buildTextNote - adds a p-tag for an embedded npub reference", () => {
  const pubkey = publicKeyFixture("1".repeat(64))
  const npub = encodePubkeyToNpub(pubkey)
  const event = buildTextNote(`hi nostr:${npub}`)
  const pTags = event.tags.filter((t) => t[0] === "p")
  if (!pTags.some((t) => t[1] === pubkey)) throw new Error("expected p tag for npub")
})

Deno.test("buildTextNote - adds a q tag (no e mention) for an embedded note reference", () => {
  const eventId = eventIdFixture("2".repeat(64))
  const note = encodeEventIdToNote(eventId)
  const event = buildTextNote(`see nostr:${note}`)
  const qTags = event.tags.filter((t) => t[0] === "q")
  const eTags = event.tags.filter((t) => t[0] === "e")
  if (!qTags.some((t) => t[1] === eventId)) throw new Error("expected q tag")
  if (eTags.length > 0) throw new Error("quoted events are q-only per NIP-18; no e mention tag")
})

Deno.test("buildTextNote - adds q and p tags (no e mention) for an embedded nevent reference", () => {
  const eventId = eventIdFixture("3".repeat(64))
  const pubkey = publicKeyFixture("4".repeat(64))
  const nevent = encodeNevent(eventId, { authorPubkey: pubkey }) ?? ""
  const event = buildTextNote(`x nostr:${nevent}`)
  if (!event.tags.some((t) => t[0] === "q" && t[1] === eventId)) throw new Error("expected q tag")
  if (event.tags.some((t) => t[0] === "e")) throw new Error("quoted events are q-only per NIP-18; no e tag")
  if (!event.tags.some((t) => t[0] === "p" && t[1] === pubkey)) throw new Error("expected p tag")
})

Deno.test("buildTextNote - converts an embedded naddr into a q tag and a p tag, per NIP-18", () => {
  const pubkey = publicKeyFixture("5".repeat(64))
  const naddr = encodeNaddr({ kind: 30023, pubkey, dTag: "my-post" }) ?? ""
  const event = buildTextNote(`q nostr:${naddr}`, 1700000000)
  assertEquals(event.tags, [["p", pubkey], ["q", `30023:${pubkey}:my-post`]])
})

Deno.test("buildTextNote - an naddr's q tag carries its relay and no pubkey, since an address is not a regular event", () => {
  const pubkey = publicKeyFixture("5".repeat(64))
  const naddr = encodeNaddr({ kind: 30023, pubkey, dTag: "my-post" }, [relayUrlFixture("wss://relay.example")]) ?? ""
  const event = buildTextNote(`nostr:${naddr}`)
  assertEquals(event.tags.filter((t) => t[0] === "q"), [["q", `30023:${pubkey}:my-post`, "wss://relay.example"]])
})

Deno.test("buildTextNote - an nevent's q tag is the NIP-18 shape: id, relay, then the regular event's pubkey", () => {
  const eventId = eventIdFixture("3".repeat(64))
  const pubkey = publicKeyFixture("4".repeat(64))
  const nevent =
    encodeNevent(eventId, { relayUrls: [relayUrlFixture("wss://relay.example")], authorPubkey: pubkey, kind: 1 }) ?? ""
  const event = buildTextNote(`nostr:${nevent}`)
  assertEquals(event.tags.filter((t) => t[0] === "q"), [["q", eventId, "wss://relay.example", pubkey]])
})

Deno.test("buildTextNote - an nevent without a relay leaves the relay element empty before the pubkey", () => {
  const eventId = eventIdFixture("3".repeat(64))
  const pubkey = publicKeyFixture("4".repeat(64))
  const nevent = encodeNevent(eventId, { authorPubkey: pubkey }) ?? ""
  const event = buildTextNote(`nostr:${nevent}`)
  assertEquals(event.tags.filter((t) => t[0] === "q"), [["q", eventId, "", pubkey]])
})

Deno.test("buildTextNote - an nevent without an author carries only its relay", () => {
  const eventId = eventIdFixture("3".repeat(64))
  const nevent = encodeNevent(eventId, { relayUrls: [relayUrlFixture("wss://relay.example")] }) ?? ""
  const event = buildTextNote(`nostr:${nevent}`, 1700000000)
  assertEquals(event.tags, [["q", eventId, "wss://relay.example"]])
})

Deno.test("buildTextNote - an nevent of an addressable kind has no pubkey element, since it is not a regular event", () => {
  const eventId = eventIdFixture("3".repeat(64))
  const pubkey = publicKeyFixture("4".repeat(64))
  const nevent = encodeNevent(eventId, { authorPubkey: pubkey, kind: 30023 }) ?? ""
  const event = buildTextNote(`nostr:${nevent}`, 1700000000)
  assertEquals(event.tags, [["p", pubkey], ["q", eventId]])
})

Deno.test("buildTextNote - an nevent of a replaceable kind has no pubkey element", () => {
  const eventId = eventIdFixture("3".repeat(64))
  const pubkey = publicKeyFixture("4".repeat(64))
  const nevent =
    encodeNevent(eventId, { relayUrls: [relayUrlFixture("wss://relay.example")], authorPubkey: pubkey, kind: 0 }) ?? ""
  const event = buildTextNote(`nostr:${nevent}`)
  assertEquals(event.tags.filter((t) => t[0] === "q"), [["q", eventId, "wss://relay.example"]])
})

Deno.test("buildTextNote - empty content produces no hashtag tags", () => {
  const event = buildTextNote("", 1700000000)
  assertEquals(event.tags.length, 0)
})

const signed = (overrides: Partial<NostrEvent> & { kind: number }): NostrEvent => ({
  id: eid1,
  pubkey: pk1,
  created_at: 1700000000,
  tags: [],
  content: "",
  sig: sigFixture("f".repeat(128)),
  ...overrides,
})

Deno.test("buildDeletion - deletes a regular event by its id and names its kind (NIP-09)", () => {
  const event = buildDeletion(pk1, signed({ kind: KIND_TEXT_NOTE }))
  assertEquals([event.kind, event.tags, event.content], [KIND_EVENT_DELETION, [["e", eid1], ["k", "1"]], ""])
})

Deno.test("buildDeletion - deletes an addressable event by its a coordinate and names its kind (NIP-09)", () => {
  const event = buildDeletion(pk1, signed({ kind: 30000, tags: [["d", "my-list"]] }))
  assertEquals(event.tags, [["a", `30000:${pk1}:my-list`], ["k", "30000"]])
})

Deno.test("buildDeletion - deletes a replaceable event by its kind:pubkey: coordinate (NIP-09, shared ADR-0016)", () => {
  const event = buildDeletion(pk1, signed({ kind: 10000 }))
  assertEquals(event.tags, [["a", `10000:${pk1}:`], ["k", "10000"]])
})

Deno.test("buildDeletion - throws for another author's event, which a deletion request cannot name (NIP-09)", () => {
  assertThrows(() => buildDeletion(pk2, signed({ kind: KIND_TEXT_NOTE })), InvalidArgumentError)
})

Deno.test("buildDeletion - throws for a deletion request, against which a deletion request has no effect (NIP-09)", () => {
  assertThrows(() => buildDeletion(pk1, signed({ kind: KIND_EVENT_DELETION })), InvalidArgumentError)
})

Deno.test("buildClientAuth - creates kind 22242 with relay and challenge tags", () => {
  const relay = relayUrlFixture("wss://relay.example.com")
  const event = buildClientAuth(relay, authChallengeFixture("challenge-123"))
  assertEquals(event.kind, KIND_CLIENT_AUTH)
  assertEquals(event.tags.length, 2)
  assertEquals(event.tags[0], ["relay", relay])
  assertEquals(event.tags[1], ["challenge", "challenge-123"])
  assertEquals(event.content, "")
})

Deno.test("buildHighlightFromUrl - creates kind 9802 event", () => {
  const event = buildHighlightFromUrl("highlighted text", httpUrlFixture("https://example.com"))
  assertEquals(event.kind, KIND_HIGHLIGHT)
  assertEquals(event.content, "highlighted text")
})

Deno.test("buildHighlightFromUrl - marks the source r tag with the source attribute (NIP-84 MUST)", () => {
  const event = buildHighlightFromUrl("text", httpUrlFixture("https://example.com"))
  assertEquals(event.tags, [["r", "https://example.com/", "source"]])
})

Deno.test("buildHighlightFromUrl - a quote highlight's source still reads back as its source url", () => {
  const event = buildHighlightFromUrl("text", httpUrlFixture("https://example.com/a"), "see https://example.com/b")
  const tags = [...event.tags, ["r", "https://example.com/b", "mention"] as const]
  const kindData = analyseEvent({ ...event, tags, id: eid1, pubkey: pk1 }).kindData
  assertEquals(kindData?.type === "highlight" ? kindData.sourceUrl : null, "https://example.com/a")
})

Deno.test("buildHighlightFromUrl - includes comment tag when provided", () => {
  const event = buildHighlightFromUrl("text", httpUrlFixture("https://example.com"), "my thoughts")
  const commentTag = event.tags.find((t) => t[0] === "comment")
  assertExists(commentTag)
  assertEquals(commentTag[1], "my thoughts")
})

Deno.test("buildHighlightFromUrl - omits comment tag when null", () => {
  const event = buildHighlightFromUrl("text", httpUrlFixture("https://example.com"))
  const commentTag = event.tags.find((t) => t[0] === "comment")
  assertEquals(commentTag, undefined)
})

Deno.test("buildHighlightFromUrl - writes an empty comment as an empty comment tag (shared ADR-0079)", () => {
  const event = buildHighlightFromUrl("text", httpUrlFixture("https://example.com"), "")
  assertEquals(event.tags.filter((t) => t[0] === "comment"), [["comment", ""]])
})

Deno.test("buildHighlightFromEvent - quotes a regular event by its e tag and tags its author (NIP-84)", () => {
  const event = buildHighlightFromEvent("text", signed({ kind: KIND_TEXT_NOTE }))
  assertEquals([event.kind, event.content, event.tags], [KIND_HIGHLIGHT, "text", [["e", eid1], ["p", pk1]]])
})

Deno.test("buildHighlightFromEvent - quotes an addressable event by its a coordinate and the version's e tag (NIP-84)", () => {
  const event = buildHighlightFromEvent("text", signed({ kind: KIND_LONGFORM_CONTENT, tags: [["d", "my-article"]] }))
  assertEquals(event.tags, [
    ["a", formatAddressableRef({ kind: KIND_LONGFORM_CONTENT, pubkey: pk1, dTag: "my-article" })],
    ["e", eid1],
    ["p", pk1],
  ])
})

Deno.test("buildHighlightFromEvent - reads back with the article's coordinate as its source", () => {
  const article = signed({ kind: KIND_LONGFORM_CONTENT, tags: [["d", "my-article"]] })
  const kindData = analyseEvent({ ...buildHighlightFromEvent("text", article), id: eid1, pubkey: pk2 }).kindData
  assertEquals(kindData?.type === "highlight" ? kindData.source : null, {
    type: "address",
    address: { kind: KIND_LONGFORM_CONTENT, pubkey: pk1, dTag: "my-article" },
  })
})

Deno.test("buildPrivateMessage - creates the sender's kind 14 rumour with a p tag for the receiver", () => {
  const rumour = buildPrivateMessage({ sender: pk2, receivers: [pk1] }, "hi")
  assertEquals([rumour.kind, rumour.pubkey, rumour.content, rumour.tags], [KIND_PRIVATE_MESSAGE, pk2, "hi", [[
    "p",
    pk1,
  ]]])
})

Deno.test("buildPrivateMessage - its id is the rumour's computed id", () => {
  const rumour = buildPrivateMessage({ sender: pk2, receivers: [pk1] }, "hi")
  assertEquals(rumour.id, buildRumour(rumour).id)
})

Deno.test("buildPrivateMessage - names each receiver of a group message in a p tag, once (NIP-17)", () => {
  assertEquals(buildPrivateMessage({ sender: pk3, receivers: [pk1, pk2, pk1] }, "hi all").tags, [["p", pk1], [
    "p",
    pk2,
  ]])
})

Deno.test("buildPrivateMessage - leaves the sender out of the receivers it tags (shared ADR-0074)", () => {
  assertEquals(buildPrivateMessage({ sender: pk2, receivers: [pk2, pk1] }, "hi").tags, [["p", pk1]])
})

Deno.test("buildPrivateMessage - a room whose only receiver is the sender is a note to self, p-tagging the sender (shared ADR-0074)", () => {
  assertEquals(buildPrivateMessage({ sender: pk2, receivers: [pk2] }, "note").tags, [["p", pk2]])
})

Deno.test("buildPrivateMessage - a room with no receivers is a note to self, p-tagging the sender (shared ADR-0074)", () => {
  assertEquals(buildPrivateMessage({ sender: pk2, receivers: [] }, "note").tags, [["p", pk2]])
})

const dmParent: Rumour = {
  kind: KIND_PRIVATE_MESSAGE,
  id: eid1,
  pubkey: pk2,
  created_at: 1,
  tags: [["p", pk1]],
  content: "hi",
}

Deno.test("buildPrivateMessage - names the message it answers in an e tag (NIP-17)", () => {
  const rumour = buildPrivateMessage({ sender: pk2, receivers: [pk1] }, "re: hi", dmParent)
  assertEquals(rumour.tags, [["p", pk1], ["e", eid1]])
})

Deno.test("buildPrivateMessage - a reply never quotes its parent with a q tag", () => {
  const rumour = buildPrivateMessage({ sender: pk2, receivers: [pk1] }, "re: hi", dmParent)
  assertEquals(rumour.tags.some((t) => t[0] === "q"), false)
})

Deno.test("buildPrivateReaction - reacts to a message of the room, p-tagging every receiver once so it stays in that room (NIP-17)", () => {
  const rumour = buildPrivateReaction({ sender: pk3, receivers: [pk1, pk2, pk1] }, dmParent, "-")
  assertEquals([rumour.kind, rumour.pubkey, rumour.content], [KIND_REACTION, pk3, "-"])
  assertEquals(rumour.tags, [["e", eid1, "", pk2], ["p", pk1], ["p", pk2], ["k", String(KIND_PRIVATE_MESSAGE)]])
})

Deno.test("buildPrivateReaction - defaults to a like", () => {
  assertEquals(buildPrivateReaction({ sender: pk2, receivers: [pk1] }, dmParent).content, "+")
})

Deno.test("buildPrivateReaction - leaves the sender out of the receivers it tags (shared ADR-0074)", () => {
  const rumour = buildPrivateReaction({ sender: pk1, receivers: [pk1, pk2] }, dmParent)
  assertEquals(rumour.tags.filter((t) => t[0] === "p"), [["p", pk2]])
})

Deno.test("buildPrivateReaction - reacts in a note-to-self room by p-tagging the sender once (shared ADR-0074)", () => {
  const rumour = buildPrivateReaction({ sender: pk1, receivers: [] }, { ...dmParent, pubkey: pk1, tags: [["p", pk1]] })
  assertEquals(rumour.tags.filter((t) => t[0] === "p"), [["p", pk1]])
})

Deno.test("buildPrivateReaction - p-tags the target's author last (NIP-25: the target event pubkey should be last the p tags)", () => {
  const rumour = buildPrivateReaction({ sender: pk3, receivers: [pk2, pk1] }, dmParent)
  assertEquals(rumour.tags.filter((t) => t[0] === "p"), [["p", pk1], ["p", pk2]])
})

Deno.test("buildPrivateReaction - p-tags the sender last when reacting to the sender's own message (shared ADR-0074)", () => {
  const rumour = buildPrivateReaction({ sender: pk2, receivers: [pk1, pk3] }, dmParent)
  assertEquals(rumour.tags.filter((t) => t[0] === "p"), [["p", pk1], ["p", pk3], ["p", pk2]])
})

Deno.test("buildPrivateReaction - keeps the room the messages name when it p-tags the sender", () => {
  const room = { sender: pk2, receivers: [pk1, pk3] }
  assertEquals(
    chatRoomMembers(buildPrivateReaction(room, dmParent)),
    chatRoomMembers(buildPrivateMessage(room, "hi")),
  )
})

Deno.test("buildPrivateReaction - throws InvalidArgumentError for a target whose author is not in the room", () => {
  assertThrows(
    () => buildPrivateReaction({ sender: pk1, receivers: [pk3] }, dmParent),
    InvalidArgumentError,
    "not a member",
  )
})

Deno.test("buildTextNote - an naddr referenced twice yields one q tag", () => {
  const naddr = encodeNaddr({ kind: 30023, pubkey: pk2, dTag: "twice" }) ?? ""
  const event = buildTextNote(`nostr:${naddr} and again nostr:${naddr}`)
  assertEquals(event.tags.filter((t) => t[0] === "q").length, 1)
})

Deno.test("buildTextNote - mentioning an naddr does not make the note a reply", () => {
  const naddr = encodeNaddr({ kind: 30023, pubkey: pk2, dTag: "cited" }) ?? ""
  const note = buildTextNote(`see nostr:${naddr}`)
  const event = { ...note, id: eventIdFixture("1".repeat(64)), pubkey: pk2 }
  assertEquals(analyseEvent(event).refs.isReply, false)
})

const SHARED_NPUB_A = "npub1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygse4sl3h"
const SHARED_NPUB_B = "npub1yg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3q2pw2gm"
const SHARED_NEVENT =
  "nevent1qqsrxvenxvenxvenxvenxvenxvenxvenxvenxvenxvenxvenxvenxvcpzamhxue69uhhyetvv9ujuetcv9khqmr99e3k7mgzyq3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyqcyqqqqqqgr7u6hc"
const SHARED_NADDR =
  "naddr1qqz8qmmnwsq3wamnwvaz7tmjv4kxz7fwv4uxzmtsd3jjucm0d5pzqyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qvzqqqr4gux98gf5"

Deno.test("buildTextNote - tags each reference's author before its quote, a repeated tag moves to where it recurs, then hashtags (shared vector with innis/nostr-core)", () => {
  const a = "11".repeat(32)
  const b = "22".repeat(32)
  const content =
    `gm nostr:${SHARED_NPUB_A} see nostr:${SHARED_NEVENT} and nostr:${SHARED_NADDR} cc nostr:${SHARED_NPUB_B} #Nostr #nostr #Zürich`
  assertEquals(buildTextNote(content, 1700000000).tags, [
    ["q", "33".repeat(32), "wss://relay.example.com", b],
    ["p", a],
    ["q", `30023:${a}:post`, "wss://relay.example.com"],
    ["p", b],
    ["t", "nostr"],
    ["t", "zürich"],
  ])
})

Deno.test("buildPrivateMessage - a rumour re-stamped through buildRumour gets the id of its new timestamp (ADR-0007)", () => {
  const restamped = buildRumour({ ...buildPrivateMessage({ sender: pk2, receivers: [pk1] }, "hi"), created_at: 1 })
  assertEquals(restamped, buildRumour({ kind: 14, pubkey: pk2, created_at: 1, tags: [["p", pk1]], content: "hi" }))
})

Deno.test("buildPrivateReaction - a rumour re-stamped through buildRumour gets the id of its new timestamp (ADR-0007)", () => {
  const { kind, pubkey, tags, content } = buildPrivateReaction({ sender: pk3, receivers: [pk2] }, dmParent)
  const restamped = buildRumour({ ...buildPrivateReaction({ sender: pk3, receivers: [pk2] }, dmParent), created_at: 1 })
  assertEquals(restamped, buildRumour({ kind, pubkey, created_at: 1, tags, content }))
})
