import { assertEquals, assertThrows } from "@std/assert"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import { canFilterMatch, compileFilter, compileFilters } from "../../src/domain/service/filter.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import type { NostrFilter } from "../../src/domain/value-object/nostr-filter.ts"
import { eventIdFixture, publicKeyFixture, sigFixture } from "../../testing.ts"

const eventId = eventIdFixture("a".repeat(64))
const otherEventId = eventIdFixture("b".repeat(64))
const author = publicKeyFixture("c".repeat(64))
const otherAuthor = publicKeyFixture("d".repeat(64))
const ref1 = eventIdFixture("1".repeat(64))
const other = eventIdFixture("2".repeat(64))
const pub1 = publicKeyFixture("3".repeat(64))

const makeEvent = (overrides: Partial<NostrEvent> = {}): NostrEvent => ({
  id: eventId,
  pubkey: author,
  kind: 1,
  created_at: 1000,
  tags: [],
  content: "hello",
  sig: sigFixture("a".repeat(128)),
  ...overrides,
})

Deno.test("compileFilter - empty filter matches everything", () => {
  assertEquals(compileFilter({}).matches(makeEvent()), true)
})

Deno.test("compileFilter - matches by kind", () => {
  assertEquals(compileFilter({ kinds: [1, 3] }).matches(makeEvent({ kind: 1 })), true)
  assertEquals(compileFilter({ kinds: [1, 3] }).matches(makeEvent({ kind: 7 })), false)
})

Deno.test("compileFilter - matches by author", () => {
  assertEquals(compileFilter({ authors: [author] }).matches(makeEvent()), true)
  assertEquals(compileFilter({ authors: [otherAuthor] }).matches(makeEvent()), false)
})

Deno.test("compileFilter - matches by id", () => {
  assertEquals(compileFilter({ ids: [eventId] }).matches(makeEvent()), true)
  assertEquals(compileFilter({ ids: [otherEventId] }).matches(makeEvent()), false)
})

Deno.test("compileFilter - matches by since", () => {
  assertEquals(compileFilter({ since: 999 }).matches(makeEvent({ created_at: 1000 })), true)
  assertEquals(compileFilter({ since: 1001 }).matches(makeEvent({ created_at: 1000 })), false)
})

Deno.test("compileFilter - matches by until", () => {
  assertEquals(compileFilter({ until: 1001 }).matches(makeEvent({ created_at: 1000 })), true)
  assertEquals(compileFilter({ until: 999 }).matches(makeEvent({ created_at: 1000 })), false)
})

Deno.test("compileFilter - matches by tag", () => {
  const event = makeEvent({ tags: [["e", ref1], ["p", pub1]] })
  assertEquals(compileFilter({ "#e": [ref1] }).matches(event), true)
  assertEquals(compileFilter({ "#e": [other] }).matches(event), false)
  assertEquals(compileFilter({ "#p": [pub1] }).matches(event), true)
})

Deno.test("compileFilter - combines multiple criteria", () => {
  const event = makeEvent({ kind: 1, tags: [["e", ref1]] })
  assertEquals(compileFilter({ kinds: [1], "#e": [ref1] }).matches(event), true)
  assertEquals(compileFilter({ kinds: [3], "#e": [ref1] }).matches(event), false)
})

Deno.test("compileFilter - a list with no values matches nothing, whichever attribute holds it (ADR-0029)", () => {
  const event = makeEvent({ tags: [["t", "nostr"]] })
  for (const filter of [{ ids: [] }, { authors: [] }, { kinds: [] }, { "#t": [] }]) {
    assertEquals(compileFilter(filter).matches(event), false, JSON.stringify(filter))
  }
})

Deno.test("compileFilter - a # key that is not one letter is no NIP-01 tag condition, so the filter matches nothing (ADR-0029)", () => {
  const filter: Record<string, ReadonlyArray<string>> = { "#client": ["hubstr"] }
  const event = makeEvent({ tags: [["client", "hubstr"]] })
  assertEquals(compileFilter(filter).matches(event), false)
})

Deno.test("compileFilter - a tag key holding undefined is absent, not an empty list", () => {
  assertEquals(compileFilter({ "#t": undefined }).matches(makeEvent()), true)
})

