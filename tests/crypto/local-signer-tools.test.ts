import { assertEquals, assertRejects } from "@std/assert"
import { schnorr } from "@noble/curves/secp256k1"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils"
import { defaultLocalSignerTools, generateSecretKey } from "../../src/infrastructure/adapter/local-signer-adapter.ts"
import { parseEventId } from "../../src/domain/value-object/event-id.ts"
import { hexRegex } from "../../src/domain/value-object/hex.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"

Deno.test("generateSecretKey - returns a 32-byte Uint8Array", () => {
  const sk = generateSecretKey()
  assertEquals(sk instanceof Uint8Array, true)
  assertEquals(sk.length, 32)
})

Deno.test("generateSecretKey - returns different keys on each call", () => {
  const a = generateSecretKey()
  const b = generateSecretKey()
  assertEquals(bytesToHex(a) === bytesToHex(b), false)
})

Deno.test("defaultLocalSignerTools.getPublicKey - returns a branded PublicKey matching schnorr", () => {
  const sk = generateSecretKey()
  const pubkey = defaultLocalSignerTools.getPublicKey(sk)
  assertEquals(pubkey.length, 64)
  assertEquals(hexRegex(64).test(pubkey), true)
  assertEquals(pubkey, bytesToHex(schnorr.getPublicKey(sk)))
})

Deno.test("defaultLocalSignerTools.schnorrSign - produces a 128-hex signature that verifies", () => {
  const sk = generateSecretKey()
  const pubkey = defaultLocalSignerTools.getPublicKey(sk)
  const id = parseEventId("a".repeat(64))
  const sig = defaultLocalSignerTools.schnorrSign(id, sk)
  assertEquals(sig.length, 128)
  assertEquals(hexRegex(128).test(sig), true)
  assertEquals(schnorr.verify(hexToBytes(sig), hexToBytes(id), hexToBytes(pubkey)), true)
})

Deno.test("defaultLocalSignerTools.nip44 round-trip - alice encrypts, bob decrypts", () => {
  const aliceSk = generateSecretKey()
  const bobSk = generateSecretKey()
  const alicePk = defaultLocalSignerTools.getPublicKey(aliceSk)
  const bobPk = defaultLocalSignerTools.getPublicKey(bobSk)

  const aliceToBob = defaultLocalSignerTools.getNip44ConversationKey(aliceSk, bobPk)
  const bobToAlice = defaultLocalSignerTools.getNip44ConversationKey(bobSk, alicePk)
  const ciphertext = defaultLocalSignerTools.nip44Encrypt(aliceToBob, "hello bob")
  const plaintext = defaultLocalSignerTools.nip44Decrypt(bobToAlice, ciphertext)
  assertEquals(plaintext, "hello bob")
})

Deno.test("defaultLocalSignerTools.getNip44ConversationKey - symmetric: aliceToBob === bobToAlice", () => {
  const aliceSk = generateSecretKey()
  const bobSk = generateSecretKey()
  const alicePk = defaultLocalSignerTools.getPublicKey(aliceSk)
  const bobPk = defaultLocalSignerTools.getPublicKey(bobSk)

  const aliceToBob = defaultLocalSignerTools.getNip44ConversationKey(aliceSk, bobPk)
  const bobToAlice = defaultLocalSignerTools.getNip44ConversationKey(bobSk, alicePk)
  assertEquals(bytesToHex(aliceToBob), bytesToHex(bobToAlice))
})

Deno.test("defaultLocalSignerTools.nip04 round-trip - alice encrypts, bob decrypts", async () => {
  const aliceSk = generateSecretKey()
  const bobSk = generateSecretKey()
  const alicePk = defaultLocalSignerTools.getPublicKey(aliceSk)
  const bobPk = defaultLocalSignerTools.getPublicKey(bobSk)

  const payload = await defaultLocalSignerTools.nip04Encrypt(aliceSk, bobPk, "hello bob")
  const plaintext = await defaultLocalSignerTools.nip04Decrypt(bobSk, alicePk, payload)
  assertEquals(plaintext, "hello bob")
})

Deno.test("defaultLocalSignerTools.nip04Decrypt - rejects malformed payload", async () => {
  const aliceSk = generateSecretKey()
  const bobPk = defaultLocalSignerTools.getPublicKey(generateSecretKey())
  await assertRejects(
    () => defaultLocalSignerTools.nip04Decrypt(aliceSk, bobPk, "not-a-valid-payload"),
    Error,
  )
})

Deno.test("defaultLocalSignerTools.getPublicKey - parsePublicKey contract: lowercase hex returned", () => {
  const sk = generateSecretKey()
  const pubkey = defaultLocalSignerTools.getPublicKey(sk)
  assertEquals(pubkey, parsePublicKey(pubkey))
})
