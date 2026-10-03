import { assertEquals } from "@std/assert"
import { analyseEvent, replyTargetRef } from "../../src/domain/service/event-analysis.ts"
import { formatAddressableRef } from "../../src/domain/value-object/addressable-ref.ts"
import type { EventOrAddressRef } from "../../src/domain/value-object/event-or-address-ref.ts"
import type { EventId } from "../../src/domain/value-object/event-id.ts"
import type { NostrEvent, Tag } from "../../src/domain/value-object/nostr-event.ts"
import type { KindMetadata } from "../../src/domain/service/event-analysis.ts"
import { eventIdFixture, httpUrlFixture, publicKeyFixture, sigFixture } from "../../testing.ts"
import {
  KIND_COMMENT,
  KIND_GENERIC_REPOST,
  KIND_HIGHLIGHT,
  KIND_LONGFORM_CONTENT,
  KIND_REACTION,
  KIND_REPOST,
  KIND_TEXT_NOTE,
} from "../../src/domain/value-object/kinds.ts"

const pk1 = publicKeyFixture("a".repeat(64))
const pk2 = publicKeyFixture("b".repeat(64))
const eid1 = eventIdFixture("c".repeat(64))
const eid2 = eventIdFixture("d".repeat(64))
const eid3 = eventIdFixture("e".repeat(64))

const eventRef = (id: EventId): EventOrAddressRef => ({ type: "event", id })
const articleRef = (pubkey = pk1): EventOrAddressRef => ({
  type: "address",
  address: { kind: KIND_LONGFORM_CONTENT, pubkey, dTag: "my-article" },
})

const expectKindData = <T extends KindMetadata["type"]>(
  data: KindMetadata | null,
  type: T,
): Extract<KindMetadata, { readonly type: T }> => {
  const isType = (candidate: KindMetadata | null): candidate is Extract<KindMetadata, { readonly type: T }> =>
    candidate?.type === type
  if (!isType(data)) throw new Error(`expected ${type} kindData, got ${data?.type ?? "null"}`)
  return data
}

const makeEvent = (overrides: Partial<NostrEvent> & { kind: number }): NostrEvent => ({
  id: eid1,
  pubkey: pk1,
  sig: sigFixture("f".repeat(128)),
  created_at: 1700000000,
  content: "",
  tags: [],
  ...overrides,
})

Deno.test("replyTargetRef - returns the hex id for a non-addressable event", () => {
  const raw = makeEvent({ kind: KIND_TEXT_NOTE })
  assertEquals(replyTargetRef(raw), eventRef(raw.id))
})

Deno.test("replyTargetRef - returns the address ref for an addressable event", () => {
  const raw = makeEvent({ kind: KIND_LONGFORM_CONTENT, tags: [["d", "my-article"]] })
  assertEquals(replyTargetRef(raw), articleRef())
})

Deno.test("replyTargetRef - addresses an addressable event with no d tag by its empty-d coordinate", () => {
  const raw = makeEvent({ kind: KIND_LONGFORM_CONTENT })
  assertEquals(replyTargetRef(raw), {
    type: "address",
    address: { kind: KIND_LONGFORM_CONTENT, pubkey: pk1, dTag: "" },
  })
})

Deno.test("replyTargetRef - addresses a replaceable event by its kind:pubkey: coordinate (NIP-01)", () => {
  const raw = makeEvent({ kind: 10002 })
  assertEquals(replyTargetRef(raw), { type: "address", address: { kind: 10002, pubkey: pk1, dTag: "" } })
})

Deno.test("replyTargetRef - addresses a replaceable event by the empty identifier even when it carries a d tag", () => {
  const raw = makeEvent({ kind: 0, tags: [["d", "stray"]] })
  assertEquals(replyTargetRef(raw), { type: "address", address: { kind: 0, pubkey: pk1, dTag: "" } })
})

Deno.test("replyTargetRef - names an addressable event whose d tags disagree by its id, since it has no one coordinate", () => {
  const raw = makeEvent({ kind: KIND_LONGFORM_CONTENT, tags: [["d", "a"], ["d", "b"]] })
  assertEquals(replyTargetRef(raw), eventRef(raw.id))
})

Deno.test("replyTargetRef - matches the rootEvent a comment derives from an empty-d A tag", () => {
  const article = makeEvent({ kind: KIND_LONGFORM_CONTENT })
  const coord = `${KIND_LONGFORM_CONTENT}:${pk1}:`
  const comment = makeEvent({ id: eid2, kind: KIND_COMMENT, tags: [["A", coord], ["K", "30023"], ["a", coord]] })
  assertEquals(analyseEvent(comment).refs.rootEvent, replyTargetRef(article))
})

