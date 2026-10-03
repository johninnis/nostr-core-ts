import { assert, assertEquals, assertMatch, assertNotEquals, assertThrows } from "@std/assert"
import { base64 } from "@scure/base"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import { Nip04CryptoError } from "../../src/domain/exception/nip04-crypto-error.ts"
import { nip04Decrypt, nip04Encrypt } from "../../src/infrastructure/crypto/nip04-codec.ts"
import type { PublicKey } from "../../src/domain/value-object/public-key.ts"
import { publicKeyFixture } from "../../testing.ts"
import { keyPairOf } from "../support/keys.ts"
import { withTrailingBitSet } from "../support/base64.ts"
import { INVALID_UTF8, nip04PayloadOf } from "../support/plaintext-bytes.ts"

const ALICE = keyPairOf(0x11)
const BOB = keyPairOf(0x22)

Deno.test("nip04 round-trip - short ASCII", () => {
  const alice = ALICE
  const bob = BOB
  const payload = nip04Encrypt(alice.sk, bob.pk, "hello bob")
  assertEquals(nip04Decrypt(bob.sk, alice.pk, payload), "hello bob")
})

Deno.test("nip04 round-trip - multibyte UTF-8", () => {
  const alice = ALICE
  const bob = BOB
  const plaintext = "🦄 unicorns + ümlauts + 漢字"
  const payload = nip04Encrypt(alice.sk, bob.pk, plaintext)
  assertEquals(nip04Decrypt(bob.sk, alice.pk, payload), plaintext)
})

Deno.test("nip04 round-trip - long message (10kB)", () => {
  const alice = ALICE
  const bob = BOB
  const plaintext = "x".repeat(10_000)
  const payload = nip04Encrypt(alice.sk, bob.pk, plaintext)
  assertEquals(nip04Decrypt(bob.sk, alice.pk, payload), plaintext)
})

Deno.test("nip04 payload shape - base64(ciphertext)?iv=base64(iv)", () => {
  const alice = ALICE
  const bob = BOB
  const payload = nip04Encrypt(alice.sk, bob.pk, "shape check")
  assertMatch(payload, /^[A-Za-z0-9+/]+=*\?iv=[A-Za-z0-9+/]+=*$/)
  const [, ivPart = ""] = payload.split("?iv=")
  assertEquals(atob(ivPart).length, 16, "iv must decode to 16 bytes")
})

Deno.test("nip04 sender and recipient derive identical shared secret", () => {
  const alice = ALICE
  const bob = BOB
  const fromAlice = nip04Encrypt(alice.sk, bob.pk, "symmetry")
  const fromBob = nip04Encrypt(bob.sk, alice.pk, "symmetry")
  assertEquals(nip04Decrypt(bob.sk, alice.pk, fromAlice), "symmetry")
  assertEquals(nip04Decrypt(alice.sk, bob.pk, fromBob), "symmetry")
})

const PRINTABLE = Array.from({ length: 0x5e }, (_, i) => String.fromCharCode(0x20 + i)).join("")

const printableText = (length: number, offset: number): string =>
  Array.from({ length }, (_, i) => PRINTABLE[(i * 7 + offset) % PRINTABLE.length]).join("")

Deno.test("nip04 round-trip - fixed key pairs and printable plaintexts across block-boundary lengths", () => {
  const vectors = [1, 2, 15, 16, 17, 100, 255, 256, 257, 1000, 2047, 2048].map((length, i) => ({
    alice: keyPairOf(i + 1),
    bob: keyPairOf(i + 101),
    plaintext: printableText(length, i),
  }))
  const failed = vectors.filter(({ alice, bob, plaintext }) =>
    nip04Decrypt(bob.sk, alice.pk, nip04Encrypt(alice.sk, bob.pk, plaintext)) !== plaintext
  )
  assertEquals(failed, [])
})

Deno.test("nip04 round-trip - boundary lengths (AES block edges and beyond)", () => {
  const alice = ALICE
  const bob = BOB
  for (const length of [1, 15, 16, 17, 31, 32, 33, 64, 1024, 8192]) {
    const plaintext = "a".repeat(length)
    const payload = nip04Encrypt(alice.sk, bob.pk, plaintext)
    assertEquals(nip04Decrypt(bob.sk, alice.pk, payload), plaintext, `length ${length} failed`)
  }
})

Deno.test("nip04 round-trip - empty plaintext", () => {
  const alice = ALICE
  const bob = BOB
  const payload = nip04Encrypt(alice.sk, bob.pk, "")
  assertEquals(nip04Decrypt(bob.sk, alice.pk, payload), "")
})

const DECRYPTION_FAILED = "NIP-04 decryption failed"

const assertOneFailure = (payload: string): void => {
  const alice = ALICE
  const bob = BOB
  const error = assertThrows(() => nip04Decrypt(alice.sk, bob.pk, payload), Nip04CryptoError)
  assertEquals(error.message, DECRYPTION_FAILED)
  assertEquals(error.cause, undefined)
}

const BLOCK = base64.encode(new Uint8Array(32))
const IV = base64.encode(new Uint8Array(16))

