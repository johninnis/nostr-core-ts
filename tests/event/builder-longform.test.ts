import { assertEquals } from "@std/assert"
import { buildLongform } from "../../src/domain/service/builder.ts"
import { KIND_LONGFORM, KIND_LONGFORM_DRAFT } from "../../src/domain/value-object/kinds.ts"

Deno.test("buildLongform - emits kind, content, and d tag", () => {
  const event = buildLongform({ kind: KIND_LONGFORM, dTag: "my-slug", content: "body" })
  assertEquals(event.kind, KIND_LONGFORM)
  assertEquals(event.content, "body")
  assertEquals(event.tags.find((t) => t[0] === "d")?.[1], "my-slug")
})

Deno.test("buildLongform - includes title, summary, image when present", () => {
  const event = buildLongform({
    kind: KIND_LONGFORM,
    dTag: "s",
    content: "c",
    title: "T",
    summary: "S",
    image: "https://example.com/i.png",
  })
  assertEquals(event.tags.find((t) => t[0] === "title")?.[1], "T")
  assertEquals(event.tags.find((t) => t[0] === "summary")?.[1], "S")
  assertEquals(event.tags.find((t) => t[0] === "image")?.[1], "https://example.com/i.png")
})

Deno.test("buildLongform - omits empty title, summary, image", () => {
  const event = buildLongform({ kind: KIND_LONGFORM_DRAFT, dTag: "s", content: "c", title: "", summary: "", image: "" })
  assertEquals(event.tags.some((t) => t[0] === "title"), false)
  assertEquals(event.tags.some((t) => t[0] === "summary"), false)
  assertEquals(event.tags.some((t) => t[0] === "image"), false)
})

Deno.test("buildLongform - includes published_at when provided", () => {
  const event = buildLongform({ kind: KIND_LONGFORM, dTag: "s", content: "c", publishedAt: 1700000000 })
  assertEquals(event.tags.find((t) => t[0] === "published_at")?.[1], "1700000000")
})

Deno.test("buildLongform - omits published_at when null or undefined", () => {
  const withNull = buildLongform({ kind: KIND_LONGFORM_DRAFT, dTag: "s", content: "c", publishedAt: null })
  const withUndefined = buildLongform({ kind: KIND_LONGFORM_DRAFT, dTag: "s", content: "c" })
  assertEquals(withNull.tags.some((t) => t[0] === "published_at"), false)
  assertEquals(withUndefined.tags.some((t) => t[0] === "published_at"), false)
})

Deno.test("buildLongform - emits one t tag per topic", () => {
  const event = buildLongform({ kind: KIND_LONGFORM, dTag: "s", content: "c", topics: ["a", "b", "c"] })
  assertEquals(event.tags.filter((t) => t[0] === "t").map((t) => t[1]), ["a", "b", "c"])
})

Deno.test("buildLongform - uses provided createdAt", () => {
  const event = buildLongform({ kind: KIND_LONGFORM, dTag: "s", content: "c", createdAt: 1700000000 })
  assertEquals(event.created_at, 1700000000)
})