Deno.test("replyTargetRef - matches the root and parent a comment derives from its A and a tags", () => {
  const article = makeEvent({ kind: KIND_LONGFORM_CONTENT, tags: [["d", "my-article"]] })
  const coord = formatAddressableRef({ kind: KIND_LONGFORM_CONTENT, pubkey: pk1, dTag: "my-article" })
  const comment = makeEvent({ id: eid2, kind: KIND_COMMENT, tags: [["A", coord], ["a", coord], ["e", eid1]] })
  assertEquals(analyseEvent(comment).refs.rootEvent, replyTargetRef(article))
  assertEquals(analyseEvent(comment).refs.replyToEvent, replyTargetRef(article))
})

Deno.test("analyseEvent - a root-marked a tag does not make a short note a reply (NIP-10)", () => {
  const coord = formatAddressableRef({ kind: KIND_LONGFORM_CONTENT, pubkey: pk1, dTag: "my-article" })
  const result = analyseEvent(makeEvent({ kind: KIND_TEXT_NOTE, tags: [["a", coord, "", "root"]] }))
  assertEquals(result.refs.isReply, false)
  assertEquals(result.refs.rootEvent, null)
})

Deno.test("analyseEvent - a reply-marked a tag does not become a short note's parent (NIP-10)", () => {
  const coord = formatAddressableRef({ kind: KIND_LONGFORM_CONTENT, pubkey: pk1, dTag: "my-article" })
  const raw = makeEvent({ kind: KIND_TEXT_NOTE, tags: [["e", eid2, "", "root"], ["a", coord, "", "reply"]] })
  assertEquals(analyseEvent(raw).refs.replyToEvent, null)
})

Deno.test("analyseEvent - a comment's root is its A tag even when an E tag comes first", () => {
  const coord = formatAddressableRef({ kind: KIND_LONGFORM_CONTENT, pubkey: pk1, dTag: "my-article" })
  const raw = makeEvent({ kind: KIND_COMMENT, tags: [["E", eid3], ["A", coord]] })
  assertEquals(analyseEvent(raw).refs.rootEvent, articleRef())
})

Deno.test("analyseEvent - returns raw event unchanged", () => {
  const raw = makeEvent({ kind: KIND_TEXT_NOTE, content: "hello" })
  const result = analyseEvent(raw)
  assertEquals(result.raw, raw)
})

Deno.test("analyseEvent - short note without e-tags is not a reply", () => {
  const raw = makeEvent({ kind: KIND_TEXT_NOTE, content: "hello" })
  const result = analyseEvent(raw)
  assertEquals(result.refs.isReply, false)
})

Deno.test("analyseEvent - short note with root e-tag is a reply", () => {
  const raw = makeEvent({
    kind: KIND_TEXT_NOTE,
    tags: [["e", eid2, "", "root"], ["p", pk2]],
  })
  const result = analyseEvent(raw)
  assertEquals(result.refs.isReply, true)
  assertEquals(result.refs.rootEvent, eventRef(eid2))
})

Deno.test("analyseEvent - short note with root and reply e-tags", () => {
  const raw = makeEvent({
    kind: KIND_TEXT_NOTE,
    tags: [
      ["e", eid2, "", "root"],
      ["e", eid3, "", "reply"],
      ["p", pk2],
    ],
  })
  const result = analyseEvent(raw)
  assertEquals(result.refs.rootEvent, eventRef(eid2))
  assertEquals(result.refs.replyToEvent, eventRef(eid3))
  assertEquals(result.refs.isReply, true)
})

Deno.test("analyseEvent - short note with positional e-tags (no markers) uses first as root", () => {
  const raw = makeEvent({
    kind: KIND_TEXT_NOTE,
    tags: [["e", eid2], ["e", eid3]],
  })
  const result = analyseEvent(raw)
  assertEquals(result.refs.rootEvent, eventRef(eid2))
  assertEquals(result.refs.replyToEvent, eventRef(eid3))
  assertEquals(result.refs.isReply, true)
})

Deno.test("analyseEvent - short note with a single positional e-tag replies to it and names no root (NIP-10)", () => {
  const raw = makeEvent({
    kind: KIND_TEXT_NOTE,
    tags: [["e", eid2]],
  })
  const { refs } = analyseEvent(raw)
  assertEquals([refs.rootEvent, refs.replyToEvent, refs.isReply], [null, eventRef(eid2), true])
})

