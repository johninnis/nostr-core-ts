import { assertEquals } from "@std/assert"
import { isValidSubscriptionId, parseSubscriptionId } from "../../src/domain/value-object/subscription-id.ts"

Deno.test("parseSubscriptionId - brands a non-empty string of at most 64 characters unchanged (NIP-01)", () => {
  assertEquals<string | null>(parseSubscriptionId("sub 1"), "sub 1")
})

Deno.test("parseSubscriptionId - returns null for an empty or over-64-character string or a non-string (NIP-01)", () => {
  assertEquals([parseSubscriptionId(""), parseSubscriptionId("s".repeat(65)), parseSubscriptionId(7)], [
    null,
    null,
    null,
  ])
})

Deno.test("isValidSubscriptionId - 1 to 64 characters, counted as code points rather than UTF-16 units (shared ADR-0005)", () => {
  assertEquals(
    ["", "s", "s".repeat(64), "s".repeat(65), "🦄".repeat(64), 7].map(isValidSubscriptionId),
    [false, true, true, false, true, false],
  )
})

Deno.test("isValidSubscriptionId - refuses a lone surrogate, which is not a valid Unicode string (shared ADR-0005)", () => {
  assertEquals(["\uD83E", "a\uDD84", "\uDD84\uD83E"].map(isValidSubscriptionId), [false, false, false])
})