Deno.test("compileFilter - an upper-case tag letter is its own tag name (NIP-01: a-zA-Z)", () => {
  const event = makeEvent({ tags: [["E", ref1]] })
  assertEquals([compileFilter({ "#E": [ref1] }).matches(event), compileFilter({ "#e": [ref1] }).matches(event)], [
    true,
    false,
  ])
})

Deno.test("compileFilters - matches if any filter matches", () => {
  const event = makeEvent({ kind: 1 })
  assertEquals(compileFilters([{ kinds: [3] }, { kinds: [1] }]).matches(event), true)
  assertEquals(compileFilters([{ kinds: [3] }, { kinds: [7] }]).matches(event), false)
})

Deno.test("compileFilter - compiled predicate is reusable across events", () => {
  const { matches } = compileFilter({ kinds: [1], authors: [author], "#e": [ref1] })
  assertEquals(matches(makeEvent({ tags: [["e", ref1]] })), true)
  assertEquals(matches(makeEvent({ tags: [["e", other]] })), false)
  assertEquals(matches(makeEvent({ kind: 3, tags: [["e", ref1]] })), false)
  assertEquals(matches(makeEvent({ pubkey: otherAuthor, tags: [["e", ref1]] })), false)
})

Deno.test("compileFilter - empty filter matches everything", () => {
  assertEquals(compileFilter({}).matches(makeEvent()), true)
})

