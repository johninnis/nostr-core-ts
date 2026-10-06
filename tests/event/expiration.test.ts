import { assertEquals, assertThrows } from "@std/assert"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import { isEventExpired, withExpiration } from "../../src/domain/service/expiration.ts"
import type { Tag, UnsignedEvent } from "../../src/domain/value-object/nostr-event.ts"

const withTags = (...tags: ReadonlyArray<Tag>): { readonly tags: ReadonlyArray<Tag> } => ({ tags })

Deno.test("isEventExpired - an event without an expiration tag never expires", () => {
  assertEquals(isEventExpired(withTags(), 2_000_000_000), false)
})

Deno.test("isEventExpired - expired from the stated second onward (NIP-40)", () => {
  const event = withTags(["expiration", "1600000000"])
  assertEquals([1599999999, 1600000000, 1600000001].map((at) => isEventExpired(event, at)), [false, true, true])
})

Deno.test("isEventExpired - expired once any stated expiry has passed, whatever the tag order", () => {
  const at = 1_700_000_000
  assertEquals(isEventExpired(withTags(["expiration", String(at + 100)], ["expiration", String(at - 1)]), at), true)
  assertEquals(isEventExpired(withTags(["expiration", String(at - 1)], ["expiration", String(at + 100)]), at), true)
})

Deno.test("isEventExpired - a value that is not a decimal timestamp is not an expiry", () => {
  assertEquals(
    isEventExpired(withTags(["expiration", "soon"], ["expiration", "-1"], ["expiration", "1e3"]), 5000),
    false,
  )
})

Deno.test("isEventExpired - an expiration written with a leading zero is no expiry and is ignored", () => {
  assertEquals(isEventExpired(withTags(["expiration", "0000000001"]), 1800000000), false)
})

const template = (...tags: ReadonlyArray<Tag>): UnsignedEvent => ({
  kind: 31234,
  created_at: 1700000000,
  tags,
  content: "encrypted",
})

Deno.test("withExpiration - writes the expiry as a decimal-string expiration tag (NIP-40)", () => {
  const event = withExpiration(template(["d", "x"]), 1800000000)
  assertEquals(event.tags, [["d", "x"], ["expiration", "1800000000"]])
})

Deno.test("withExpiration - leaves the original event unchanged", () => {
  const original = template(["d", "x"])
  withExpiration(original, 1800000000)
  assertEquals(original.tags, [["d", "x"]])
})

Deno.test("withExpiration - replaces existing expiration tags, so a writer emits exactly one", () => {
  const event = withExpiration(template(["expiration", "1600000000"], ["expiration", "1700000000"]), 1800000000)
  assertEquals(event.tags, [["expiration", "1800000000"]])
})

Deno.test("withExpiration - an event it expires reads expired from the stated second onward", () => {
  const event = withExpiration(template(), 1800000000)
  assertEquals([1799999999, 1800000000].map((at) => isEventExpired(event, at)), [false, true])
})

Deno.test("withExpiration - refuses an expiry that is not a whole number of seconds", () => {
  assertThrows(() => withExpiration(template(), 1.5), InvalidArgumentError, "whole number of seconds")
  assertThrows(() => withExpiration(template(), -3), InvalidArgumentError, "whole number of seconds")
})
