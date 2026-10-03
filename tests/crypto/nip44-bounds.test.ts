import { assert, assertEquals, assertThrows } from "@std/assert"
import {
  NIP44_DEFAULT_MAX_PLAINTEXT_SIZE,
  NIP44_MAX_PLAINTEXT_SIZE,
  nip44Decrypt,
  nip44Encrypt,
} from "../../src/infrastructure/crypto/nip44-codec.ts"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import { Nip44CryptoError } from "../../src/domain/exception/nip44-crypto-error.ts"

const DEFAULT_CEILING_PAYLOAD_LENGTH = 349620
const CK = new Uint8Array(32).fill(1)

Deno.test("NIP44_DEFAULT_MAX_PLAINTEXT_SIZE - is 256 KiB", () => {
  assertEquals(NIP44_DEFAULT_MAX_PLAINTEXT_SIZE, 262144)
})

Deno.test("nip44Encrypt - a plaintext of exactly the default ceiling round-trips in a payload of the derived ceiling length", () => {
  const plaintext = "a".repeat(NIP44_DEFAULT_MAX_PLAINTEXT_SIZE)
  const payload = nip44Encrypt(CK, plaintext)
  assertEquals(payload.length, DEFAULT_CEILING_PAYLOAD_LENGTH)
  assertEquals(nip44Decrypt(CK, payload), plaintext)
})

Deno.test("nip44Encrypt - a plaintext one byte over the default ceiling is refused", () => {
  assertThrows(() => nip44Encrypt(CK, "a".repeat(NIP44_DEFAULT_MAX_PLAINTEXT_SIZE + 1)), Nip44CryptoError, "262144")
})

Deno.test("nip44Encrypt - a plaintext over the ceiling in UTF-8 bytes though under it in UTF-16 code units is refused", () => {
  const plaintext = "\u20ac".repeat(87382)
  assert(plaintext.length < NIP44_DEFAULT_MAX_PLAINTEXT_SIZE)
  assertThrows(() => nip44Encrypt(CK, plaintext), Nip44CryptoError, "262144")
})

Deno.test("nip44Decrypt - a payload one character over the default ceiling's length is refused before base64 decoding", () => {
  const payload = "!".repeat(DEFAULT_CEILING_PAYLOAD_LENGTH + 1)
  assertThrows(() => nip44Decrypt(CK, payload), Nip44CryptoError, `invalid payload length: ${payload.length}`)
})

Deno.test("nip44Decrypt - a payload of exactly the default ceiling's length reaches base64 decoding", () => {
  const payload = "!".repeat(DEFAULT_CEILING_PAYLOAD_LENGTH)
  assertThrows(() => nip44Decrypt(CK, payload), Nip44CryptoError, "invalid base64")
})

Deno.test("nip44Decrypt - a payload flagged with '#' within the ceiling reports the unsupported version", () => {
  const payload = "#" + "A".repeat(DEFAULT_CEILING_PAYLOAD_LENGTH - 1)
  assertThrows(() => nip44Decrypt(CK, payload), Nip44CryptoError, "unknown encryption version")
})

Deno.test("nip44Decrypt - a payload flagged with '#' under the minimum length reports the unsupported version (shared ADR-0102)", () => {
  assertThrows(() => nip44Decrypt(CK, "#abc"), Nip44CryptoError, "unknown encryption version")
})

Deno.test("nip44Decrypt - a payload under the minimum length not flagged with '#' is refused by its length", () => {
  assertThrows(() => nip44Decrypt(CK, "abc"), Nip44CryptoError, "invalid payload length: 3")
})

Deno.test("nip44Decrypt - a payload over the ceiling is refused by its length whatever it starts with", () => {
  const payload = "#" + "A".repeat(DEFAULT_CEILING_PAYLOAD_LENGTH)
  assertThrows(() => nip44Decrypt(CK, payload), Nip44CryptoError, "invalid payload length")
})

Deno.test("nip44Decrypt - refuses a plaintext over the ceiling that shares the ceiling plaintext's padded length", () => {
  const payload = nip44Encrypt(CK, "a".repeat(81920), NIP44_MAX_PLAINTEXT_SIZE)
  assertThrows(() => nip44Decrypt(CK, payload, 70000), Nip44CryptoError, "Plaintext exceeds the maximum length")
})

Deno.test("nip44 raised ceiling - a plaintext of 70000 bytes round-trips under a ceiling of 70000", () => {
  const plaintext = "a".repeat(70000)
  assertEquals(nip44Decrypt(CK, nip44Encrypt(CK, plaintext, 70000), 70000), plaintext)
})

Deno.test("nip44 raised ceiling - a plaintext of 70001 bytes is refused under a ceiling of 70000", () => {
  assertThrows(() => nip44Encrypt(CK, "a".repeat(70001), 70000), Nip44CryptoError, "70000")
})

Deno.test("nip44 raised ceiling - the NIP's maximum is the largest ceiling a caller may set", () => {
  for (const ceiling of [0, NIP44_MAX_PLAINTEXT_SIZE + 1, 1.5, Number.NaN]) {
    assertThrows(() => nip44Encrypt(CK, "a", ceiling), InvalidArgumentError, undefined, `ceiling=${ceiling}`)
    assertThrows(() => nip44Decrypt(CK, "a", ceiling), InvalidArgumentError, undefined, `ceiling=${ceiling}`)
  }
})

Deno.test("nip44 raised ceiling - a ceiling outside the NIP's range is refused with the message innis/nostr-core gives", () => {
  assertThrows(
    () => nip44Encrypt(CK, "a", 0),
    InvalidArgumentError,
    "Maximum plaintext length must be between 1 and 4294967295 bytes, got 0",
  )
})

Deno.test("nip44 raised ceiling - a lowered ceiling refuses a payload longer than its own plaintext produces", () => {
  const payload = nip44Encrypt(CK, "a".repeat(33))
  assertThrows(() => nip44Decrypt(CK, payload, 32), Nip44CryptoError, "invalid payload length")
})

Deno.test("nip44Encrypt - an empty plaintext is refused with the ceiling in the message", () => {
  assertThrows(
    () => nip44Encrypt(CK, ""),
    Nip44CryptoError,
    "Plaintext length must be between 1 and 262144 bytes",
  )
})

Deno.test("nip44Encrypt - an empty plaintext under a raised ceiling names that ceiling", () => {
  assertThrows(() => nip44Encrypt(CK, "", 70000), Nip44CryptoError, "must be between 1 and 70000 bytes")
})
