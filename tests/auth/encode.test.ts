import { assert, assertEquals } from "@std/assert"
import type { NostrEvent } from "../../src/domain/value-object/mod.ts"
import { parseEventId } from "../../src/domain/value-object/event-id.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"
import { parseSig } from "../../src/domain/value-object/sig.ts"
import { encodeAuthHeader, NIP98_AUTH_HEADER_PREFIX } from "../../src/domain/service/nip98-builder.ts"

const makeEvent = (): NostrEvent => ({
  kind: 27235,
  content: "",
  created_at: 1000,
  tags: [],
  id: parseEventId("a".repeat(64)),
  pubkey: parsePublicKey("b".repeat(64)),
  sig: parseSig("c".repeat(128)),
})

Deno.test("NIP98_AUTH_HEADER_PREFIX - is the spec-mandated 'Nostr ' marker", () => {
  assertEquals(NIP98_AUTH_HEADER_PREFIX, "Nostr ")
})

Deno.test("encodeAuthHeader produces a Nostr-prefixed string", () => {
  const header = encodeAuthHeader(makeEvent())
  assert(header.startsWith(NIP98_AUTH_HEADER_PREFIX))
})

Deno.test("encodeAuthHeader uses standard base64", () => {
  const payload = encodeAuthHeader(makeEvent()).slice(6)
  assert(!payload.includes("-"))
  assert(!payload.includes("_"))
})

Deno.test("encodeAuthHeader round-trips to the original event JSON", () => {
  const event = makeEvent()
  const payload = encodeAuthHeader(event).slice(6)
  assertEquals(JSON.parse(atob(payload)), event)
})
