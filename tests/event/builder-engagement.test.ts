import { assertEquals } from "@std/assert"
import { buildReaction, buildRepost } from "../../src/domain/service/builder.ts"
import {
  KIND_GENERIC_REPOST,
  KIND_HIGHLIGHT,
  KIND_LONGFORM_CONTENT,
  KIND_METADATA,
  KIND_REACTION,
  KIND_REPOST,
  KIND_TEXT_NOTE,
} from "../../src/domain/value-object/kinds.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import { eventIdFixture, publicKeyFixture, relayUrlFixture, sigFixture } from "../../testing.ts"

const pk1 = publicKeyFixture("a".repeat(64))
const eid1 = eventIdFixture("c".repeat(64))
const RELAY = relayUrlFixture("wss://relay.example.com")

const signed = (overrides: Partial<NostrEvent> & { kind: number }): NostrEvent => ({
  id: eid1,
  pubkey: pk1,
  created_at: 1700000000,
  content: "hello",
  tags: [],
  sig: sigFixture("a".repeat(128)),
  ...overrides,
})

const note = signed({ kind: KIND_TEXT_NOTE })
const article = signed({ kind: KIND_LONGFORM_CONTENT, tags: [["d", "my-article"]] })

Deno.test("buildReaction - is a kind 7 like by default", () => {
  const event = buildReaction(note)
  assertEquals([event.kind, event.content], [KIND_REACTION, "+"])
})

Deno.test("buildReaction - carries the reaction it is given", () => {
  assertEquals(buildReaction(note, "🤙").content, "🤙")
})

Deno.test("buildReaction - tags the target as the NIP-25 example does: e with relay and author, p with relay, k", () => {
  const event = buildReaction(note, "+", RELAY)
  assertEquals(event.tags, [
    ["e", eid1, RELAY, pk1],
    ["p", pk1, RELAY],
    ["k", String(KIND_TEXT_NOTE)],
  ])
})

Deno.test("buildReaction - without a relay the e tag keeps an empty relay slot before the author", () => {
  assertEquals(buildReaction(note).tags, [["e", eid1, "", pk1], ["p", pk1], ["k", String(KIND_TEXT_NOTE)]])
})

Deno.test("buildReaction - an addressable target also gets an a tag with its coordinate, relay and author", () => {
  const aTag = buildReaction(article, "🔥", RELAY).tags.find((t) => t[0] === "a")
  assertEquals(aTag, ["a", `${KIND_LONGFORM_CONTENT}:${pk1}:my-article`, RELAY, pk1])
})

Deno.test("buildReaction - an addressable target without a d tag is addressed by the empty identifier", () => {
  const aTag = buildReaction(signed({ kind: KIND_LONGFORM_CONTENT })).tags.find((t) => t[0] === "a")
  assertEquals(aTag?.[1], `${KIND_LONGFORM_CONTENT}:${pk1}:`)
})

Deno.test("buildReaction - a replaceable target has no a tag, since NIP-25 asks for one only for an addressable event", () => {
  const event = buildReaction(signed({ kind: KIND_METADATA }))
  assertEquals(event.tags.some((t) => t[0] === "a"), false)
})

Deno.test("buildReaction - a regular target has no a tag, even with a stray d tag", () => {
  const event = buildReaction(signed({ kind: KIND_TEXT_NOTE, tags: [["d", "stray"]] }))
  assertEquals(event.tags.some((t) => t[0] === "a"), false)
})

Deno.test("buildRepost - a kind 1 note is reposted as kind 6", () => {
  assertEquals(buildRepost(note, RELAY).kind, KIND_REPOST)
})

Deno.test("buildRepost - the e tag carries the relay URL NIP-18 requires, then a p tag names the author", () => {
  assertEquals(buildRepost(note, RELAY).tags, [["e", eid1, RELAY], ["p", pk1]])
})

Deno.test("buildRepost - the content is the reposted note's JSON, its fields in NIP-01 order whatever the object's", () => {
  const { id, pubkey, created_at, kind, tags, content, sig } = note
  assertEquals(
    buildRepost({ sig, content, tags, kind, created_at, pubkey, id }, RELAY).content,
    `{"id":"${id}","pubkey":"${pubkey}","created_at":${created_at},"kind":${kind},"tags":[],"content":"hello","sig":"${sig}"}`,
  )
})

Deno.test("buildRepost - the content carries only the reposted event's own fields", () => {
  const withExtra = { ...note, seenOn: ["wss://elsewhere.example"] }
  assertEquals(JSON.parse(buildRepost(withExtra, RELAY).content), JSON.parse(JSON.stringify(note)))
})

Deno.test("buildRepost - a NIP-70 protected event is reposted with empty content", () => {
  assertEquals(buildRepost(signed({ kind: KIND_TEXT_NOTE, tags: [["-"]] }), RELAY).content, "")
})

Deno.test("buildRepost - an event whose dash tag carries a value is not protected and is embedded", () => {
  const target = signed({ kind: KIND_TEXT_NOTE, tags: [["-", "x"]] })
  assertEquals(JSON.parse(buildRepost(target, RELAY).content).id, target.id)
})

Deno.test("buildRepost - any other kind is a kind 16 generic repost with a k tag", () => {
  const event = buildRepost(signed({ kind: KIND_HIGHLIGHT }), RELAY)
  assertEquals([event.kind, event.tags], [KIND_GENERIC_REPOST, [["e", eid1, RELAY], ["p", pk1], [
    "k",
    String(KIND_HIGHLIGHT),
  ]]])
})

Deno.test("buildRepost - an addressable target also gets an a tag with its coordinate", () => {
  const aTag = buildRepost(article, RELAY).tags.find((t) => t[0] === "a")
  assertEquals(aTag, ["a", `${KIND_LONGFORM_CONTENT}:${pk1}:my-article`, RELAY])
})

Deno.test("buildRepost - a replaceable target gets an a tag, as NIP-18 asks of a replaceable event", () => {
  const aTag = buildRepost(signed({ kind: KIND_METADATA }), RELAY).tags.find((t) => t[0] === "a")
  assertEquals(aTag, ["a", `${KIND_METADATA}:${pk1}:`, RELAY])
})
