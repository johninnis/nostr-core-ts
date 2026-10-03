import { assertEquals, assertThrows } from "@std/assert"
import { buildUnsignedEvent } from "../../src/domain/service/rumour.ts"
import type { UnsignedEvent } from "../../src/domain/value-object/nostr-event.ts"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"

const TEMPLATE: UnsignedEvent = { kind: 1, created_at: 1700000000, tags: [["t", "nostr"]], content: "hello" }

Deno.test("buildUnsignedEvent - returns the template's four NIP-01 fields and no other key", () => {
  assertEquals(buildUnsignedEvent({ ...TEMPLATE, ...{ id: "x", sig: "y" } }), TEMPLATE)
})

Deno.test("buildUnsignedEvent - throws InvalidArgumentError for a kind or created_at parseNostrEvent refuses", () => {
  const overrides: ReadonlyArray<Partial<UnsignedEvent>> = [
    { kind: 1.5 },
    { kind: -1 },
    { kind: 70000 },
    { created_at: 1.5 },
    { created_at: -5 },
    { created_at: Number.NaN },
  ]
  for (const override of overrides) {
    assertThrows(() => buildUnsignedEvent({ ...TEMPLATE, ...override }), InvalidArgumentError)
  }
})

Deno.test("buildUnsignedEvent - an addressable kind with no d tag gains the empty identifier (shared ADR-0007)", () => {
  assertEquals(buildUnsignedEvent({ ...TEMPLATE, kind: 30078, tags: [["t", "nostr"]] }).tags, [["t", "nostr"], [
    "d",
    "",
  ]])
})

Deno.test("buildUnsignedEvent - an addressable kind's d tag is kept as written", () => {
  assertEquals(buildUnsignedEvent({ ...TEMPLATE, kind: 30078, tags: [["d", "a"]] }).tags, [["d", "a"]])
})
