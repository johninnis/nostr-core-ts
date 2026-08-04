import { assertEquals } from "@std/assert"
import {
  eventHasHashtag,
  extractHashtags,
  HASHTAG_PATTERN,
  normaliseHashtag,
} from "../../src/domain/service/hashtag.ts"
import { buildEventFixture } from "../../testing.ts"

Deno.test("normaliseHashtag - lower-cases the tag", () => {
  assertEquals(normaliseHashtag("Bitcoin"), "bitcoin")
})

Deno.test("normaliseHashtag - strips a leading hash", () => {
  assertEquals(normaliseHashtag("#Nostr"), "nostr")
})

Deno.test("normaliseHashtag - leaves an already-canonical tag unchanged", () => {
  assertEquals(normaliseHashtag("nostr"), "nostr")
})

Deno.test("normaliseHashtag - is idempotent", () => {
  assertEquals(normaliseHashtag(normaliseHashtag("#Bitcoin")), normaliseHashtag("#Bitcoin"))
})

Deno.test("extractHashtags - returns normalised tags in first-appearance order", () => {
  assertEquals(extractHashtags("Learning #Nostr and #Bitcoin today"), ["nostr", "bitcoin"])
})

Deno.test("extractHashtags - deduplicates tags differing only by case", () => {
  assertEquals(extractHashtags("#Bitcoin #bitcoin #BITCOIN"), ["bitcoin"])
})

Deno.test("extractHashtags - ignores the hash of an HTML entity", () => {
  assertEquals(extractHashtags("it&#39;s fine"), [])
})

Deno.test("extractHashtags - ignores a hash preceded by a word character", () => {
  assertEquals(extractHashtags("issue foo#bar"), [])
})

Deno.test("extractHashtags - returns an empty list for content with no hashtags", () => {
  assertEquals(extractHashtags("just a plain note"), [])
})

Deno.test("HASHTAG_PATTERN - captures the bare tag in its original casing", () => {
  assertEquals([...("a #Nostr post".matchAll(HASHTAG_PATTERN))].map((m) => m[1]), ["Nostr"])
})

Deno.test("HASHTAG_PATTERN - is reusable across replace and matchAll without lastIndex drift", () => {
  const content = "#one and #two"
  assertEquals(content.replace(HASHTAG_PATTERN, "X"), "X and X")
  assertEquals(extractHashtags(content), ["one", "two"])
  assertEquals(content.replace(HASHTAG_PATTERN, "X"), "X and X")
})

Deno.test("eventHasHashtag - matches an explicit t tag", () => {
  const event = buildEventFixture({ content: "no tags in here", tags: [["t", "bitcoin"]] })
  assertEquals(eventHasHashtag(event, "bitcoin"), true)
})

Deno.test("eventHasHashtag - matches a t tag regardless of the casing on either side", () => {
  const event = buildEventFixture({ content: "", tags: [["t", "Bitcoin"]] })
  assertEquals(eventHasHashtag(event, "#BITCOIN"), true)
})

Deno.test("eventHasHashtag - matches a hashtag written in content but never tagged", () => {
  const event = buildEventFixture({ content: "thoughts on #Bitcoin today", tags: [] })
  assertEquals(eventHasHashtag(event, "bitcoin"), true)
})

Deno.test("eventHasHashtag - is false when the hashtag appears in neither tags nor content", () => {
  const event = buildEventFixture({ content: "a note about nostr", tags: [["t", "nostr"]] })
  assertEquals(eventHasHashtag(event, "bitcoin"), false)
})

Deno.test("eventHasHashtag - does not match a bare word that is not written as a hashtag", () => {
  const event = buildEventFixture({ content: "bitcoin without a hash", tags: [] })
  assertEquals(eventHasHashtag(event, "bitcoin"), false)
})

Deno.test("eventHasHashtag - is false for an empty hashtag", () => {
  const event = buildEventFixture({ content: "#bitcoin", tags: [["t", "bitcoin"]] })
  assertEquals(eventHasHashtag(event, "#"), false)
})
