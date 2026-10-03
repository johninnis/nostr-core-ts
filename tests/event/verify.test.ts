import { assertEquals } from "@std/assert"
import { schnorr } from "@noble/curves/secp256k1"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils"
import { computeEventId } from "../../src/domain/service/event-id.ts"
import { verifyEventSignature } from "../../src/domain/service/verify.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import { publicKeyFixture, sigFixture } from "../../testing.ts"
import { secretKeyOf } from "../support/keys.ts"

const makeSignedEvent = (overrides: Partial<NostrEvent> = {}): NostrEvent => {
  const sk = secretKeyOf(0x11)
  const generatedPubkey = publicKeyFixture(bytesToHex(schnorr.getPublicKey(sk)))
  const base = {
    kind: 1,
    created_at: 1700000000,
    tags: [],
    content: "hello",
    ...overrides,
    pubkey: overrides.pubkey ?? generatedPubkey,
  }
  const id = computeEventId(base)
  const sig = sigFixture(bytesToHex(schnorr.sign(hexToBytes(id), sk)))
  return { ...base, id, sig }
}

Deno.test("verifyEventSignature - true for a freshly signed event", () => {
  const event = makeSignedEvent()
  assertEquals(verifyEventSignature(event), true)
})

Deno.test("verifyEventSignature - false when content is tampered", () => {
  const event = makeSignedEvent({ content: "original" })
  const tampered: NostrEvent = { ...event, content: "tampered" }
  assertEquals(verifyEventSignature(tampered), false)
})

Deno.test("verifyEventSignature - false when tags are tampered", () => {
  const event = makeSignedEvent({ tags: [["t", "nostr"]] })
  const tampered: NostrEvent = { ...event, tags: [["t", "nostr"], ["t", "extra"]] }
  assertEquals(verifyEventSignature(tampered), false)
})

Deno.test("verifyEventSignature - false when created_at is tampered", () => {
  const event = makeSignedEvent({ created_at: 1700000000 })
  const tampered: NostrEvent = { ...event, created_at: 1700000001 }
  assertEquals(verifyEventSignature(tampered), false)
})

Deno.test("verifyEventSignature - false when sig is replaced with another valid-shaped sig", () => {
  const event = makeSignedEvent()
  const tampered: NostrEvent = { ...event, sig: sigFixture("0".repeat(128)) }
  assertEquals(verifyEventSignature(tampered), false)
})

Deno.test("verifyEventSignature - false when pubkey is replaced", () => {
  const event = makeSignedEvent()
  const otherSk = secretKeyOf(0x22)
  const otherPubkey = publicKeyFixture(bytesToHex(schnorr.getPublicKey(otherSk)))
  const tampered: NostrEvent = { ...event, pubkey: otherPubkey }
  assertEquals(verifyEventSignature(tampered), false)
})

Deno.test("verifyEventSignature - rejects two different events signed by the same key", () => {
  const sk = secretKeyOf(0x11)
  const pubkey = publicKeyFixture(bytesToHex(schnorr.getPublicKey(sk)))
  const a = makeSignedEvent({ pubkey, content: "first" })
  const b = makeSignedEvent({ pubkey, content: "second" })
  const spliced: NostrEvent = { ...a, sig: b.sig }
  assertEquals(verifyEventSignature(spliced), false)
})

Deno.test("verifyEventSignature - false rather than a throw for a pubkey that is not a curve point", () => {
  const event = makeSignedEvent()
  const offCurve = publicKeyFixture("f".repeat(64))
  const fields = { ...event, pubkey: offCurve }
  assertEquals(verifyEventSignature({ ...fields, id: computeEventId(fields) }), false)
})

Deno.test("verifyEventSignature - false rather than a throw for a signature whose scalars are out of range", () => {
  const event = makeSignedEvent()
  assertEquals(verifyEventSignature({ ...event, sig: sigFixture("f".repeat(128)) }), false)
})
