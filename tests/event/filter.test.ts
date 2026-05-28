import { assertEquals } from "@std/assert"
import { matchesAnyFilter, matchesFilter } from "../../src/domain/service/filter.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import { parseEventId } from "../../src/domain/value-object/event-id.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"
import { parseSig } from "../../src/domain/value-object/sig.ts"

const eventId = parseEventId("a".repeat(64))
const otherEventId = parseEventId("b".repeat(64))
const author = parsePublicKey("c".repeat(64))
const otherAuthor = parsePublicKey("d".repeat(64))

const makeEvent = (overrides: Partial<NostrEvent> = {}): NostrEvent => ({
  id: eventId,
  pubkey: author,
  kind: 1,
  created_at: 1000,
  tags: [],
  content: "hello",
  sig: parseSig("a".repeat(128)),
  ...overrides,
})

Deno.test("matchesFilter - empty filter matches everything", () => {
  assertEquals(matchesFilter(makeEvent(), {}), true)
})

Deno.test("matchesFilter - matches by kind", () => {
  assertEquals(matchesFilter(makeEvent({ kind: 1 }), { kinds: [1, 3] }), true)
  assertEquals(matchesFilter(makeEvent({ kind: 7 }), { kinds: [1, 3] }), false)
})

Deno.test("matchesFilter - matches by author", () => {
  assertEquals(matchesFilter(makeEvent(), { authors: [author] }), true)
  assertEquals(matchesFilter(makeEvent(), { authors: [otherAuthor] }), false)
})

Deno.test("matchesFilter - matches by id", () => {
  assertEquals(matchesFilter(makeEvent(), { ids: [eventId] }), true)
  assertEquals(matchesFilter(makeEvent(), { ids: [otherEventId] }), false)
})

Deno.test("matchesFilter - matches by since", () => {
  assertEquals(matchesFilter(makeEvent({ created_at: 1000 }), { since: 999 }), true)
  assertEquals(matchesFilter(makeEvent({ created_at: 1000 }), { since: 1001 }), false)
})

Deno.test("matchesFilter - matches by until", () => {
  assertEquals(matchesFilter(makeEvent({ created_at: 1000 }), { until: 1001 }), true)
  assertEquals(matchesFilter(makeEvent({ created_at: 1000 }), { until: 999 }), false)
})

Deno.test("matchesFilter - matches by tag", () => {
  const event = makeEvent({ tags: [["e", "ref1"], ["p", "pub1"]] })
  assertEquals(matchesFilter(event, { "#e": ["ref1"] }), true)
  assertEquals(matchesFilter(event, { "#e": ["other"] }), false)
  assertEquals(matchesFilter(event, { "#p": ["pub1"] }), true)
})

Deno.test("matchesFilter - combines multiple criteria", () => {
  const event = makeEvent({ kind: 1, tags: [["e", "ref1"]] })
  assertEquals(matchesFilter(event, { kinds: [1], "#e": ["ref1"] }), true)
  assertEquals(matchesFilter(event, { kinds: [3], "#e": ["ref1"] }), false)
})

Deno.test("matchesFilter - matches multi-character tag names", () => {
  const event = makeEvent({ tags: [["client", "hubstr"], ["t", "nostr"]] })
  assertEquals(matchesFilter(event, { "#client": ["hubstr"] }), true)
  assertEquals(matchesFilter(event, { "#client": ["other"] }), false)
  assertEquals(matchesFilter(event, { "#t": ["nostr"] }), true)
  assertEquals(matchesFilter(event, { "#proxy": ["anything"] }), false)
})

Deno.test("matchesAnyFilter - matches if any filter matches", () => {
  const event = makeEvent({ kind: 1 })
  assertEquals(matchesAnyFilter(event, [{ kinds: [3] }, { kinds: [1] }]), true)
  assertEquals(matchesAnyFilter(event, [{ kinds: [3] }, { kinds: [7] }]), false)
})
