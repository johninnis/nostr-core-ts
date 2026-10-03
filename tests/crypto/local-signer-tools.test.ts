import { assertEquals, assertThrows } from "@std/assert"
import { schnorr } from "@noble/curves/secp256k1"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils"
import {
  createLocalSigner,
  defaultLocalSignerTools,
  generateSecretKey,
} from "../../src/infrastructure/crypto/local-signer.ts"
import { isLowercaseHex } from "../../src/domain/value-object/brand.ts"
import { eventIdFixture, publicKeyFixture } from "../../testing.ts"
import { keyPairOf, secretKeyOf } from "../support/keys.ts"
import { INVALID_UTF8, nip04PayloadOf, nip44PayloadOf } from "../support/plaintext-bytes.ts"

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
  const sk = secretKeyOf(0x11)
  const pubkey = defaultLocalSignerTools.getPublicKey(sk)
  assertEquals(pubkey.length, 64)
  assertEquals(isLowercaseHex(pubkey, 64), true)
  assertEquals(pubkey, bytesToHex(schnorr.getPublicKey(sk)))
})

Deno.test("defaultLocalSignerTools.schnorrSign - produces a 128-hex signature that verifies", () => {
  const sk = secretKeyOf(0x11)
  const pubkey = defaultLocalSignerTools.getPublicKey(sk)
  const id = eventIdFixture("a".repeat(64))
  const sig = defaultLocalSignerTools.schnorrSign(id, sk)
  assertEquals(sig.length, 128)
  assertEquals(isLowercaseHex(sig, 128), true)
  assertEquals(schnorr.verify(hexToBytes(sig), hexToBytes(id), hexToBytes(pubkey)), true)
})

Deno.test("defaultLocalSignerTools.nip44 round-trip - alice encrypts, bob decrypts", () => {
  const aliceSk = secretKeyOf(0x11)
  const bobSk = secretKeyOf(0x22)
  const alicePk = defaultLocalSignerTools.getPublicKey(aliceSk)
  const bobPk = defaultLocalSignerTools.getPublicKey(bobSk)

  const aliceToBob = defaultLocalSignerTools.getNip44ConversationKey(aliceSk, bobPk)
  const bobToAlice = defaultLocalSignerTools.getNip44ConversationKey(bobSk, alicePk)
  const ciphertext = defaultLocalSignerTools.nip44Encrypt(aliceToBob, "hello bob")
  const plaintext = defaultLocalSignerTools.nip44Decrypt(bobToAlice, ciphertext)
  assertEquals(plaintext, "hello bob")
})

Deno.test("defaultLocalSignerTools.getNip44ConversationKey - symmetric: aliceToBob === bobToAlice", () => {
  const aliceSk = secretKeyOf(0x11)
  const bobSk = secretKeyOf(0x22)
  const alicePk = defaultLocalSignerTools.getPublicKey(aliceSk)
  const bobPk = defaultLocalSignerTools.getPublicKey(bobSk)

  const aliceToBob = defaultLocalSignerTools.getNip44ConversationKey(aliceSk, bobPk)
  const bobToAlice = defaultLocalSignerTools.getNip44ConversationKey(bobSk, alicePk)
  assertEquals(bytesToHex(aliceToBob), bytesToHex(bobToAlice))
})

Deno.test("defaultLocalSignerTools.nip04 round-trip - alice encrypts, bob decrypts", () => {
  const aliceSk = secretKeyOf(0x11)
  const bobSk = secretKeyOf(0x22)
  const alicePk = defaultLocalSignerTools.getPublicKey(aliceSk)
  const bobPk = defaultLocalSignerTools.getPublicKey(bobSk)

  const payload = defaultLocalSignerTools.nip04Encrypt(aliceSk, bobPk, "hello bob")
  const plaintext = defaultLocalSignerTools.nip04Decrypt(bobSk, alicePk, payload)
  assertEquals(plaintext, "hello bob")
})

Deno.test("defaultLocalSignerTools.nip04Decrypt - throws on a malformed payload", () => {
  const aliceSk = secretKeyOf(0x11)
  const bobPk = defaultLocalSignerTools.getPublicKey(secretKeyOf(0x22))
  assertThrows(
    () => defaultLocalSignerTools.nip04Decrypt(aliceSk, bobPk, "not-a-valid-payload"),
    Error,
  )
})

Deno.test("defaultLocalSignerTools.getPublicKey - parsePublicKey contract: lowercase hex returned", () => {
  const sk = secretKeyOf(0x11)
  const pubkey = defaultLocalSignerTools.getPublicKey(sk)
  assertEquals(pubkey, publicKeyFixture(pubkey))
})

Deno.test("createLocalSigner - a NIP-44 plaintext that is not valid UTF-8 is decrypt-failed (shared ADR-0100)", async () => {
  const alice = keyPairOf(0x11)
  const bob = keyPairOf(0x22)
  const payload = nip44PayloadOf(defaultLocalSignerTools.getNip44ConversationKey(alice.sk, bob.pk), INVALID_UTF8)
  const result = await createLocalSigner(bob.sk, defaultLocalSignerTools).nip44Decrypt(alice.pk, payload)
  assertEquals(!result.success && result.error.type, "decrypt-failed")
})

Deno.test("createLocalSigner - a NIP-04 plaintext that is not valid UTF-8 is decrypt-failed (shared ADR-0100)", async () => {
  const alice = keyPairOf(0x11)
  const bob = keyPairOf(0x22)
  const payload = nip04PayloadOf(alice.sk, bob.pk, INVALID_UTF8)
  const result = await createLocalSigner(bob.sk, defaultLocalSignerTools).nip04Decrypt(alice.pk, payload)
  assertEquals(!result.success && result.error.type, "decrypt-failed")
})

Deno.test("createLocalSigner - a NIP-04 plaintext over 65567 bytes is encrypt-failed (shared ADR-0018)", async () => {
  const result = await createLocalSigner(keyPairOf(0x11).sk).nip04Encrypt(keyPairOf(0x22).pk, "a".repeat(65568))
  assertEquals(!result.success && result.error.type, "encrypt-failed")
})

Deno.test("createLocalSigner - a NIP-44 plaintext over the default ceiling is encrypt-failed (shared ADR-0102)", async () => {
  const result = await createLocalSigner(keyPairOf(0x11).sk).nip44Encrypt(keyPairOf(0x22).pk, "a".repeat(262145))
  assertEquals(!result.success && result.error.type, "encrypt-failed")
})
