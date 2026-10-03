import { assertEquals } from "@std/assert"
import { analyseEvent } from "../../src/domain/service/event-analysis.ts"
import { formatAddressableRef } from "../../src/domain/value-object/addressable-ref.ts"
import type { EventOrAddressRef } from "../../src/domain/value-object/event-or-address-ref.ts"
import type { EventId } from "../../src/domain/value-object/event-id.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import type { KindMetadata } from "../../src/domain/service/event-analysis.ts"
import { eventIdFixture, publicKeyFixture, sigFixture } from "../../testing.ts"
import {
  KIND_COMMENT,
  KIND_HIGHLIGHT,
  KIND_LONGFORM_CONTENT,
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

Deno.test("analyseEvent - longform reads repeated identical metadata tags as one claim (shared ADR-0014)", () => {
  const raw = makeEvent({
    kind: KIND_LONGFORM_CONTENT,
    tags: [["title", "T"], ["title", "T"], ["published_at", "5"], ["published_at", "5"]],
  })
  const longform = expectKindData(analyseEvent(raw).kindData, "longform")
  assertEquals([longform.title, longform.publishedAt], ["T", 5])
})

Deno.test("analyseEvent - longform metadata tags that disagree state nothing, whatever their order (shared ADR-0014)", () => {
  const tags: ReadonlyArray<readonly [string, string]> = [
    ["title", "A"],
    ["summary", "S1"],
    ["image", "https://example.com/1.jpg"],
    ["published_at", "1"],
    ["title", "B"],
    ["summary", "S2"],
    ["image", "https://example.com/2.jpg"],
    ["published_at", "2"],
  ]
  const longform = expectKindData(analyseEvent(makeEvent({ kind: KIND_LONGFORM_CONTENT, tags })).kindData, "longform")
  assertEquals([longform.title, longform.summary, longform.image, longform.publishedAt], [null, null, null, null])
})

Deno.test("analyseEvent - longform topics are read lower-cased and once each (NIP-24: t values are lowercase)", () => {
  const raw = makeEvent({ kind: KIND_LONGFORM_CONTENT, tags: [["t", "Nostr"], ["t", "nostr"], ["t", "Ελλάδα"]] })
  assertEquals(expectKindData(analyseEvent(raw).kindData, "longform").topics, ["nostr", "ελλάδα"])
})

Deno.test("analyseEvent - highlight context and comment tags that disagree state nothing (shared ADR-0014)", () => {
  const raw = makeEvent({
    kind: KIND_HIGHLIGHT,
    tags: [["context", "c1"], ["comment", "m1"], ["context", "c2"], ["comment", "m2"]],
  })
  const highlight = expectKindData(analyseEvent(raw).kindData, "highlight")
  assertEquals([highlight.context, highlight.comment], [null, null])
})

Deno.test("analyseEvent - an empty highlight context or comment is read as the empty string", () => {
  const raw = makeEvent({ kind: KIND_HIGHLIGHT, tags: [["context", ""], ["comment", ""]] })
  const highlight = expectKindData(analyseEvent(raw).kindData, "highlight")
  assertEquals([highlight.context, highlight.comment], ["", ""])
})

Deno.test("analyseEvent - a highlight's source is its a coordinate before its e id, whatever the tag order (NIP-84)", () => {
  const coordinate = formatAddressableRef({ kind: KIND_LONGFORM_CONTENT, pubkey: pk2, dTag: "my-article" })
  const raw = makeEvent({ kind: KIND_HIGHLIGHT, tags: [["e", eid2], ["a", coordinate]] })
  assertEquals(expectKindData(analyseEvent(raw).kindData, "highlight").source, articleRef(pk2))
})

Deno.test("analyseEvent - a repost's e tags that name different events name no original (shared ADR-0014)", () => {
  const raw = makeEvent({ kind: KIND_REPOST, tags: [["e", eid2], ["e", eid3]] })
  assertEquals(expectKindData(analyseEvent(raw).kindData, "repost").original, null)
})

Deno.test("analyseEvent - a comment whose E tags disagree has no root, even beside a parent (shared ADR-0014)", () => {
  const raw = makeEvent({ kind: KIND_COMMENT, tags: [["E", eid2], ["E", eid3], ["K", "1"], ["e", eid2], ["k", "1"]] })
  assertEquals(analyseEvent(raw).refs.rootEvent, null)
})

Deno.test("analyseEvent - a comment whose A tags disagree falls back to its E root (shared ADR-0014)", () => {
  const first = formatAddressableRef({ kind: KIND_LONGFORM_CONTENT, pubkey: pk2, dTag: "one" })
  const second = formatAddressableRef({ kind: KIND_LONGFORM_CONTENT, pubkey: pk2, dTag: "two" })
  const raw = makeEvent({ kind: KIND_COMMENT, tags: [["A", first], ["A", second], ["E", eid3]] })
  assertEquals(analyseEvent(raw).refs.rootEvent, eventRef(eid3))
})

Deno.test("analyseEvent - a short note whose root-marked e tags disagree has no root and keeps its parent (shared ADR-0014)", () => {
  const raw = makeEvent({
    kind: KIND_TEXT_NOTE,
    tags: [["e", eid2, "", "root"], ["e", eid3, "", "root"], ["e", eid1, "", "reply"]],
  })
  const { refs } = analyseEvent(raw)
  assertEquals([refs.rootEvent, refs.replyToEvent], [null, eventRef(eid1)])
})

Deno.test("analyseEvent - a short note repeating one root-marked e tag reads it once (shared ADR-0014)", () => {
  const raw = makeEvent({
    kind: KIND_TEXT_NOTE,
    tags: [["e", eid2, "", "root"], ["e", eid2, "wss://r.example", "root"]],
  })
  assertEquals(analyseEvent(raw).refs.rootEvent, eventRef(eid2))
})

Deno.test("analyseEvent - a comment whose e tags name different events has no parent, not the first or the last (shared ADR-0014)", () => {
  const raw = makeEvent({
    kind: KIND_COMMENT,
    tags: [["e", eid2], ["e", eid3]],
  })
  const result = analyseEvent(raw)
  assertEquals(result.refs.replyToEvent, null)
})

Deno.test("analyseEvent - longform published_at that is not decimal digits states no time", () => {
  const raw = makeEvent({ kind: KIND_LONGFORM_CONTENT, tags: [["published_at", "1e3"]] })
  assertEquals(expectKindData(analyseEvent(raw).kindData, "longform").publishedAt, null)
})