Deno.test("analyseEvent - short note with only a reply marker has a parent and names no root", () => {
  const raw = makeEvent({
    kind: KIND_TEXT_NOTE,
    tags: [["e", eid2, "", "reply"], ["p", pk2]],
  })
  const { refs } = analyseEvent(raw)
  assertEquals([refs.rootEvent, refs.replyToEvent, refs.isReply], [null, eventRef(eid2), true])
})

Deno.test("analyseEvent - a comment with only a parent names no root", () => {
  const { refs } = analyseEvent(makeEvent({ kind: KIND_COMMENT, tags: [["e", eid2], ["k", "1111"]] }))
  assertEquals([refs.rootEvent, refs.replyToEvent, refs.isReply], [null, eventRef(eid2), true])
})

Deno.test("analyseEvent - a reply chain holds its root, its parent and its reply flag alone", () => {
  const { refs } = analyseEvent(makeEvent({
    kind: KIND_TEXT_NOTE,
    tags: [["e", eid2, "", "root"], ["e", eid2, "", "mention"], ["p", pk1], ["p", pk2]],
  }))
  assertEquals(Object.keys(refs).toSorted(), ["isReply", "replyToEvent", "rootEvent"])
})

Deno.test("analyseEvent - repost kind returns repost kindData", () => {
  const raw = makeEvent({
    kind: KIND_REPOST,
    tags: [["e", eid2], ["p", pk2]],
  })
  const result = analyseEvent(raw)
  const repost = expectKindData(result.kindData, "repost")
  assertEquals(repost.original, eventRef(eid2))
})

Deno.test("analyseEvent - repost is not flagged as reply", () => {
  const raw = makeEvent({
    kind: KIND_REPOST,
    tags: [["e", eid2], ["p", pk2]],
  })
  const result = analyseEvent(raw)
  assertEquals(result.refs.isReply, false)
})

Deno.test("analyseEvent - generic repost returns repost kindData", () => {
  const raw = makeEvent({
    kind: KIND_GENERIC_REPOST,
    tags: [["e", eid2]],
  })
  const result = analyseEvent(raw)
  const repost = expectKindData(result.kindData, "repost")
  assertEquals(repost.original, eventRef(eid2))
})

Deno.test("analyseEvent - generic repost falls back to the a-tag coordinate when no e-tag", () => {
  const coord = formatAddressableRef({ kind: KIND_LONGFORM_CONTENT, pubkey: pk1, dTag: "my-article" })
  const raw = makeEvent({ kind: KIND_GENERIC_REPOST, tags: [["a", coord], ["k", "30023"]] })
  const result = analyseEvent(raw)
  const repost = expectKindData(result.kindData, "repost")
  assertEquals(repost.original, articleRef())
})

Deno.test("analyseEvent - reaction falls back to the a-tag coordinate when no e-tag", () => {
  const coord = formatAddressableRef({ kind: KIND_LONGFORM_CONTENT, pubkey: pk1, dTag: "my-article" })
  const raw = makeEvent({ kind: KIND_REACTION, content: "🔥", tags: [["a", coord], ["k", "30023"]] })
  const result = analyseEvent(raw)
  const reaction = expectKindData(result.kindData, "reaction")
  assertEquals(reaction.target, articleRef())
})

Deno.test("analyseEvent - reaction returns reaction kindData with default +", () => {
  const raw = makeEvent({
    kind: KIND_REACTION,
    content: "",
    tags: [["e", eid2], ["p", pk2]],
  })
  const result = analyseEvent(raw)
  const reaction = expectKindData(result.kindData, "reaction")
  assertEquals(reaction.content, "+")
  assertEquals(reaction.target, eventRef(eid2))
})

Deno.test("analyseEvent - reaction.content passes through the raw event content", () => {
  const raw = makeEvent({
    kind: KIND_REACTION,
    content: "🤙",
    tags: [["e", eid2]],
  })
  const result = analyseEvent(raw)
  const reaction = expectKindData(result.kindData, "reaction")
  assertEquals(reaction.content, "🤙")
})

Deno.test("analyseEvent - reaction targets last e-tag", () => {
  const raw = makeEvent({
    kind: KIND_REACTION,
    content: "+",
    tags: [["e", eid2], ["e", eid3]],
  })
  const result = analyseEvent(raw)
  const reaction = expectKindData(result.kindData, "reaction")
  assertEquals(reaction.target, eventRef(eid3))
})

