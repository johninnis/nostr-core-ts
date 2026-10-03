import { assertEquals } from "@std/assert"
import { analyseEvent } from "../../src/domain/service/event-analysis.ts"
import type { KindMetadata } from "../../src/domain/service/event-analysis.ts"
import { KIND_LONGFORM_CONTENT } from "../../src/domain/value-object/kinds.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import { eventIdFixture, publicKeyFixture, sigFixture } from "../../testing.ts"

const makeEvent = (overrides: Partial<NostrEvent> & { kind: number }): NostrEvent => ({
  id: eventIdFixture("c".repeat(64)),
  pubkey: publicKeyFixture("a".repeat(64)),
  sig: sigFixture("f".repeat(128)),
  created_at: 1700000000,
  content: "",
  tags: [],
  ...overrides,
})

const longformOf = (raw: NostrEvent): Extract<KindMetadata, { readonly type: "longform" }> => {
  const kindData = analyseEvent(raw).kindData
  if (kindData?.type !== "longform") throw new Error(`expected longform kindData, got ${kindData?.type ?? "null"}`)
  return kindData
}

Deno.test("analyseEvent - longform returns longform kindData", () => {
  const raw = makeEvent({
    kind: KIND_LONGFORM_CONTENT,
    content: "# Article\n\nBody text",
    tags: [
      ["title", "My Article"],
      ["summary", "A brief summary"],
      ["image", "https://example.com/image.jpg"],
      ["published_at", "1700000000"],
      ["t", "nostr"],
      ["t", "bitcoin"],
    ],
  })
  const longform = longformOf(raw)
  assertEquals(longform.title, "My Article")
  assertEquals(longform.summary, "A brief summary")
  assertEquals(longform.image, "https://example.com/image.jpg")
  assertEquals(longform.publishedAt, 1700000000)
  assertEquals(longform.topics.length, 2)
  assertEquals(longform.topics[0], "nostr")
})

Deno.test("analyseEvent - longform with missing optional tags returns nulls", () => {
  const raw = makeEvent({ kind: KIND_LONGFORM_CONTENT })
  const longform = longformOf(raw)
  assertEquals(longform.title, null)
  assertEquals(longform.summary, null)
  assertEquals(longform.image, null)
  assertEquals(longform.publishedAt, null)
  assertEquals(longform.topics.length, 0)
})

Deno.test("analyseEvent - longform whose d tags disagree has no identifier, so no longform kindData (shared ADR-0014)", () => {
  const raw = makeEvent({ kind: KIND_LONGFORM_CONTENT, tags: [["d", "one"], ["d", "two"], ["title", "My Article"]] })
  assertEquals(analyseEvent(raw).kindData, null)
})

Deno.test("analyseEvent - longform with a repeated identical d tag reads its kindData (shared ADR-0014)", () => {
  const raw = makeEvent({ kind: KIND_LONGFORM_CONTENT, tags: [["d", "one"], ["d", "one"], ["title", "My Article"]] })
  assertEquals(longformOf(raw).title, "My Article")
})

Deno.test("analyseEvent - longform empty title and summary read as empty strings (shared ADR-0079)", () => {
  const raw = makeEvent({ kind: KIND_LONGFORM_CONTENT, tags: [["title", ""], ["summary", ""]] })
  const longform = longformOf(raw)
  assertEquals([longform.title, longform.summary], ["", ""])
})

Deno.test("analyseEvent - longform image is read in the one HttpUrl form (shared ADR-0081)", () => {
  const raw = makeEvent({ kind: KIND_LONGFORM_CONTENT, tags: [["image", "HTTPS://Example.com:443/i.jpg#f"]] })
  assertEquals(longformOf(raw).image, "https://example.com/i.jpg")
})

for (const image of ["", "ftp://example.com/i.jpg", "data:image/png;base64,AAAA", "not a url"]) {
  Deno.test(`analyseEvent - longform image ${JSON.stringify(image)} is not an http(s) URL, so it is dropped`, () => {
    const raw = makeEvent({ kind: KIND_LONGFORM_CONTENT, tags: [["image", image]] })
    assertEquals(longformOf(raw).image, null)
  })
}
