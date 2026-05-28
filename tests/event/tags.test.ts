import { assertEquals, assertExists } from "@std/assert"
import type { Tag } from "../../src/domain/value-object/nostr-event.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"
import { parseEventId } from "../../src/domain/value-object/event-id.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"
import { SignerError } from "../../src/domain/exception/signer-error.ts"
import {
  addEventTag,
  addPubkeyTag,
  addRelayTag,
  addTag,
  decryptPrivateEntries,
  extractEventIds,
  extractEventRefs,
  extractFullList,
  extractPubkeys,
  extractRelayEntries,
  extractTagValues,
  getRelayEntryMarker,
  getTagValue,
  hasEventId,
  hasPubkey,
  hasRelayEntry,
  hasTag,
  removeEventTag,
  removePubkeyTag,
  removeRelayTag,
  removeTag,
} from "../../src/domain/service/tags.ts"
import type { DecryptFn } from "../../src/domain/service/tags.ts"

const pk1 = parsePublicKey("a".repeat(64))
const pk2 = parsePublicKey("b".repeat(64))
const eid1 = parseEventId("c".repeat(64))
const eid2 = parseEventId("d".repeat(64))

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

Deno.test("getTagValue - returns first matching tag value", () => {
  assertEquals(getTagValue(sampleTags, "title"), "My Note")
})

Deno.test("getTagValue - returns null when tag not found", () => {
  assertEquals(getTagValue(sampleTags, "summary"), null)
})

Deno.test("getTagValue - returns null for a value-less tag", () => {
  assertEquals(getTagValue([["solo"]], "solo"), null)
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
  assertEquals(hasRelayEntry(sampleTags, "wss://relay.damus.io"), true)
  assertEquals(hasRelayEntry(sampleTags, "wss://nos.lol"), true)
})

Deno.test("hasRelayEntry - false when url isn't present", () => {
  assertEquals(hasRelayEntry(sampleTags, "wss://nope.example"), false)
})

Deno.test("getRelayEntryMarker - returns the explicit marker", () => {
  assertEquals(getRelayEntryMarker(sampleTags, "wss://relay.damus.io"), "read")
})

Deno.test("getRelayEntryMarker - defaults missing marker to both", () => {
  assertEquals(getRelayEntryMarker(sampleTags, "wss://nos.lol"), "both")
})

Deno.test("getRelayEntryMarker - returns null when url is not present", () => {
  assertEquals(getRelayEntryMarker(sampleTags, "wss://nope.example"), null)
})

Deno.test("addRelayTag - appends a new r tag without marker for 'both'", () => {
  const result = addRelayTag([], "wss://new.example")
  assertEquals(result, [["r", "wss://new.example"]])
})

Deno.test("addRelayTag - appends with explicit marker when not 'both'", () => {
  const result = addRelayTag([], "wss://new.example", "write")
  assertEquals(result, [["r", "wss://new.example", "write"]])
})

Deno.test("addRelayTag - upserts: replaces an existing r tag for the same url", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://x.example", "read"]]
  const result = addRelayTag(tags, "wss://x.example", "write")
  assertEquals(result, [["r", "wss://x.example", "write"]])
})

Deno.test("removeRelayTag - removes any r tag for the given url regardless of marker", () => {
  const tags: ReadonlyArray<Tag> = [["r", "wss://x.example", "read"], ["r", "wss://y.example"]]
  const result = removeRelayTag(tags, "wss://x.example")
  assertEquals(result, [["r", "wss://y.example"]])
})

Deno.test("extractEventRefs - extracts (id, relayHint?) entries from valid e tags", () => {
  const refs = extractEventRefs(sampleTags)
  assertEquals(refs.length, 1)
  const [first] = refs
  assertExists(first)
  assertEquals(first.id, eid1)
  assertEquals(first.relayHint, undefined)
})

Deno.test("extractEventRefs - keeps the relay hint when present and non-empty", () => {
  const tags: ReadonlyArray<Tag> = [["e", eid1, "wss://relay.example"]]
  const refs = extractEventRefs(tags)
  const [first] = refs
  assertExists(first)
  assertEquals(first.relayHint, "wss://relay.example")
})