Deno.test("analyseEvent - reaction is not flagged as reply", () => {
  const raw = makeEvent({
    kind: KIND_REACTION,
    content: "+",
    tags: [["e", eid2]],
  })
  const result = analyseEvent(raw)
  assertEquals(result.refs.isReply, false)
})

Deno.test("analyseEvent - highlight returns highlight kindData", () => {
  const raw = makeEvent({
    kind: KIND_HIGHLIGHT,
    content: "highlighted text",
    tags: [
      ["r", "https://example.com/article"],
      ["context", "surrounding text"],
      ["comment", "my thoughts"],
    ],
  })
  const result = analyseEvent(raw)
  const highlight = expectKindData(result.kindData, "highlight")
  assertEquals(highlight.text, "highlighted text")
  assertEquals(highlight.sourceUrl, "https://example.com/article")
  assertEquals(highlight.context, "surrounding text")
  assertEquals(highlight.comment, "my thoughts")
})

Deno.test("analyseEvent - highlight with e-tag source event", () => {
  const raw = makeEvent({
    kind: KIND_HIGHLIGHT,
    content: "text",
    tags: [["e", eid2]],
  })
  const result = analyseEvent(raw)
  const highlight = expectKindData(result.kindData, "highlight")
  assertEquals(highlight.source, eventRef(eid2))
  assertEquals(highlight.sourceUrl, null)
})

Deno.test("analyseEvent - highlight with a-tag source is an address ref", () => {
  const raw = makeEvent({
    kind: KIND_HIGHLIGHT,
    content: "text",
    tags: [["a", formatAddressableRef({ kind: KIND_LONGFORM_CONTENT, pubkey: pk2, dTag: "my-article" })]],
  })
  const result = analyseEvent(raw)
  const highlight = expectKindData(result.kindData, "highlight")
  assertEquals(highlight.source, articleRef(pk2))
})

Deno.test("analyseEvent - comment kind with e-tag is a reply", () => {
  const raw = makeEvent({
    kind: KIND_COMMENT,
    tags: [["e", eid2]],
  })
  const result = analyseEvent(raw)
  assertEquals(result.refs.isReply, true)
  assertEquals(result.refs.replyToEvent, eventRef(eid2))
})

Deno.test("analyseEvent - comment with uppercase E-tag sets rootEvent", () => {
  const raw = makeEvent({
    kind: KIND_COMMENT,
    tags: [["E", eid2], ["e", eid3]],
  })
  const result = analyseEvent(raw)
  assertEquals(result.refs.rootEvent, eventRef(eid2))
})

Deno.test("analyseEvent - a comment on a url has the external identifier as root and parent (NIP-22)", () => {
  const url = "https://abc.com/articles/1"
  const raw = makeEvent({ kind: KIND_COMMENT, tags: [["I", url], ["K", "web"], ["i", url], ["k", "web"]] })
  const { refs } = analyseEvent(raw)
  const external = { type: "external", id: url, kind: "web", hint: null }
  assertEquals([refs.isReply, refs.rootEvent, refs.replyToEvent], [true, external, external])
})

Deno.test("analyseEvent - a reply to a podcast comment has the episode as root and the comment as parent (NIP-22)", () => {
  const episode = "podcast:item:guid:d98d189b-dc7b-45b1-8720-d4b98690f31f"
  const raw = makeEvent({
    kind: KIND_COMMENT,
    tags: [
      ["I", episode, "https://fountain.fm/episode/z1y9TMQRuqXl2awyrQxg"],
      ["K", "podcast:item:guid"],
      ["e", eid2, "wss://example.relay", pk2],
      ["k", "1111"],
      ["p", pk2],
    ],
  })
  const { refs } = analyseEvent(raw)
  const hint = httpUrlFixture("https://fountain.fm/episode/z1y9TMQRuqXl2awyrQxg")
  assertEquals(refs.rootEvent, { type: "external", id: episode, kind: "podcast:item:guid", hint })
  assertEquals(refs.replyToEvent, eventRef(eid2))
})

Deno.test("analyseEvent - an I tag without the K tag NIP-22 requires scopes nothing", () => {
  const raw = makeEvent({ kind: KIND_COMMENT, tags: [["I", "https://abc.com/articles/1"], ["e", eid2], ["k", "1111"]] })
  assertEquals(analyseEvent(raw).refs.rootEvent, null)
})