Deno.test("compileFilter - ignores tags with empty values", () => {
  const { matches } = compileFilter({ "#e": [ref1] })
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

Deno.test("compileFilter - a tag filter for the empty value matches a tag carrying the empty value", () => {
  const event = makeEvent({ tags: [["d", ""]] })
  assertEquals(compileFilter({ "#d": [""] }).matches(event), true)
})

Deno.test("compileFilter - a tag filter for the empty value does not match a tag with no value", () => {
  const event = makeEvent({ tags: [["d"]] })
  assertEquals(compileFilter({ "#d": [""] }).matches(event), false)
})

Deno.test("NostrFilter - #e and #p hold branded lowercase hex, as NIP-01 requires", () => {
  const filter = { "#e": [ref1], "#p": [pub1] }
  assertEquals(compileFilter(filter).matches(makeEvent({ tags: [["e", ref1], ["p", pub1]] })), true)
})

Deno.test("canFilterMatch - true for a filter every list of which holds a value", () => {
  assertEquals(canFilterMatch({ kinds: [1], "#t": ["nostr"], since: 10, until: 10 }), true)
})

Deno.test("canFilterMatch - false for an empty list, an unknown # key, or a since after its until", () => {
  const unknownKey: Record<string, ReadonlyArray<string>> = { "#topic": ["x"] }
  assertEquals([{ kinds: [] }, { "#t": [] }, unknownKey, { since: 20, until: 10 }].map(canFilterMatch), [
    false,
    false,
    false,
    false,
  ])
})

const NULLABLE_FILTER_FIELDS = ["ids", "authors", "kinds", "#e", "#p", "#t", "since", "until", "limit", "search"]

for (const field of NULLABLE_FILTER_FIELDS) {
  Deno.test(`canFilterMatch - a ${field} forced past NostrFilter as null throws (shared ADR-0069)`, () => {
    const forced: NostrFilter = JSON.parse(`{"kinds":[1],"${field}":null}`)
    assertThrows(() => canFilterMatch(forced), InvalidArgumentError, field)
  })
}

Deno.test("compileFilter - a field forced past NostrFilter as null throws (shared ADR-0069)", () => {
  const forced: NostrFilter = JSON.parse(`{"limit":null}`)
  assertThrows(() => compileFilter(forced), InvalidArgumentError, "limit")
})

Deno.test("canFilterMatch - an absent field written as undefined is no condition", () => {
  assertEquals(canFilterMatch({ kinds: [1], limit: undefined, "#t": undefined }), true)
})

Deno.test("compileFilter - a search matches an event whose content holds every term, in any case (shared ADR-0082)", () => {
  assertEquals(compileFilter({ search: "Nostr  RELAYS" }).matches(makeEvent({ content: "relays for nostr" })), true)
})

Deno.test("compileFilter - a search does not match an event whose content lacks a term", () => {
  assertEquals(compileFilter({ search: "nostr relays" }).matches(makeEvent({ content: "nostr clients" })), false)
})

Deno.test("compileFilter - a search matches a term inside a word", () => {
  assertEquals(compileFilter({ search: "lay" }).matches(makeEvent({ content: "relays" })), true)
})

Deno.test("compileFilter - a search of only whitespace matches every event", () => {
  assertEquals(compileFilter({ search: " \t " }).matches(makeEvent({ content: "anything" })), true)
})

Deno.test("compileFilter - a search strips NUL at its ends before splitting, as PHP's trim does (shared ADR-0082)", () => {
  assertEquals(compileFilter({ search: "\0nostr\0" }).matches(makeEvent({ content: "nostr" })), true)
})

Deno.test("compileFilter - a search keeps a NUL inside it as part of a term", () => {
  assertEquals(compileFilter({ search: "a\0b" }).matches(makeEvent({ content: "a b" })), false)
})

Deno.test("compileFilter - a search matches a NUL inside a term only against a NUL, as PHP's matcher does", () => {
  const filter = compileFilter({ search: "a\0b" })
  assertEquals(
    [filter.matches(makeEvent({ content: "xa\0by" })), filter.matches(makeEvent({ content: "ab" }))],
    [true, false],
  )
})

Deno.test("compileFilter - a search keeps a NUL that starts an inner term, trimming NUL only at the search's ends", () => {
  const filter = compileFilter({ search: "x \0b" })
  assertEquals(
    [filter.matches(makeEvent({ content: "x \0b" })), filter.matches(makeEvent({ content: "x b" }))],
    [true, false],
  )
})

Deno.test("compileFilter - a search splits on vertical tab and form feed but not on a no-break space", () => {
  const filter = compileFilter({ search: "c\vd\fe\u00a0f" })
  assertEquals([
    filter.matches(makeEvent({ content: "e\u00a0f d c" })),
    filter.matches(makeEvent({ content: "c d e f" })),
  ], [
    true,
    false,
  ])
})

Deno.test("compileFilter - a search ignores a key:value extension term (NIP-50, shared ADR-0082)", () => {
  assertEquals(compileFilter({ search: "nostr language:en" }).matches(makeEvent({ content: "nostr relays" })), true)
})

Deno.test("compileFilter - a search still requires its other terms beside an extension", () => {
  assertEquals(compileFilter({ search: "nostr include:spam" }).matches(makeEvent({ content: "relays" })), false)
})

Deno.test("compileFilter - a search of only extensions matches what the rest of the filter matches", () => {
  const filter = compileFilter({ kinds: [1], search: "include:spam nsfw:false" })
  assertEquals([filter.matches(makeEvent({ kind: 1 })), filter.matches(makeEvent({ kind: 2 }))], [true, false])
})

Deno.test("compileFilter - an extension is a key starting with a letter, a colon and a value with no colon or slash", () => {
  const event = makeEvent({ content: "relays" })
  assertEquals(
    ["language:en", "domain:example.com", "include:spam", "nsfw:false"].map((search) =>
      compileFilter({ search }).matches(event)
    ),
    [true, true, true, true],
  )
})

Deno.test("compileFilter - a URL, a time, an empty side or a second colon is a term, not an extension", () => {
  const event = makeEvent({ content: "relays" })
  assertEquals(
    ["https://x.com", "12:30", ":en", "language:", "a:b:c", ":"].map((search) =>
      compileFilter({ search }).matches(event)
    ),
    [false, false, false, false, false, false],
  )
})

Deno.test("compileFilter - a URL in a search is matched as a term", () => {
  assertEquals(compileFilter({ search: "https://x.com" }).matches(makeEvent({ content: "see https://x.com" })), true)
})

Deno.test("compileFilter - a search reads only the content, not the tags", () => {
  assertEquals(compileFilter({ search: "nostr" }).matches(makeEvent({ content: "", tags: [["t", "nostr"]] })), false)
})
