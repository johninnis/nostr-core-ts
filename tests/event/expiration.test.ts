import { assertEquals } from "@std/assert"
import { isEventExpired } from "../../src/domain/service/expiration.ts"
import type { Tag } from "../../src/domain/value-object/nostr-event.ts"

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
