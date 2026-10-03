import { assertEquals } from "@std/assert"
import { eventHasHashtag, extractHashtags, findHashtags, normaliseHashtag } from "../../src/domain/service/hashtag.ts"
import { buildEventFixture } from "../../testing.ts"

Deno.test("normaliseHashtag - lower-cases the tag", () => {
  assertEquals(normaliseHashtag("Bitcoin"), "bitcoin")
})

Deno.test("normaliseHashtag - keeps a leading hash, lower-cased like the rest (shared ADR-0004)", () => {
  assertEquals(normaliseHashtag("#Nostr"), "#nostr")
})

Deno.test("normaliseHashtag - an empty value is not a hashtag", () => {
  assertEquals(normaliseHashtag(""), null)
})

Deno.test("normaliseHashtag - lower-cases beyond ASCII", () => {
  assertEquals(normaliseHashtag("ÉCOLE"), "école")
})

Deno.test("normaliseHashtag - leaves an already-canonical tag unchanged", () => {
  assertEquals(normaliseHashtag("nostr"), "nostr")
})

Deno.test("normaliseHashtag - is idempotent", () => {
  assertEquals(normaliseHashtag(normaliseHashtag("Bitcoin") ?? ""), normaliseHashtag("Bitcoin"))
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

Deno.test("extractHashtags - reads hashtags written in any script, lower-cased", () => {
  assertEquals(extractHashtags("#日本語 #Ελλάδα #Café #Москва #٢٠٢٤"), ["日本語", "ελλάδα", "café", "москва", "٢٠٢٤"])
})

Deno.test("extractHashtags - keeps the combining marks a script writes its words with", () => {
  assertEquals(extractHashtags("#हिन्दी and #नमस्ते"), ["हिन्दी", "नमस्ते"])
})

Deno.test("extractHashtags - ignores a hash preceded by a letter of any script", () => {
  assertEquals(extractHashtags("日本#語 é#x"), [])
})

Deno.test("extractHashtags - ends a hashtag at punctuation, space or an emoji", () => {
  assertEquals(extractHashtags("#nostr, #zap🎉 #end."), ["nostr", "zap", "end"])
})

Deno.test("extractHashtags - leaves out a URL's fragment (shared ADR-0071)", () => {
  assertEquals(extractHashtags("https://x.com/#frag x.com/#frag #a word#b"), ["frag", "a"])
})

Deno.test("extractHashtags - returns an empty list for content with no hashtags", () => {
  assertEquals(extractHashtags("just a plain note"), [])
})

Deno.test("findHashtags - gives each hashtag's position, its text as written and the bare tag in its original casing", () => {
  assertEquals(findHashtags("a #Nostr post, #zap"), [
    { index: 2, text: "#Nostr", tag: "Nostr" },
    { index: 15, text: "#zap", tag: "zap" },
  ])
})

Deno.test("findHashtags - finds no hashtag in a URL's fragment (shared ADR-0071)", () => {
  assertEquals(findHashtags("https://x.com/#frag"), [])
})

Deno.test("findHashtags - finds no hashtag anywhere after the :// of a URL (shared ADR-0071)", () => {
  assertEquals(findHashtags("see https://x.com/a.html#frag#more and wss://relay.example/?q=#x"), [])
})

Deno.test("findHashtags - reads a hashtag after the whitespace that ends a URL (shared ADR-0071)", () => {
  assertEquals(findHashtags("https://x.com/#frag #after").map((hashtag) => hashtag.tag), ["after"])
})

Deno.test("findHashtags - reads a hashtag before the :// that starts a URL in the same run (shared ADR-0071)", () => {
  assertEquals(findHashtags("#tag://x.com/#frag").map((hashtag) => hashtag.tag), ["tag"])
})

Deno.test("findHashtags - ends a URL at any Unicode whitespace, a no-break space included (shared ADR-0071)", () => {
  assertEquals(findHashtags("https://x.com/\u00a0#after\u3000#again").map((hashtag) => hashtag.tag), ["after", "again"])
})

Deno.test("findHashtags - reads a hashtag after a slash in text without a scheme, which is no URL (shared ADR-0071)", () => {
  assertEquals(findHashtags("x.com/#frag").map((hashtag) => hashtag.tag), ["frag"])
})

Deno.test("findHashtags - reads a hashtag at the start of the text", () => {
  assertEquals(findHashtags("#a").map((hashtag) => hashtag.tag), ["a"])
})

Deno.test("findHashtags - finds no hashtag after a letter", () => {
  assertEquals(findHashtags("word#b"), [])
})

Deno.test("findHashtags - reads a run of hashes in time proportional to its length", () => {
  const started = performance.now()
  findHashtags("#".repeat(1 << 16))
  assertEquals(performance.now() - started < 1000, true)
})

Deno.test("eventHasHashtag - matches an explicit t tag", () => {
  const event = buildEventFixture({ content: "no tags in here", tags: [["t", "bitcoin"]] })
  assertEquals(eventHasHashtag(event, "bitcoin"), true)
})

Deno.test("eventHasHashtag - matches a t tag regardless of the casing on either side", () => {
  const event = buildEventFixture({ content: "", tags: [["t", "Bitcoin"]] })
  assertEquals(eventHasHashtag(event, "BITCOIN"), true)
})

Deno.test("eventHasHashtag - matches a hashtag written in content but never tagged", () => {
  const event = buildEventFixture({ content: "thoughts on #Bitcoin today", tags: [] })
  assertEquals(eventHasHashtag(event, "bitcoin"), true)
})

Deno.test("eventHasHashtag - matches a hashtag written in content in another script and case", () => {
  assertEquals(eventHasHashtag(buildEventFixture({ content: "γεια #Ελλάδα", tags: [] }), "ελλάδα"), true)
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
  const event = buildEventFixture({ content: "#bitcoin", tags: [["t", "bitcoin"], ["t", ""]] })
  assertEquals(eventHasHashtag(event, ""), false)
})

Deno.test("eventHasHashtag - a hashtag given with its leading hash is not the bare tag", () => {
  const event = buildEventFixture({ content: "#bitcoin", tags: [["t", "bitcoin"]] })
  assertEquals(eventHasHashtag(event, "#bitcoin"), false)
})

Deno.test("normaliseHashtag - does not trim surrounding whitespace (shared ADR-0004)", () => {
  assertEquals(normaliseHashtag(" Bitcoin "), " bitcoin ")
})
