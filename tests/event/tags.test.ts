import { assertEquals, assertExists, assertStrictEquals } from "@std/assert"
import type { Tag } from "../../src/domain/value-object/nostr-event.ts"
import { eventIdFixture, publicKeyFixture, relayUrlFixture } from "../../testing.ts"
import {
  addRelayTag,
  addTag,
  extractEventIds,
  extractEventRefs,
  extractPubkeys,
  extractRelayEntries,
  extractTagValues,
  getRelayEntryMarker,
  hasRelayEntry,
  hasTag,
  removeRelayTag,
  removeTag,
  setRelayEntryUsage,
  soleTagValue,
} from "../../src/domain/service/tags.ts"

const pk1 = publicKeyFixture("a".repeat(64))
const pk2 = publicKeyFixture("b".repeat(64))
const eid1 = eventIdFixture("c".repeat(64))
const eid2 = eventIdFixture("d".repeat(64))

const sampleTags: ReadonlyArray<Tag> = [
  ["p", pk1],
  ["p", pk2],
  ["e", eid1],
  ["t", "nostr"],
  ["t", "bitcoin"],
  ["r", "wss://relay.damus.io", "read"],
  ["r", "wss://nos.lol"],
  ["word", "hello"],
  ["title", "My Note"],
]

Deno.test("extractTagValues - extracts all values for a given tag name", () => {
  assertEquals(extractTagValues(sampleTags, "p"), [pk1, pk2])
})

Deno.test("extractTagValues - returns empty array when no matching tags", () => {
  assertEquals(extractTagValues(sampleTags, "z"), [])
})

Deno.test("extractTagValues - returns empty array for empty tags", () => {
  assertEquals(extractTagValues([], "p"), [])
})

Deno.test("soleTagValue - returns the value of the one tag with that name", () => {
  assertEquals(soleTagValue(sampleTags, "title"), { state: "one", value: "My Note" })
})

Deno.test("soleTagValue - is absent when no tag has that name", () => {
  assertEquals(soleTagValue(sampleTags, "summary"), { state: "absent", value: null })
})

Deno.test("soleTagValue - is absent for a value-less tag", () => {
  assertEquals(soleTagValue([["solo"]], "solo"), { state: "absent", value: null })
})

Deno.test("soleTagValue - reads a value repeated across tags as one claim (shared ADR-0014)", () => {
  assertEquals(soleTagValue([["title", "a"], ["p", pk1], ["title", "a"]], "title"), { state: "one", value: "a" })
})

Deno.test("soleTagValue - is disagreeing for tags that name different values, whatever their order (shared ADR-0014)", () => {
  assertEquals(
    [soleTagValue([["title", "a"], ["title", "b"]], "title"), soleTagValue([["title", "b"], ["title", "a"]], "title")],
    [{ state: "disagreeing", value: null }, { state: "disagreeing", value: null }],
  )
})

Deno.test("soleTagValue - keeps the empty string as a value", () => {
  assertEquals(soleTagValue([["title", ""]], "title"), { state: "one", value: "" })
})

Deno.test("soleTagValue - an empty value disagrees with a non-empty one", () => {
  assertEquals(soleTagValue([["title", ""], ["title", "a"]], "title"), { state: "disagreeing", value: null })
})

Deno.test("extractPubkeys - extracts all p-tag values as PublicKeys", () => {
  const result = extractPubkeys(sampleTags)
  assertEquals(result.length, 2)
  assertEquals(result[0], pk1)
  assertEquals(result[1], pk2)
})

Deno.test("extractPubkeys - returns empty array when no p-tags", () => {
  assertEquals(extractPubkeys([["e", eid1]]), [])
})

Deno.test("extractPubkeys - names a pubkey tagged twice once, in the order first tagged", () => {
  assertEquals(extractPubkeys([["p", pk2], ["p", pk1], ["p", pk2]]), [pk2, pk1])
})

Deno.test("extractRelayEntries - extracts relay URLs with markers", () => {
  const result = extractRelayEntries(sampleTags)
  assertEquals(result.length, 2)
  const [firstEntry] = result
  assertExists(firstEntry)
  assertEquals(firstEntry.url, "wss://relay.damus.io")
  assertEquals(firstEntry.marker, "read")
})

Deno.test("extractRelayEntries - defaults marker to both when absent", () => {
  const result = extractRelayEntries(sampleTags)
  const secondEntry = result[1]
  assertExists(secondEntry)
  assertEquals(secondEntry.url, "wss://nos.lol")
  assertEquals(secondEntry.marker, "both")
})

Deno.test("extractRelayEntries - returns empty array when no r-tags", () => {
  assertEquals(extractRelayEntries([["p", pk1]]), [])
})

