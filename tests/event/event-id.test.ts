import { assertEquals } from "@std/assert"
import { computeEventId, type EventToSign } from "../../src/domain/service/event-id.ts"
import { isLowercaseHex } from "../../src/domain/value-object/brand.ts"
import { sha256Hex } from "../../src/domain/service/sha256.ts"
import { publicKeyFixture } from "../../testing.ts"

const pubkey = publicKeyFixture("3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d")

const baseEvent: EventToSign = {
  pubkey,
  kind: 1,
  created_at: 1700000000,
  tags: [],
  content: "hello nostr",
}

Deno.test("computeEventId - returns a 64-char lowercase hex EventId", () => {
  const id = computeEventId(baseEvent)
  assertEquals(id.length, 64)
  assertEquals(isLowercaseHex(id, 64), true)
})

Deno.test("computeEventId - deterministic: same input yields the same id", () => {
  const a = computeEventId(baseEvent)
  const b = computeEventId(baseEvent)
  assertEquals(a, b)
})

Deno.test("computeEventId - differs when content changes", () => {
  const a = computeEventId(baseEvent)
  const b = computeEventId({ ...baseEvent, content: "different" })
  assertEquals(a === b, false)
})

Deno.test("computeEventId - differs when created_at changes", () => {
  const a = computeEventId(baseEvent)
  const b = computeEventId({ ...baseEvent, created_at: 1700000001 })
  assertEquals(a === b, false)
})

Deno.test("computeEventId - differs when kind changes", () => {
  const a = computeEventId(baseEvent)
  const b = computeEventId({ ...baseEvent, kind: 7 })
  assertEquals(a === b, false)
})

Deno.test("computeEventId - differs when tags change", () => {
  const a = computeEventId(baseEvent)
  const b = computeEventId({ ...baseEvent, tags: [["t", "nostr"]] })
  assertEquals(a === b, false)
})

Deno.test("computeEventId - differs when pubkey changes", () => {
  const other = publicKeyFixture("b".repeat(64))
  const a = computeEventId(baseEvent)
  const b = computeEventId({ ...baseEvent, pubkey: other })
  assertEquals(a === b, false)
})

Deno.test("computeEventId - matches the NIP-01 serialisation [0, pubkey, created_at, kind, tags, content]", async () => {
  const id = computeEventId(baseEvent)
  const expected = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([0, pubkey, 1700000000, 1, [], "hello nostr"]),
    ),
  )
  const expectedHex = [...new Uint8Array(expected)].map((b) => b.toString(16).padStart(2, "0")).join("")
  assertEquals(id, expectedHex)
})

Deno.test("computeEventId - tag order matters (NIP-01 canonical serialisation)", () => {
  const a = computeEventId({ ...baseEvent, tags: [["t", "a"], ["t", "b"]] })
  const b = computeEventId({ ...baseEvent, tags: [["t", "b"], ["t", "a"]] })
  assertEquals(a === b, false)
})

Deno.test("computeEventId - escapes a control character outside NIP-01's seven as \\u00XX, as JSON encoders do (shared ADR-0105)", () => {
  const event: EventToSign = {
    pubkey: publicKeyFixture("a".repeat(64)),
    kind: 1,
    created_at: 1,
    tags: [],
    content: "\u0001",
  }
  const escaped = `[0,"${"a".repeat(64)}",1,1,[],"\\u0001"]`
  assertEquals(
    [computeEventId(event), sha256Hex(escaped)],
    [
      "5947d3690929d5d5eba2ffc8747b9831be43ad7f67a5c0273e44f7de70ad48c5",
      "5947d3690929d5d5eba2ffc8747b9831be43ad7f67a5c0273e44f7de70ad48c5",
    ],
  )
})
