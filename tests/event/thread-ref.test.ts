import { assertEquals } from "@std/assert"
import type { ThreadRef } from "../../src/domain/value-object/thread-ref.ts"
import { formatThreadRef } from "../../src/domain/value-object/thread-ref.ts"
import { KIND_LONGFORM_CONTENT } from "../../src/domain/value-object/kinds.ts"
import { eventIdFixture, publicKeyFixture } from "../../testing.ts"

const PUBKEY = publicKeyFixture("a".repeat(64))
const EVENT_ID = eventIdFixture("c".repeat(64))

Deno.test("formatThreadRef - an event ref is its hex id", () => {
  assertEquals(formatThreadRef({ type: "event", id: EVENT_ID }), EVENT_ID)
})

Deno.test("formatThreadRef - an address ref is its kind:pubkey:d coordinate", () => {
  const ref: ThreadRef = { type: "address", address: { kind: KIND_LONGFORM_CONTENT, pubkey: PUBKEY, dTag: "d" } }
  assertEquals(formatThreadRef(ref), `${KIND_LONGFORM_CONTENT}:${PUBKEY}:d`)
})

Deno.test("formatThreadRef - an external ref is its NIP-73 id, the value its I / i tag carries", () => {
  assertEquals(
    formatThreadRef({ type: "external", id: "https://abc.com/articles/1", kind: "web", hint: null }),
    "https://abc.com/articles/1",
  )
})