Deno.test("hasRelayEntry - true regardless of marker", () => {
  assertEquals(hasRelayEntry(sampleTags, relayUrlFixture("wss://relay.damus.io")), true)
  assertEquals(hasRelayEntry(sampleTags, relayUrlFixture("wss://nos.lol")), true)
})

Deno.test("hasRelayEntry - false when url isn't present", () => {
  assertEquals(hasRelayEntry(sampleTags, relayUrlFixture("wss://nope.example")), false)
})

Deno.test("getRelayEntryMarker - returns the explicit marker", () => {
  assertEquals(getRelayEntryMarker(sampleTags, relayUrlFixture("wss://relay.damus.io")), "read")
})

Deno.test("getRelayEntryMarker - defaults missing marker to both", () => {
  assertEquals(getRelayEntryMarker(sampleTags, relayUrlFixture("wss://nos.lol")), "both")
})

Deno.test("getRelayEntryMarker - returns null when url is not present", () => {
  assertEquals(getRelayEntryMarker(sampleTags, relayUrlFixture("wss://nope.example")), null)
})

Deno.test("addRelayTag - appends a new r tag without marker for 'both'", () => {
  const result = addRelayTag([], relayUrlFixture("wss://new.example"))
  assertEquals(result, [["r", "wss://new.example"]])
})

Deno.test("addRelayTag - appends with explicit marker when not 'both'", () => {
  const result = addRelayTag([], relayUrlFixture("wss://new.example"), "write")
  assertEquals(result, [["r", "wss://new.example", "write"]])
})

Deno.test("addRelayTag - upserts: replaces an existing r tag for the same url", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://x.example", "read"]]
  const result = addRelayTag(tags, relayUrlFixture("wss://x.example"), "write")
  assertEquals(result, [["r", "wss://x.example", "write"]])
})

Deno.test("removeRelayTag - removes any r tag for the given url regardless of marker", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://x.example", "read"], ["r", "wss://y.example"]]
  const result = removeRelayTag(tags, relayUrlFixture("wss://x.example"))
  assertEquals(result, [["r", "wss://y.example"]])
})

Deno.test("extractEventRefs - gives a null relay hint when the e tag carries none", () => {
  assertEquals(extractEventRefs(sampleTags), [{ id: eid1, relayHint: null, author: null }])
})

Deno.test("extractEventRefs - gives a null relay hint when the third column is empty", () => {
  assertEquals(extractEventRefs([["e", eid1, ""]]), [{ id: eid1, relayHint: null, author: null }])
})

Deno.test("extractEventRefs - parses the relay hint into its canonical RelayUrl", () => {
  assertEquals(extractEventRefs([["e", eid1, " WSS://Relay.Example/ "]]), [
    { id: eid1, relayHint: relayUrlFixture("wss://relay.example"), author: null },
  ])
})

Deno.test("extractEventRefs - treats a relay hint that is not a relay URL as no hint", () => {
  assertEquals(extractEventRefs([["e", eid1, "https://relay.example"]]), [{ id: eid1, relayHint: null, author: null }])
})

Deno.test("extractEventRefs - drops e tags whose value is not a valid event ID", () => {
  const tags: ReadonlyArray<Tag> = [["e", "not-an-event-id"], ["e", eid1]]
  const refs = extractEventRefs(tags)
  assertEquals(refs.length, 1)
})

Deno.test("extractEventRefs - reads the author NIP-22 and NIP-25 write after the relay of an unmarked e tag", () => {
  assertEquals(extractEventRefs([["e", eid1, "", pk1]]), [{ id: eid1, relayHint: null, author: pk1 }])
})

Deno.test("extractEventRefs - reads the author NIP-10 writes after the marker of a marked e tag", () => {
  assertEquals(extractEventRefs([["e", eid1, "", "reply", pk1]]), [{ id: eid1, relayHint: null, author: pk1 }])
})

Deno.test("extractEventRefs - reads each e tag's author from its fifth element, else its fourth (shared vector with innis/nostr-core)", () => {
  const tags: ReadonlyArray<Tag> = [
    ["e", eid1],
    ["e", eid1, "", pk1],
    ["e", eid1, "", "root", pk1],
    ["e", eid1, "", "", pk1],
    ["e", eid1, "", "reply"],
    ["e", eid1, "", "mention", pk1],
    ["e", eid1, "", "zz"],
    ["e", eid1, "", pk1, "extra"],
  ]
  assertEquals(extractEventRefs(tags).map((ref) => ref.author), [null, pk1, pk1, pk1, null, pk1, null, null])
})

Deno.test("hasTag - matches by name and value", () => {
  const tags: ReadonlyArray<Tag> = [["d", "slug-1"], ["title", "Hello"]]
  assertEquals(hasTag(tags, "d", "slug-1"), true)
  assertEquals(hasTag(tags, "title", "Hello"), true)
})

