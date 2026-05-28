import { assert, assertEquals, assertMatch, assertNotEquals, assertRejects } from "@std/assert"
import { schnorr } from "@noble/curves/secp256k1"
import { base64 } from "@scure/base"
import { bytesToHex } from "@noble/hashes/utils"
import { Nip04DecryptError } from "../../src/domain/exception/nip04-decrypt-error.ts"
import { nip04Decrypt, nip04Encrypt } from "../../src/infrastructure/adapter/nip04-adapter.ts"
import type { PublicKey } from "../../src/domain/value-object/public-key.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"

const TEXT_DECODER = new TextDecoder()

const makeKeypair = (): { sk: Uint8Array; pkHex: PublicKey } => {
  const sk = schnorr.utils.randomSecretKey()
  return { sk, pkHex: parsePublicKey(bytesToHex(schnorr.getPublicKey(sk))) }
}

const randomByteString = (length: number): string => {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return TEXT_DECODER.decode(bytes.map((b) => 0x20 + (b % 0x5e)))
}

Deno.test("nip04 round-trip - short ASCII", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  const payload = await nip04Encrypt(alice.sk, bob.pkHex, "hello bob")
  assertEquals(await nip04Decrypt(bob.sk, alice.pkHex, payload), "hello bob")
})

Deno.test("nip04 round-trip - multibyte UTF-8", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  const plaintext = "🦄 unicorns + ümlauts + 漢字"
  const payload = await nip04Encrypt(alice.sk, bob.pkHex, plaintext)
  assertEquals(await nip04Decrypt(bob.sk, alice.pkHex, payload), plaintext)
})

Deno.test("nip04 round-trip - long message (10kB)", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  const plaintext = "x".repeat(10_000)
  const payload = await nip04Encrypt(alice.sk, bob.pkHex, plaintext)
  assertEquals(await nip04Decrypt(bob.sk, alice.pkHex, payload), plaintext)
})

Deno.test("nip04 payload shape - base64(ciphertext)?iv=base64(iv)", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  const payload = await nip04Encrypt(alice.sk, bob.pkHex, "shape check")
  assertMatch(payload, /^[A-Za-z0-9+/]+=*\?iv=[A-Za-z0-9+/]+=*$/)
  const [, ivPart = ""] = payload.split("?iv=")
  assertEquals(atob(ivPart).length, 16, "iv must decode to 16 bytes")
})

Deno.test("nip04 sender and recipient derive identical shared secret", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  const fromAlice = await nip04Encrypt(alice.sk, bob.pkHex, "symmetry")
  const fromBob = await nip04Encrypt(bob.sk, alice.pkHex, "symmetry")
  assertEquals(await nip04Decrypt(bob.sk, alice.pkHex, fromAlice), "symmetry")
  assertEquals(await nip04Decrypt(alice.sk, bob.pkHex, fromBob), "symmetry")
})

Deno.test("nip04 rejects payload missing ?iv= separator", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  await assertRejects(
    () => nip04Decrypt(alice.sk, bob.pkHex, "ZmFrZQ=="),
    Error,
    "missing ?iv=",
  )
})

Deno.test("nip04 fuzz round-trip - 50 iterations of random keypair + random plaintext", async () => {
  for (let i = 0; i < 50; i++) {
    const alice = makeKeypair()
    const bob = makeKeypair()
    const length = 1 + Math.floor(Math.random() * 2048)
    const plaintext = randomByteString(length)
    const payload = await nip04Encrypt(alice.sk, bob.pkHex, plaintext)
    const decrypted = await nip04Decrypt(bob.sk, alice.pkHex, payload)
    assertEquals(decrypted, plaintext, `iteration ${i} length ${length} failed round-trip`)
  }
})

Deno.test("nip04 round-trip - boundary lengths (AES block edges and beyond)", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  for (const length of [1, 15, 16, 17, 31, 32, 33, 64, 1024, 8192]) {
    const plaintext = "a".repeat(length)
    const payload = await nip04Encrypt(alice.sk, bob.pkHex, plaintext)
    assertEquals(await nip04Decrypt(bob.sk, alice.pkHex, payload), plaintext, `length ${length} failed`)
  }
})

Deno.test("nip04 round-trip - empty plaintext", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  const payload = await nip04Encrypt(alice.sk, bob.pkHex, "")
  assertEquals(await nip04Decrypt(bob.sk, alice.pkHex, payload), "")
})