Deno.test("nip04Decrypt - a missing ?iv= separator fails with the one indistinguishable failure", () => {
  assertOneFailure(`${BLOCK}${BLOCK}`)
})

Deno.test("nip04Decrypt - non-base64 ciphertext fails with the one indistinguishable failure", () => {
  assertOneFailure(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!?iv=${IV}`)
})

Deno.test("nip04Decrypt - a non-base64 iv fails with the one indistinguishable failure", () => {
  assertOneFailure(`${BLOCK}?iv=!!!!!!!!!!!!!!!!!!!!!!!!`)
})

Deno.test("nip04Decrypt - a wrong-length iv fails with the one indistinguishable failure", () => {
  assertOneFailure(`${BLOCK}?iv=${base64.encode(new Uint8Array(24))}`)
})

Deno.test("nip04Decrypt - undecryptable ciphertext fails with the one indistinguishable failure", () => {
  assertOneFailure(`${base64.encode(new Uint8Array(31))}?iv=${IV}`)
})

Deno.test("nip04Decrypt - a payload shorter than 52 characters fails before any decoding", () => {
  assertOneFailure(`${base64.encode(new Uint8Array(16)).slice(0, 23)}?iv=${IV}`)
})

Deno.test("nip04Decrypt - a payload longer than 87472 characters fails before any decoding", () => {
  assertOneFailure(`${"A".repeat(87472 - 4 - IV.length + 1)}?iv=${IV}`)
})

const OFF_CURVE_PUBKEY = publicKeyFixture("5".padStart(64, "0"))

Deno.test("nip04Decrypt - a sender key that is not a curve point fails with the one indistinguishable failure", () => {
  const alice = ALICE
  const bob = BOB
  const payload = nip04Encrypt(alice.sk, bob.pk, "hello")
  const error = assertThrows(() => nip04Decrypt(bob.sk, OFF_CURVE_PUBKEY, payload), Nip04CryptoError)
  assertEquals([error.message, error.cause], [DECRYPTION_FAILED, undefined])
})

Deno.test("nip04Encrypt - a peer key that is not a curve point throws Nip04CryptoError", () => {
  const error = assertThrows(() => nip04Encrypt(ALICE.sk, OFF_CURVE_PUBKEY, "hello"), Nip04CryptoError)
  assertEquals(error.message, "NIP-04 encryption failed")
})

Deno.test("nip04Decrypt - the shortest well-formed payload, 52 characters, decrypts", () => {
  const alice = ALICE
  const bob = BOB
  const payload = nip04Encrypt(alice.sk, bob.pk, "")
  assertEquals(payload.length, 52)
  assertEquals(nip04Decrypt(bob.sk, alice.pk, payload), "")
})

Deno.test("nip04 is unauthenticated - flipping a ciphertext byte still 'decrypts' to garbage, not the original", () => {
  const alice = ALICE
  const bob = BOB
  const plaintext = "the quick brown fox jumps over the lazy dog one two three"
  const payload = nip04Encrypt(alice.sk, bob.pk, plaintext)
  const [ct = "", iv = ""] = payload.split("?iv=")
  const ctBytes = Uint8Array.from(atob(ct), (c) => c.charCodeAt(0))
  ctBytes[0] = ctBytes[0] !== undefined ? ctBytes[0] ^ 0x01 : 0x01
  const tampered = `${base64.encode(ctBytes)}?iv=${iv}`
  let decrypted: string | null = null
  try {
    decrypted = nip04Decrypt(bob.sk, alice.pk, tampered)
  } catch {
    decrypted = null
  }
  if (decrypted !== null) assertNotEquals(decrypted, plaintext, "tampered ciphertext must not decrypt to original")
  assert(decrypted !== plaintext, "AES-CBC without MAC: tamper either throws or returns garbage")
})

const NOT_BYTES: Uint8Array = JSON.parse("null")
const NOT_A_PUBKEY: PublicKey = JSON.parse(`"${"a".repeat(62)}"`)

Deno.test("nip04Encrypt - a secret key of 31 bytes is misuse and throws InvalidArgumentError", () => {
  assertThrows(() => nip04Encrypt(new Uint8Array(31).fill(1), BOB.pk, "hello"), InvalidArgumentError)
})

Deno.test("nip04Encrypt - a secret key of 33 bytes is misuse and throws InvalidArgumentError", () => {
  assertThrows(() => nip04Encrypt(new Uint8Array(33).fill(1), BOB.pk, "hello"), InvalidArgumentError)
})

Deno.test("nip04Encrypt - a secret key outside the secp256k1 scalar range is misuse and throws InvalidArgumentError", () => {
  assertThrows(() => nip04Encrypt(new Uint8Array(32), BOB.pk, "hello"), InvalidArgumentError)
})

Deno.test("nip04Encrypt - a secret key that is not bytes is misuse and throws InvalidArgumentError", () => {
  assertThrows(() => nip04Encrypt(NOT_BYTES, BOB.pk, "hello"), InvalidArgumentError)
})

Deno.test("nip04Encrypt - a peer key that is not 64 lowercase hex characters is misuse and throws InvalidArgumentError", () => {
  assertThrows(() => nip04Encrypt(ALICE.sk, NOT_A_PUBKEY, "hello"), InvalidArgumentError)
})

Deno.test("nip04Decrypt - a secret key of 31 bytes is misuse and throws InvalidArgumentError", () => {
  const payload = nip04Encrypt(ALICE.sk, BOB.pk, "hello")
  assertThrows(() => nip04Decrypt(new Uint8Array(31).fill(1), ALICE.pk, payload), InvalidArgumentError)
})

Deno.test("nip04Decrypt - a secret key of 33 bytes is misuse and throws InvalidArgumentError", () => {
  const payload = nip04Encrypt(ALICE.sk, BOB.pk, "hello")
  assertThrows(() => nip04Decrypt(new Uint8Array(33).fill(1), ALICE.pk, payload), InvalidArgumentError)
})

Deno.test("nip04Decrypt - a secret key that is not bytes is misuse and throws InvalidArgumentError", () => {
  const payload = nip04Encrypt(ALICE.sk, BOB.pk, "hello")
  assertThrows(() => nip04Decrypt(NOT_BYTES, ALICE.pk, payload), InvalidArgumentError)
})

Deno.test("nip04Decrypt - a peer key that is not 64 lowercase hex characters is misuse and throws InvalidArgumentError", () => {
  const payload = nip04Encrypt(ALICE.sk, BOB.pk, "hello")
  assertThrows(() => nip04Decrypt(BOB.sk, NOT_A_PUBKEY, payload), InvalidArgumentError)
})

Deno.test("nip04Decrypt - an iv whose base64 sets its unused trailing bits fails, being no canonical encoding (shared ADR-0095)", () => {
  const [ct = "", iv = ""] = nip04Encrypt(ALICE.sk, BOB.pk, "hello bob").split("?iv=")
  assertOneFailure(`${ct}?iv=${withTrailingBitSet(iv)}`)
})

Deno.test("nip04Decrypt - ciphertext whose base64 sets its unused trailing bits fails (shared ADR-0095)", () => {
  const [ct = "", iv = ""] = nip04Encrypt(ALICE.sk, BOB.pk, "hello bob").split("?iv=")
  assertOneFailure(`${withTrailingBitSet(ct)}?iv=${iv}`)
})

Deno.test("nip04Decrypt - unpadded base64 fails (shared ADR-0095)", () => {
  const [ct = "", iv = ""] = nip04Encrypt(ALICE.sk, BOB.pk, "hello bob").split("?iv=")
  assertOneFailure(`${ct}?iv=${iv.replace(/=+$/, "")}`)
})

Deno.test("nip04Decrypt - keeps a leading byte order mark, reading the plaintext exactly as written (shared ADR-0100)", () => {
  const plaintext = "\uFEFFhello bob"
  assertEquals(nip04Decrypt(BOB.sk, ALICE.pk, nip04Encrypt(ALICE.sk, BOB.pk, plaintext)), plaintext)
})

Deno.test("nip04Decrypt - a plaintext that is not valid UTF-8 fails with the one indistinguishable failure (shared ADR-0100)", () => {
  const payload = nip04PayloadOf(ALICE.sk, BOB.pk, INVALID_UTF8)
  assertThrows(() => nip04Decrypt(BOB.sk, ALICE.pk, payload), Nip04CryptoError, "NIP-04 decryption failed")
})

Deno.test("nip04Encrypt - a plaintext of 65567 bytes, the largest whose payload fits 87472 characters, round-trips", () => {
  const plaintext = "a".repeat(65567)
  const payload = nip04Encrypt(ALICE.sk, BOB.pk, plaintext)
  assertEquals(payload.length, 87452)
  assertEquals(nip04Decrypt(BOB.sk, ALICE.pk, payload), plaintext)
})

Deno.test("nip04Encrypt - a plaintext of 65568 bytes, whose payload would exceed 87472 characters, is refused", () => {
  assertThrows(() => nip04Encrypt(ALICE.sk, BOB.pk, "a".repeat(65568)), Nip04CryptoError, "65567")
})

Deno.test("nip04Encrypt - a plaintext is measured in UTF-8 bytes, not UTF-16 code units", () => {
  const plaintext = "€".repeat(21856)
  assertEquals(new TextEncoder().encode(plaintext).length, 65568)
  assertThrows(() => nip04Encrypt(ALICE.sk, BOB.pk, plaintext), Nip04CryptoError, "65567")
})

Deno.test("nip04Encrypt - a plaintext holding a lone surrogate, which has no UTF-8 encoding, is refused (shared ADR-0100)", () => {
  assertThrows(() => nip04Encrypt(ALICE.sk, BOB.pk, "a\uD800b"), Nip04CryptoError, "UTF-8")
})

Deno.test("nip04Encrypt - a plaintext ending in a lone high surrogate is refused (shared ADR-0100)", () => {
  assertThrows(() => nip04Encrypt(ALICE.sk, BOB.pk, "a\uD83D"), Nip04CryptoError, "UTF-8")
})
