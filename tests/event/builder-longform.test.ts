import { assertEquals, assertThrows } from "@std/assert"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import { buildLongform } from "../../src/domain/service/builder.ts"
import { KIND_LONGFORM_CONTENT, KIND_LONGFORM_CONTENT_DRAFT } from "../../src/domain/value-object/kinds.ts"
import { httpUrlFixture } from "../../testing.ts"

Deno.test("buildLongform - emits kind, content, and d tag", () => {
  const event = buildLongform({ kind: KIND_LONGFORM_CONTENT, dTag: "my-slug", content: "body" })
  assertEquals(event.kind, KIND_LONGFORM_CONTENT)
  assertEquals(event.content, "body")
  assertEquals(event.tags.find((t) => t[0] === "d")?.[1], "my-slug")
})

Deno.test("buildLongform - includes title, summary, image when present", () => {
  const event = buildLongform({
    kind: KIND_LONGFORM_CONTENT,
    dTag: "s",
    content: "c",
    title: "T",
    summary: "S",
    image: httpUrlFixture("https://example.com/i.png"),
  })
  assertEquals(event.tags.find((t) => t[0] === "title")?.[1], "T")
  assertEquals(event.tags.find((t) => t[0] === "summary")?.[1], "S")
  assertEquals(event.tags.find((t) => t[0] === "image")?.[1], "https://example.com/i.png")
})

Deno.test("buildLongform - writes an empty title and summary as empty tags (shared ADR-0079)", () => {
  const event = buildLongform({
    kind: KIND_LONGFORM_CONTENT_DRAFT,
    dTag: "s",
    content: "c",
    title: "",
    summary: "",
  })
  assertEquals(event.tags.filter((t) => ["title", "summary"].includes(t[0])), [
    ["title", ""],
    ["summary", ""],
  ])
})

Deno.test("buildLongform - refuses, at compile time, an image that is not an HttpUrl", () => {
  const input: Parameters<typeof buildLongform>[0] = {
    kind: KIND_LONGFORM_CONTENT,
    dTag: "s",
    content: "c",
    // @ts-expect-error an image is an HttpUrl, so a plain string is refused
    image: "https://example.com/i.png",
  }
  assertEquals(input.dTag, "s")
})

Deno.test("buildLongform - omits an absent title, summary and image", () => {
  const event = buildLongform({ kind: KIND_LONGFORM_CONTENT_DRAFT, dTag: "s", content: "c" })
  assertEquals(event.tags.some((t) => ["title", "summary", "image"].includes(t[0])), false)
})

Deno.test("buildLongform - refuses, at compile time, null as a second spelling of an absent field (ADR-0033)", () => {
  const input: Parameters<typeof buildLongform>[0] = {
    kind: KIND_LONGFORM_CONTENT,
    dTag: "s",
    content: "c",
    // @ts-expect-error: an absent field is left out, never null
    title: null,
  }
  assertEquals(input.title, null)
})

Deno.test("buildLongform - includes published_at when provided", () => {
  const event = buildLongform({ kind: KIND_LONGFORM_CONTENT, dTag: "s", content: "c", publishedAt: 1700000000 })
  assertEquals(event.tags.find((t) => t[0] === "published_at")?.[1], "1700000000")
})

for (const publishedAt of [Number.NaN, 1.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
  Deno.test(`buildLongform - throws InvalidArgumentError for a publishedAt of ${publishedAt}`, () => {
    assertThrows(
      () => buildLongform({ kind: KIND_LONGFORM_CONTENT, dTag: "s", content: "c", publishedAt }),
      InvalidArgumentError,
    )
  })
}

Deno.test("buildLongform - omits an absent published_at", () => {
  const event = buildLongform({ kind: KIND_LONGFORM_CONTENT_DRAFT, dTag: "s", content: "c" })
  assertEquals(event.tags.some((t) => t[0] === "published_at"), false)
})

Deno.test("buildLongform - emits one t tag per topic", () => {
  const event = buildLongform({ kind: KIND_LONGFORM_CONTENT, dTag: "s", content: "c", topics: ["a", "b", "c"] })
  assertEquals(event.tags.filter((t) => t[0] === "t").map((t) => t[1]), ["a", "b", "c"])
})

Deno.test("buildLongform - uses provided createdAt", () => {
  const event = buildLongform({ kind: KIND_LONGFORM_CONTENT, dTag: "s", content: "c", createdAt: 1700000000 })
  assertEquals(event.created_at, 1700000000)
})

Deno.test("buildLongform - lower-cases topics, since NIP-24 t tags are lowercase", () => {
  const event = buildLongform({ kind: KIND_LONGFORM_CONTENT, dTag: "s", content: "c", topics: ["Bitcoin", "NOSTR"] })
  assertEquals(event.tags.filter((t) => t[0] === "t").map((t) => t[1]), ["bitcoin", "nostr"])
})

Deno.test("buildLongform - drops an empty topic and repeats none", () => {
  const event = buildLongform({ kind: KIND_LONGFORM_CONTENT, dTag: "s", content: "c", topics: ["", "a", "A"] })
  assertEquals(event.tags.filter((t) => t[0] === "t").map((t) => t[1]), ["a"])
})

Deno.test("buildLongform - keeps a repeated topic once, at its first occurrence, as innis/nostr-core's unique() does", () => {
  const event = buildLongform({ kind: KIND_LONGFORM_CONTENT, dTag: "s", content: "c", topics: ["b", "a", "B", "a"] })
  assertEquals(event.tags.filter((t) => t[0] === "t").map((t) => t[1]), ["b", "a"])
})

Deno.test("buildLongform - keeps a topic's leading hash, since only lowercasing is canonical (shared ADR-0004)", () => {
  const event = buildLongform({ kind: KIND_LONGFORM_CONTENT, dTag: "s", content: "c", topics: ["#Nostr"] })
  assertEquals(event.tags.filter((t) => t[0] === "t").map((t) => t[1]), ["#nostr"])
})

Deno.test("buildLongform - an article with no identifier writes an empty d tag (NIP-01)", () => {
  const event = buildLongform({ kind: KIND_LONGFORM_CONTENT, dTag: "", content: "c" })
  assertEquals(event.tags[0], ["d", ""])
})