Deno.test("hasTag - returns false when value differs", () => {
  const tags: ReadonlyArray<Tag> = [["d", "slug-1"]]
  assertEquals(hasTag(tags, "d", "slug-2"), false)
})

Deno.test("hasTag - returns false when tag name differs", () => {
  const tags: ReadonlyArray<Tag> = [["d", "slug-1"]]
  assertEquals(hasTag(tags, "title", "slug-1"), false)
})

Deno.test("hasTag - returns false for empty tags", () => {
  assertEquals(hasTag([], "d", "anything"), false)
})

Deno.test("extractEventIds - extracts all e-tag values as EventIds", () => {
  const tags: ReadonlyArray<Tag> = [["e", eid1], ["e", eid2], ["p", pk1]]
  const result = extractEventIds(tags)
  assertEquals(result.length, 2)
  assertEquals(result[0], eid1)
  assertEquals(result[1], eid2)
})

Deno.test("extractEventIds - names an event tagged twice once, in the order first tagged", () => {
  assertEquals(extractEventIds([["e", eid2], ["e", eid1], ["e", eid2]]), [eid2, eid1])
})

Deno.test("extractEventIds - returns empty array when no e-tags", () => {
  assertEquals(extractEventIds([["p", pk1]]), [])
})

Deno.test("addTag - appends a new tag when none matches by name+value", () => {
  const result = addTag([], "t", "nostr")
  assertEquals(result.length, 1)
  const [added] = result
  assertExists(added)
  assertEquals(added[0], "t")
  assertEquals(added[1], "nostr")
})

Deno.test("addTag - returns the same array (no duplicate) when an identical tag exists", () => {
  const tags: ReadonlyArray<Tag> = [["word", "hello"]]
  const result = addTag(tags, "word", "hello")
  assertEquals(result, tags)
})

Deno.test("removeTag - drops the matching tag by name+value", () => {
  const tags: ReadonlyArray<Tag> = [["t", "nostr"], ["t", "bitcoin"]]
  const result = removeTag(tags, "t", "nostr")
  assertEquals(result.length, 1)
  assertEquals(hasTag(result, "t", "bitcoin"), true)
})

Deno.test("removeTag - is a no-op when no tag matches", () => {
  const tags: ReadonlyArray<Tag> = [["t", "nostr"]]
  const result = removeTag(tags, "t", "missing")
  assertEquals(result, tags)
})

Deno.test("isValidTagsArray - true for an array of valid tags, false otherwise", async () => {
  const { isValidTagsArray } = await import("../../src/domain/value-object/nostr-event.ts")
  assertEquals(isValidTagsArray([["p", "abc"], ["e", "def"]]), true)
  assertEquals(isValidTagsArray([]), true)
  assertEquals(isValidTagsArray([["p", "abc"], "not a tag"]), false)
  assertEquals(isValidTagsArray("not an array"), false)
  assertEquals(isValidTagsArray(null), false)
})

Deno.test("setRelayEntryUsage - adds a read-only entry for a new relay", () => {
  assertEquals(setRelayEntryUsage([], relayUrlFixture("wss://a.example"), { read: true }), [[
    "r",
    "wss://a.example",
    "read",
  ]])
})

Deno.test("setRelayEntryUsage - adds an entry used both ways as a bare r tag", () => {
  assertEquals(setRelayEntryUsage([], relayUrlFixture("wss://a.example"), { read: true, write: true }), [[
    "r",
    "wss://a.example",
  ]])
})

Deno.test("setRelayEntryUsage - widens a write entry to both when read is enabled", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://a.example", "write"]]
  assertEquals(setRelayEntryUsage(tags, relayUrlFixture("wss://a.example"), { read: true }), [["r", "wss://a.example"]])
})

Deno.test("setRelayEntryUsage - narrows a both entry to write when read is disabled", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://a.example"]]
  assertEquals(setRelayEntryUsage(tags, relayUrlFixture("wss://a.example"), { read: false }), [[
    "r",
    "wss://a.example",
    "write",
  ]])
})

Deno.test("setRelayEntryUsage - removes the entry when its last use is disabled", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://a.example", "read"]]
  assertEquals(setRelayEntryUsage(tags, relayUrlFixture("wss://a.example"), { read: false }), [])
})

Deno.test("setRelayEntryUsage - swaps read for write in one change", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://a.example", "read"]]
  assertEquals(setRelayEntryUsage(tags, relayUrlFixture("wss://a.example"), { read: false, write: true }), [
    ["r", "wss://a.example", "write"],
  ])
})

Deno.test("setRelayEntryUsage - returns the same tags when nothing changes", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://a.example", "read"]]
  assertStrictEquals(setRelayEntryUsage(tags, relayUrlFixture("wss://a.example"), { read: true }), tags)
})