Deno.test("nip04 rejects invalid base64 in ciphertext portion with Nip04DecryptError", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  const validIv = base64.encode(new Uint8Array(16))
  await assertRejects(
    () => nip04Decrypt(alice.sk, bob.pkHex, `!!!not-base64!!!?iv=${validIv}`),
    Nip04DecryptError,
    "invalid base64 in ciphertext",
  )
})

Deno.test("nip04 rejects invalid base64 in iv portion with Nip04DecryptError", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  await assertRejects(
    () => nip04Decrypt(alice.sk, bob.pkHex, "ZmFrZQ==?iv=!!!not-base64!!!"),
    Nip04DecryptError,
    "invalid base64 in iv",
  )
})

Deno.test("nip04 rejects wrong-length iv (too short)", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  const validCiphertext = base64.encode(new Uint8Array(32))
  const shortIv = base64.encode(new Uint8Array(8))
  await assertRejects(
    () => nip04Decrypt(alice.sk, bob.pkHex, `${validCiphertext}?iv=${shortIv}`),
    Error,
    "invalid iv length",
  )
})

Deno.test("nip04 rejects wrong-length iv (too long)", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  const validCiphertext = base64.encode(new Uint8Array(32))
  const longIv = base64.encode(new Uint8Array(24))
  await assertRejects(
    () => nip04Decrypt(alice.sk, bob.pkHex, `${validCiphertext}?iv=${longIv}`),
    Error,
    "invalid iv length",
  )
})

Deno.test("nip04 rejects empty iv portion", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  const validCiphertext = base64.encode(new Uint8Array(32))
  await assertRejects(
    () => nip04Decrypt(alice.sk, bob.pkHex, `${validCiphertext}?iv=`),
    Error,
  )
})

Deno.test("nip04 rejects truncated ciphertext that fails AES-CBC padding", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  const payload = await nip04Encrypt(alice.sk, bob.pkHex, "secret message here")
  const [ct = "", iv = ""] = payload.split("?iv=")
  const truncatedCt = ct.slice(0, ct.length - 4)
  await assertRejects(
    () => nip04Decrypt(bob.sk, alice.pkHex, `${truncatedCt}?iv=${iv}`),
    Error,
  )
})

Deno.test("nip04 round-trip - falls back to noble JS when crypto.subtle is unavailable", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  const originalSubtle: SubtleCrypto | undefined = globalThis.crypto.subtle
  Object.defineProperty(globalThis.crypto, "subtle", { value: undefined, configurable: true })
  try {
    const payload = await nip04Encrypt(alice.sk, bob.pkHex, "no subtle here")
    assertEquals(await nip04Decrypt(bob.sk, alice.pkHex, payload), "no subtle here")
  } finally {
    Object.defineProperty(globalThis.crypto, "subtle", { value: originalSubtle, configurable: true })
  }
})

Deno.test("nip04 - subtle-encrypted payload decrypts via noble fallback (wire-compatible)", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  const plaintext = "cross-path interop"
  const payload = await nip04Encrypt(alice.sk, bob.pkHex, plaintext)
  const originalSubtle: SubtleCrypto | undefined = globalThis.crypto.subtle
  Object.defineProperty(globalThis.crypto, "subtle", { value: undefined, configurable: true })
  try {
    assertEquals(await nip04Decrypt(bob.sk, alice.pkHex, payload), plaintext)
  } finally {
    Object.defineProperty(globalThis.crypto, "subtle", { value: originalSubtle, configurable: true })
  }
})

Deno.test("nip04 is unauthenticated - flipping a ciphertext byte still 'decrypts' to garbage, not the original", async () => {
  const alice = makeKeypair()
  const bob = makeKeypair()
  const plaintext = "the quick brown fox jumps over the lazy dog one two three"
  const payload = await nip04Encrypt(alice.sk, bob.pkHex, plaintext)
  const [ct = "", iv = ""] = payload.split("?iv=")
  const ctBytes = Uint8Array.from(atob(ct), (c) => c.charCodeAt(0))
  ctBytes[0] = ctBytes[0] !== undefined ? ctBytes[0] ^ 0x01 : 0x01
  const tampered = `${base64.encode(ctBytes)}?iv=${iv}`
  let decrypted: string | null = null
  try {
    decrypted = await nip04Decrypt(bob.sk, alice.pkHex, tampered)
  } catch {
    decrypted = null
  }
  if (decrypted !== null) assertNotEquals(decrypted, plaintext, "tampered ciphertext must not decrypt to original")
  assert(decrypted !== plaintext, "AES-CBC without MAC: tamper either throws or returns garbage")
})
