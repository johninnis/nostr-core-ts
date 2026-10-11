import { assertEquals } from "@std/assert"
import type { Tag } from "../../src/domain/value-object/nostr-event.ts"
import { tagsEqual } from "../../src/domain/service/tags.ts"

const EVENT_TAG: Tag = ["e", "e".repeat(64)]
const PUBKEY_TAG: Tag = ["p", "f".repeat(64)]

Deno.test("tagsEqual - true for copies of the same tags in the same order", () => {
  assertEquals(tagsEqual([[...EVENT_TAG], [...PUBKEY_TAG]], [[...EVENT_TAG], [...PUBKEY_TAG]]), true)
})

Deno.test("tagsEqual - true for two empty tag lists", () => {
  assertEquals(tagsEqual([], []), true)
})

Deno.test("tagsEqual - false for the same tags in another order", () => {
  assertEquals(tagsEqual([EVENT_TAG, PUBKEY_TAG], [PUBKEY_TAG, EVENT_TAG]), false)
})

Deno.test("tagsEqual - false when the second list holds a tag the first does not", () => {
  assertEquals(tagsEqual([EVENT_TAG], [EVENT_TAG, PUBKEY_TAG]), false)
})

Deno.test("tagsEqual - false when the first list holds a tag the second does not", () => {
  assertEquals(tagsEqual([EVENT_TAG, PUBKEY_TAG], [EVENT_TAG]), false)
})

Deno.test("tagsEqual - false when a tag in the second list carries an element more", () => {
  assertEquals(tagsEqual([EVENT_TAG], [[...EVENT_TAG, "wss://relay.example.com"]]), false)
})

Deno.test("tagsEqual - false when a tag in the first list carries an element more", () => {
  assertEquals(tagsEqual([[...EVENT_TAG, "wss://relay.example.com"]], [EVENT_TAG]), false)
})

Deno.test("tagsEqual - false when one element of a tag differs", () => {
  assertEquals(tagsEqual([EVENT_TAG], [["e", "d".repeat(64)]]), false)
})

Deno.test("tagsEqual - false when only the tag names differ", () => {
  assertEquals(tagsEqual([["e", "x"]], [["E", "x"]]), false)
})
