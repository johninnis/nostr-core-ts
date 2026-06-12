import { assertEquals } from "@std/assert"
import { compileFilter, compileFilters, matchesAnyFilter, matchesFilter } from "../../src/domain/service/filter.ts"
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

Deno.test("compileFilter - compiled predicate is reusable across events", () => {
  const { matches } = compileFilter({ kinds: [1], authors: [author], "#e": ["ref1"] })
  assertEquals(matches(makeEvent({ tags: [["e", "ref1"]] })), true)
  assertEquals(matches(makeEvent({ tags: [["e", "other"]] })), false)
  assertEquals(matches(makeEvent({ kind: 3, tags: [["e", "ref1"]] })), false)
  assertEquals(matches(makeEvent({ pubkey: otherAuthor, tags: [["e", "ref1"]] })), false)
})

Deno.test("compileFilter - empty filter matches everything", () => {
  assertEquals(compileFilter({}).matches(makeEvent()), true)
})

Deno.test("compileFilter - ignores tags with empty values", () => {
  const { matches } = compileFilter({ "#e": ["ref1"] })
  assertEquals(matches(makeEvent({ tags: [["e", ""]] })), false)
  assertEquals(matches(makeEvent({ tags: [["e"]] })), false)
})

Deno.test("compileFilters - OR semantics across filters", () => {
  const { matches } = compileFilters([{ kinds: [3] }, { authors: [author] }])
  assertEquals(matches(makeEvent({ kind: 1 })), true)
  assertEquals(matches(makeEvent({ kind: 3, pubkey: otherAuthor })), true)
  assertEquals(matches(makeEvent({ kind: 1, pubkey: otherAuthor })), false)
})

Deno.test("compileFilters - empty filter list matches nothing", () => {
  assertEquals(compileFilters([]).matches(makeEvent()), false)
})