Deno.test("setRelayEntryUsage - returns the same tags when disabling a relay that is not listed", () => {
  const tags: ReadonlyArray<Tag> = []
  assertStrictEquals(setRelayEntryUsage(tags, relayUrlFixture("wss://a.example"), { write: false }), tags)
})

Deno.test("setRelayEntryUsage - leaves a direction given as undefined as it was", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://a.example", "write"]]
  assertEquals(setRelayEntryUsage(tags, relayUrlFixture("wss://a.example"), { read: true, write: undefined }), [[
    "r",
    "wss://a.example",
  ]])
})

Deno.test("hasRelayEntry - matches an r tag written in a non-canonical form of the same URL", () => {
  assertEquals(hasRelayEntry([["r", "wss://Relay.com/"]], relayUrlFixture("wss://relay.com")), true)
})

Deno.test("getRelayEntryMarker - reads the marker of an r tag written in a non-canonical form", () => {
  assertEquals(getRelayEntryMarker([["r", "WSS://relay.com/", "write"]], relayUrlFixture("wss://relay.com")), "write")
})

Deno.test("addRelayTag - replaces a non-canonical equivalent with one canonical r tag", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://Relay.com/", "read"], ["p", "x"], ["r", "wss://relay.com"]]
  assertEquals(addRelayTag(tags, relayUrlFixture("wss://relay.com"), "write"), [["r", "wss://relay.com", "write"], [
    "p",
    "x",
  ]])
})

Deno.test("removeRelayTag - removes every r tag equivalent to the URL", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://Relay.com/"], ["r", "wss://relay.com", "read"], [
    "r",
    "wss://y.example",
  ]]
  assertEquals(removeRelayTag(tags, relayUrlFixture("wss://relay.com")), [["r", "wss://y.example"]])
})

Deno.test("setRelayEntryUsage - toggles an entry written in a non-canonical form", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://Relay.com/", "read"]]
  assertEquals(setRelayEntryUsage(tags, relayUrlFixture("wss://relay.com"), { write: true }), [[
    "r",
    "wss://relay.com",
  ]])
})

Deno.test("extractTagValues - reads a value repeated across tags once, keeps the empty string and first-seen order (shared ADR-0079)", () => {
  assertEquals(
    extractTagValues([["u", "b"], ["x", "a"], ["u", "a"], ["u", "b"], ["u", ""], ["u"]], "u"),
    ["b", "a", ""],
  )
})

Deno.test("getRelayEntryMarker - reads a read tag and a write tag for one relay as both, in either order", () => {
  const url = relayUrlFixture("wss://relay.com")
  assertEquals(getRelayEntryMarker([["r", "wss://relay.com", "read"], ["r", "WSS://relay.com/", "write"]], url), "both")
  assertEquals(getRelayEntryMarker([["r", "WSS://relay.com/", "write"], ["r", "wss://relay.com", "read"]], url), "both")
})

Deno.test("getRelayEntryMarker - reads a repeated read tag for one relay as read", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://relay.com", "read"], ["r", "wss://Relay.com/", "read"]]
  assertEquals(getRelayEntryMarker(tags, relayUrlFixture("wss://relay.com")), "read")
})

Deno.test("getRelayEntryMarker - reads a marker NIP-65 does not define as both", () => {
  assertEquals(getRelayEntryMarker([["r", "wss://relay.com", "readwrite"]], relayUrlFixture("wss://relay.com")), "both")
})

Deno.test("setRelayEntryUsage - keeps a relay's write direction held in a second tag when read is disabled, in either order", () => {
  const url = relayUrlFixture("wss://relay.com")
  const expected: ReadonlyArray<Tag> = [["r", "wss://relay.com", "write"]]
  assertEquals(
    setRelayEntryUsage([["r", "wss://relay.com", "read"], ["r", "wss://relay.com", "write"]], url, { read: false }),
    expected,
  )
  assertEquals(
    setRelayEntryUsage([["r", "wss://relay.com", "write"], ["r", "wss://relay.com", "read"]], url, { read: false }),
    expected,
  )
})

Deno.test("setRelayEntryUsage - rewrites a relay split across tags as one canonical tag when its usage is unchanged", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://relay.com", "read"], ["p", "x"], ["r", "wss://Relay.com/", "write"]]
  assertEquals(setRelayEntryUsage(tags, relayUrlFixture("wss://relay.com"), { read: true }), [
    ["r", "wss://relay.com"],
    ["p", "x"],
  ])
})

Deno.test("setRelayEntryUsage - rewrites a non-canonical tag in canonical form when its usage is unchanged", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://Relay.com/", "read"]]
  assertEquals(setRelayEntryUsage(tags, relayUrlFixture("wss://relay.com"), { read: true }), [
    ["r", "wss://relay.com", "read"],
  ])
})
