import { assertEquals } from "@std/assert"
import { computeEventId, type EventToSign } from "../../src/domain/service/event-id.ts"
import { hexRegex } from "../../src/domain/value-object/hex.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"

const pubkey = parsePublicKey("3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d")

const baseEvent: EventToSign = {
  pubkey,
  kind: 1,
  created_at: 1700000000,
  tags: [],
  content: "hello nostr",
}

Deno.test("computeEventId - returns a 64-char lowercase hex EventId", async () => {
  const id = await computeEventId(baseEvent)
  assertEquals(id.length, 64)
  assertEquals(hexRegex(64).test(id), true)
})

Deno.test("computeEventId - deterministic: same input yields the same id", async () => {
  const a = await computeEventId(baseEvent)
  const b = await computeEventId(baseEvent)
  assertEquals(a, b)
})

Deno.test("computeEventId - differs when content changes", async () => {
  const a = await computeEventId(baseEvent)
  const b = await computeEventId({ ...baseEvent, content: "different" })
  assertEquals(a === b, false)
})

Deno.test("computeEventId - differs when created_at changes", async () => {
  const a = await computeEventId(baseEvent)
  const b = await computeEventId({ ...baseEvent, created_at: 1700000001 })
  assertEquals(a === b, false)
})

Deno.test("computeEventId - differs when kind changes", async () => {
  const a = await computeEventId(baseEvent)
  const b = await computeEventId({ ...baseEvent, kind: 7 })
  assertEquals(a === b, false)
})

Deno.test("computeEventId - differs when tags change", async () => {
  const a = await computeEventId(baseEvent)
  const b = await computeEventId({ ...baseEvent, tags: [["t", "nostr"]] })
  assertEquals(a === b, false)
})

Deno.test("computeEventId - differs when pubkey changes", async () => {
  const other = parsePublicKey("b".repeat(64))
  const a = await computeEventId(baseEvent)
  const b = await computeEventId({ ...baseEvent, pubkey: other })
  assertEquals(a === b, false)
})

Deno.test("computeEventId - matches the NIP-01 serialisation [0, pubkey, created_at, kind, tags, content]", async () => {
  // Known-good vector: SHA-256 of the canonical serialisation
  // serialisation: [0,"<pubkey>",1700000000,1,[],"hello nostr"]
  const id = await computeEventId(baseEvent)
  const expected = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([0, pubkey, 1700000000, 1, [], "hello nostr"]),
    ),
  )
  const expectedHex = [...new Uint8Array(expected)].map((b) => b.toString(16).padStart(2, "0")).join("")
  assertEquals(id, expectedHex)
})

Deno.test("computeEventId - tag order matters (NIP-01 canonical serialisation)", async () => {
  const a = await computeEventId({ ...baseEvent, tags: [["t", "a"], ["t", "b"]] })
  const b = await computeEventId({ ...baseEvent, tags: [["t", "b"], ["t", "a"]] })
  assertEquals(a === b, false)
})
