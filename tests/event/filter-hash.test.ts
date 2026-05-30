import { assertEquals, assertMatch, assertNotEquals } from "@std/assert"
import { hashFilters } from "../../src/domain/service/filter-hash.ts"
import type { NostrFilter } from "../../src/domain/value-object/nostr-filter.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"

const authorA = parsePublicKey("a".repeat(64))
const authorB = parsePublicKey("b".repeat(64))

Deno.test("hashFilters - is stable for the same input", () => {
  const filters: ReadonlyArray<NostrFilter> = [{ kinds: [1, 2], authors: [authorA] }]
  assertEquals(hashFilters(filters), hashFilters(filters))
})

Deno.test("hashFilters - is independent of object-key order", () => {
  const a: NostrFilter = { kinds: [1], authors: [authorA], since: 100 }
  const b: NostrFilter = { since: 100, authors: [authorA], kinds: [1] }
  assertEquals(hashFilters([a]), hashFilters([b]))
})

Deno.test("hashFilters - is independent of array-element order", () => {
  assertEquals(hashFilters([{ kinds: [3, 1, 2] }]), hashFilters([{ kinds: [2, 3, 1] }]))
  assertEquals(hashFilters([{ authors: [authorA, authorB] }]), hashFilters([{ authors: [authorB, authorA] }]))
})

Deno.test("hashFilters - is independent of tag-value order", () => {
  assertEquals(hashFilters([{ "#t": ["b", "a"] }]), hashFilters([{ "#t": ["a", "b"] }]))
})

Deno.test("hashFilters - is independent of the order of filters in the set", () => {
  const x: NostrFilter = { kinds: [1] }
  const y: NostrFilter = { kinds: [2] }
  assertEquals(hashFilters([x, y]), hashFilters([y, x]))
})

Deno.test("hashFilters - distinguishes filters that select different events", () => {
  assertNotEquals(hashFilters([{ kinds: [1] }]), hashFilters([{ kinds: [2] }]))
  assertNotEquals(hashFilters([{ authors: [authorA] }]), hashFilters([{ authors: [authorB] }]))
  assertNotEquals(hashFilters([{ kinds: [1], since: 1 }]), hashFilters([{ kinds: [1], since: 2 }]))
})

Deno.test("hashFilters - treats an explicit undefined field as absent", () => {
  assertEquals(hashFilters([{ kinds: [1], since: undefined }]), hashFilters([{ kinds: [1] }]))
})

Deno.test("hashFilters - returns a lowercase hex SHA-256 digest", () => {
  assertMatch(hashFilters([{ kinds: [1] }]), /^[0-9a-f]{64}$/)
})

// Pinned digests of the canonical form, asserted identically in the PHP suite — the
// cross-language conformance anchors. Equivalent inputs must hash to these exact digests in
// both runtimes. (The property tests above use language-local inputs — TS brands pubkeys via
// parsePublicKey, which PHP does not — so conformance rides on these shared anchors.)
Deno.test('hashFilters - empty filter set hashes to SHA-256 of "[]"', () => {
  assertEquals(hashFilters([]), "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945")
})

Deno.test("hashFilters - kinds+limit filter matches the cross-language anchor", () => {
  assertEquals(
    hashFilters([{ kinds: [2, 1], limit: 5 }]),
    "a34519033f2032b87a019ef94f4be40fc1ab6a621d2b66c55b0d386c3e576587",
  )
})

Deno.test("hashFilters - preserves duplicate array elements (equal sort keys)", () => {
  assertNotEquals(hashFilters([{ authors: [authorA, authorA] }]), hashFilters([{ authors: [authorA] }]))
})