Deno.test("extractEventRefs - drops e tags whose value is not a valid event ID", () => {
  const tags: ReadonlyArray<Tag> = [["e", "not-an-event-id"], ["e", eid1]]
  const refs = extractEventRefs(tags)
  assertEquals(refs.length, 1)
})

Deno.test("hasPubkey - returns true when pubkey exists in tags", () => {
  assertEquals(hasPubkey(sampleTags, pk1), true)
})

Deno.test("hasPubkey - returns false when pubkey not in tags", () => {
  const other = parsePublicKey("f".repeat(64))
  assertEquals(hasPubkey(sampleTags, other), false)
})

Deno.test("hasPubkey - returns false for empty tags", () => {
  assertEquals(hasPubkey([], pk1), false)
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

Deno.test("addPubkeyTag - adds pubkey when not present", () => {
  const tags: ReadonlyArray<Tag> = [["e", eid1]]
  const result = addPubkeyTag(tags, pk1)
  assertEquals(result.length, 2)
  const addedTag = result[1]
  assertExists(addedTag)
  assertEquals(addedTag[0], "p")
  assertEquals(addedTag[1], pk1)
})

Deno.test("addPubkeyTag - does not duplicate existing pubkey", () => {
  const tags: ReadonlyArray<Tag> = [["p", pk1]]
  const result = addPubkeyTag(tags, pk1)
  assertEquals(result.length, 1)
})

Deno.test("removePubkeyTag - removes matching pubkey tag", () => {
  const tags: ReadonlyArray<Tag> = [["p", pk1], ["p", pk2], ["e", eid1]]
  const result = removePubkeyTag(tags, pk1)
  assertEquals(result.length, 2)
  assertEquals(hasPubkey(result, pk1), false)
  assertEquals(hasPubkey(result, pk2), true)
})

Deno.test("removePubkeyTag - returns same array when pubkey not found", () => {
  const tags: ReadonlyArray<Tag> = [["p", pk1]]
  const other = parsePublicKey("f".repeat(64))
  const result = removePubkeyTag(tags, other)
  assertEquals(result.length, 1)
})

Deno.test("extractEventIds - extracts all e-tag values as EventIds", () => {
  const tags: ReadonlyArray<Tag> = [["e", eid1], ["e", eid2], ["p", pk1]]
  const result = extractEventIds(tags)
  assertEquals(result.length, 2)
  assertEquals(result[0], eid1)
  assertEquals(result[1], eid2)
})

Deno.test("extractEventIds - returns empty array when no e-tags", () => {
  assertEquals(extractEventIds([["p", pk1]]), [])
})

Deno.test("hasEventId - returns true when event ID exists in tags", () => {
  assertEquals(hasEventId(sampleTags, eid1), true)
})

Deno.test("hasEventId - returns false when event ID not in tags", () => {
  assertEquals(hasEventId(sampleTags, eid2), false)
})

Deno.test("addEventTag - adds event ID when not present", () => {
  const tags: ReadonlyArray<Tag> = [["p", pk1]]
  const result = addEventTag(tags, eid1)
  assertEquals(result.length, 2)
  const addedTag = result[1]
  assertExists(addedTag)
  assertEquals(addedTag[0], "e")
  assertEquals(addedTag[1], eid1)
})

Deno.test("addEventTag - does not duplicate existing event ID", () => {
  const tags: ReadonlyArray<Tag> = [["e", eid1]]
  const result = addEventTag(tags, eid1)
  assertEquals(result.length, 1)
})

Deno.test("removeEventTag - removes matching event tag", () => {
  const tags: ReadonlyArray<Tag> = [["e", eid1], ["e", eid2]]
  const result = removeEventTag(tags, eid1)
  assertEquals(result.length, 1)
  assertEquals(hasEventId(result, eid1), false)
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

Deno.test("decryptPrivateEntries - ok([]) for empty content", async () => {
  const result = await decryptPrivateEntries("", pk1, async () => ok(""))
  assertEquals(result.success, true)
  if (result.success) assertEquals(result.value, [])
})

Deno.test("decryptPrivateEntries - returns parsed tags from decrypted content", async () => {
  const decryptFn: DecryptFn = async (_pubkey, _ciphertext) => ok(JSON.stringify([["p", "abc123"], ["t", "secret"]]))
  const result = await decryptPrivateEntries("encrypted", pk1, decryptFn)
  assertEquals(result.success, true)
  if (!result.success) throw new Error("expected success")
  assertEquals(result.value.length, 2)
  const [firstTag, secondTag] = result.value
  assertExists(firstTag)
  assertExists(secondTag)
  assertEquals(firstTag[0], "p")
  assertEquals(secondTag[0], "t")
})

Deno.test("decryptPrivateEntries - propagates signer failure", async () => {
  const decryptFn: DecryptFn = async () => failure(new SignerError("decrypt-failed", "test"))
  const result = await decryptPrivateEntries("encrypted", pk1, decryptFn)
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "decrypt-failed")
})

Deno.test("decryptPrivateEntries - 'PrivateEntriesParseError' when decrypted content is not a JSON array", async () => {
  const decryptFn: DecryptFn = async () => ok(JSON.stringify({ not: "array" }))
  const result = await decryptPrivateEntries("encrypted", pk1, decryptFn)
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "PrivateEntriesParseError")
})

Deno.test("decryptPrivateEntries - 'PrivateEntriesParseError' when decrypted content is invalid JSON", async () => {
  const decryptFn: DecryptFn = async () => ok("not json")
  const result = await decryptPrivateEntries("encrypted", pk1, decryptFn)
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "PrivateEntriesParseError")
})

Deno.test("isValidTagsArray - true for an array of valid tags, false otherwise", async () => {
  const { isValidTagsArray } = await import("../../src/domain/value-object/nostr-event.ts")
  assertEquals(isValidTagsArray([["p", "abc"], ["e", "def"]]), true)
  assertEquals(isValidTagsArray([]), true)
  assertEquals(isValidTagsArray([["p", "abc"], "not a tag"]), false)
  assertEquals(isValidTagsArray("not an array"), false)
  assertEquals(isValidTagsArray(null), false)
})

Deno.test("extractFullList - returns public tags with empty private tags when no decryptFn", async () => {
  const tags: ReadonlyArray<Tag> = [["p", pk2]]
  const result = await extractFullList({ content: "encrypted", pubkey: pk1, tags }, null)
  assertEquals(result.success, true)
  if (!result.success) throw new Error("expected success")
  assertEquals(result.value.publicTags.length, 1)
  assertEquals(result.value.privateTags.length, 0)
})

Deno.test("extractFullList - returns public tags with empty private tags when no content", async () => {
  const decryptFn: DecryptFn = async () => ok("[]")
  const tags: ReadonlyArray<Tag> = [["p", pk2]]
  const result = await extractFullList({ content: "", pubkey: pk1, tags }, decryptFn)
  assertEquals(result.success, true)
  if (!result.success) throw new Error("expected success")
  assertEquals(result.value.publicTags.length, 1)
  assertEquals(result.value.privateTags.length, 0)
})

Deno.test("extractFullList - returns both public and private tags when decryptFn succeeds", async () => {
  const decryptFn: DecryptFn = async () => ok(JSON.stringify([["p", "secret_pk"]]))
  const tags: ReadonlyArray<Tag> = [["p", pk2]]
  const result = await extractFullList({ content: "encrypted", pubkey: pk1, tags }, decryptFn)
  assertEquals(result.success, true)
  if (!result.success) throw new Error("expected success")
  assertEquals(result.value.publicTags.length, 1)
  assertEquals(result.value.privateTags.length, 1)
  const [privateTag] = result.value.privateTags
  assertExists(privateTag)
  assertEquals(privateTag[1], "secret_pk")
})

Deno.test("extractFullList - propagates signer failure", async () => {
  const decryptFn: DecryptFn = async () => failure(new SignerError("decrypt-failed", "test"))
  const tags: ReadonlyArray<Tag> = [["p", pk2]]
  const result = await extractFullList({ content: "encrypted", pubkey: pk1, tags }, decryptFn)
  assertEquals(result.success, false)
})