Deno.test("analyseEvent - an i tag is read only on a comment", () => {
  const raw = makeEvent({ kind: KIND_TEXT_NOTE, tags: [["i", "https://abc.com/articles/1"], ["k", "web"]] })
  assertEquals(analyseEvent(raw).refs.isReply, false)
})

Deno.test("analyseEvent - a q tag plays no part: an unmarked e tag beside it is still a positional reply (NIP-10)", () => {
  const raw = makeEvent({
    kind: KIND_TEXT_NOTE,
    tags: [["e", eid2], ["q", eid2]],
  })
  const result = analyseEvent(raw)
  assertEquals(result.refs.isReply, true)
  assertEquals(result.refs.replyToEvent, eventRef(eid2))
})

Deno.test("analyseEvent - an e tag with a marker NIP-10 does not define is read positionally", () => {
  const raw = makeEvent({ kind: KIND_TEXT_NOTE, tags: [["e", eid2, "", "foo"]] })
  const result = analyseEvent(raw)
  assertEquals(result.refs.isReply, true)
  assertEquals(result.refs.replyToEvent, eventRef(eid2))
})

Deno.test("analyseEvent - a bare a tag alone does not make a short note a reply", () => {
  const coord = formatAddressableRef({ kind: KIND_LONGFORM_CONTENT, pubkey: pk1, dTag: "my-article" })
  const result = analyseEvent(makeEvent({ kind: KIND_TEXT_NOTE, tags: [["a", coord]] }))
  assertEquals(result.refs.isReply, false)
  assertEquals(result.refs.rootEvent, null)
})

Deno.test("analyseEvent - short note quoting via q tag with mention-marked e tag is not a reply", () => {
  const raw = makeEvent({
    kind: KIND_TEXT_NOTE,
    tags: [["q", eid2], ["e", eid2, "", "mention"], ["p", pk2]],
  })
  const result = analyseEvent(raw)
  assertEquals(result.refs.isReply, false)
})

const mentionBesideUnmarked: ReadonlyArray<readonly [string, ReadonlyArray<Tag>]> = [
  ["before", [["e", eid2, "", "mention"], ["e", eid3]]],
  ["after", [["e", eid3], ["e", eid2, "", "mention"]]],
]
for (const [position, tags] of mentionBesideUnmarked) {
  Deno.test(`analyseEvent - a mention-marked e tag ${position} an unmarked one makes it a mention, not a reply`, () => {
    assertEquals(analyseEvent(makeEvent({ kind: KIND_TEXT_NOTE, tags })).refs.isReply, false)
  })
}

Deno.test("analyseEvent - unmarked e tags are positional whatever q tags accompany them", () => {
  const raw = makeEvent({
    kind: KIND_TEXT_NOTE,
    tags: [["e", eid2], ["q", eid3], ["e", eid3]],
  })
  const result = analyseEvent(raw)
  assertEquals(result.refs.isReply, true)
  assertEquals(result.refs.rootEvent, eventRef(eid2))
  assertEquals(result.refs.replyToEvent, eventRef(eid3))
})

Deno.test("analyseEvent - reply with explicit markers that also quotes is unaffected", () => {
  const raw = makeEvent({
    kind: KIND_TEXT_NOTE,
    tags: [["e", eid2, "", "root"], ["q", eid3], ["e", eid3, "", "mention"]],
  })
  const result = analyseEvent(raw)
  assertEquals(result.refs.isReply, true)
  assertEquals(result.refs.rootEvent, eventRef(eid2))
})

Deno.test("analyseEvent - a comment's parent is its e tag, whatever q tags accompany it (NIP-22)", () => {
  const raw = makeEvent({
    kind: KIND_COMMENT,
    tags: [["q", eid3], ["e", eid2]],
  })
  const result = analyseEvent(raw)
  assertEquals(result.refs.replyToEvent, eventRef(eid2))
  assertEquals(result.refs.isReply, true)
})

Deno.test("analyseEvent - unknown kind returns empty kindData", () => {
  const raw = makeEvent({ kind: 99999 })
  const result = analyseEvent(raw)
  assertEquals(result.kindData, null)
})

Deno.test("analyseEvent - ignores e-tags whose value is not an event id", () => {
  const raw = makeEvent({ kind: KIND_TEXT_NOTE, tags: [["e", "not-an-id", "", "root"], ["E", "also-not-an-id"]] })
  const result = analyseEvent(raw)
  assertEquals(result.refs.rootEvent, null)
  assertEquals(result.refs.isReply, false)
})
