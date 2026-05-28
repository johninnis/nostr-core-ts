import { assertEquals } from "@std/assert"
import { schnorr } from "@noble/curves/secp256k1"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils"
import { computeEventId } from "../../src/domain/service/event-id.ts"
import { verifyEventSignature } from "../../src/domain/service/verify.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"
import { parseSig } from "../../src/domain/value-object/sig.ts"

const makeSignedEvent = async (overrides: Partial<NostrEvent> = {}): Promise<NostrEvent> => {
  const sk = schnorr.utils.randomSecretKey()
  const generatedPubkey = parsePublicKey(bytesToHex(schnorr.getPublicKey(sk)))
  const base = {
    kind: 1,
    created_at: 1700000000,
    tags: [],
    content: "hello",
    ...overrides,
    pubkey: overrides.pubkey ?? generatedPubkey,
  }
  const id = await computeEventId(base)
  const sig = parseSig(bytesToHex(schnorr.sign(hexToBytes(id), sk)))
  return { ...base, id, sig }
}

Deno.test("verifyEventSignature - true for a freshly signed event", async () => {
  const event = await makeSignedEvent()
  assertEquals(await verifyEventSignature(event), true)
})

Deno.test("verifyEventSignature - false when content is tampered", async () => {
  const event = await makeSignedEvent({ content: "original" })
  const tampered: NostrEvent = { ...event, content: "tampered" }
  assertEquals(await verifyEventSignature(tampered), false)
})

Deno.test("verifyEventSignature - false when tags are tampered", async () => {
  const event = await makeSignedEvent({ tags: [["t", "nostr"]] })
  const tampered: NostrEvent = { ...event, tags: [["t", "nostr"], ["t", "extra"]] }
  assertEquals(await verifyEventSignature(tampered), false)
})

Deno.test("verifyEventSignature - false when created_at is tampered", async () => {
  const event = await makeSignedEvent({ created_at: 1700000000 })
  const tampered: NostrEvent = { ...event, created_at: 1700000001 }
  assertEquals(await verifyEventSignature(tampered), false)
})

Deno.test("verifyEventSignature - false when sig is replaced with another valid-shaped sig", async () => {
  const event = await makeSignedEvent()
  const tampered: NostrEvent = { ...event, sig: parseSig("0".repeat(128)) }
  assertEquals(await verifyEventSignature(tampered), false)
})

Deno.test("verifyEventSignature - false when pubkey is replaced", async () => {
  const event = await makeSignedEvent()
  const otherSk = schnorr.utils.randomSecretKey()
  const otherPubkey = parsePublicKey(bytesToHex(schnorr.getPublicKey(otherSk)))
  const tampered: NostrEvent = { ...event, pubkey: otherPubkey }
  assertEquals(await verifyEventSignature(tampered), false)
})

Deno.test("verifyEventSignature - rejects two different events signed by the same key", async () => {
  const sk = schnorr.utils.randomSecretKey()
  const pubkey = parsePublicKey(bytesToHex(schnorr.getPublicKey(sk)))
  const a = await makeSignedEvent({ pubkey, content: "first" })
  const b = await makeSignedEvent({ pubkey, content: "second" })
  const spliced: NostrEvent = { ...a, sig: b.sig }
  assertEquals(await verifyEventSignature(spliced), false)
})
