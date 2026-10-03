import { assert, assertEquals } from "@std/assert"
import type { NostrEvent } from "../../src/domain/value-object/mod.ts"
import { encodeAuthHeader, NIP98_AUTH_HEADER_PREFIX, parseAuthHeader } from "../../src/domain/service/auth-header.ts"
import { serialiseEvent } from "../../src/domain/service/event-json.ts"
import { eventIdFixture, publicKeyFixture, sigFixture } from "../../testing.ts"

const makeEvent = (content = ""): NostrEvent => ({
  kind: 27235,
  content,
  created_at: 1000,
  tags: [],
  id: eventIdFixture("a".repeat(64)),
  pubkey: publicKeyFixture("b".repeat(64)),
  sig: sigFixture("c".repeat(128)),
})

Deno.test("NIP98_AUTH_HEADER_PREFIX - is the spec-mandated 'Nostr ' marker", () => {
  assertEquals(NIP98_AUTH_HEADER_PREFIX, "Nostr ")
})

Deno.test("encodeAuthHeader produces a Nostr-prefixed string", () => {
  const header = encodeAuthHeader(makeEvent()) ?? ""
  assert(header.startsWith(NIP98_AUTH_HEADER_PREFIX))
})

Deno.test("encodeAuthHeader uses standard base64", () => {
  const payload = (encodeAuthHeader(makeEvent()) ?? "").slice(6)
  assert(!payload.includes("-"))
  assert(!payload.includes("_"))
})

Deno.test("encodeAuthHeader round-trips to the original event JSON", () => {
  const event = makeEvent()
  const payload = (encodeAuthHeader(event) ?? "").slice(6)
  assertEquals(JSON.parse(atob(payload)), event)
})

Deno.test("encodeAuthHeader - encodes only the event's seven NIP-01 fields, in NIP-01 order", () => {
  const withExtra = { ...makeEvent(), seenOn: ["wss://relay.example"] }
  assertEquals(atob((encodeAuthHeader(withExtra) ?? "").slice(6)), serialiseEvent(makeEvent()))
})

const MAX_HEADER_LENGTH = 4096

const contentLengthsAroundTheBound = (): readonly [number, number] => {
  let length = 0
  while ((encodeAuthHeader(makeEvent("a".repeat(length + 1)))?.length ?? Infinity) <= MAX_HEADER_LENGTH) length++
  return [length, length + 1]
}

const [longestContent, overlongContent] = contentLengthsAroundTheBound()

Deno.test("encodeAuthHeader - writes the longest header within 4096 characters, which parseAuthHeader reads", () => {
  const header = encodeAuthHeader(makeEvent("a".repeat(longestContent)))
  assertEquals(header === null ? null : parseAuthHeader(header).success, true)
})

Deno.test("encodeAuthHeader - returns null for a header longer than 4096 characters, which parseAuthHeader refuses", () => {
  assertEquals(encodeAuthHeader(makeEvent("a".repeat(overlongContent))), null)
})
