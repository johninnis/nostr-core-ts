import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert"
import {
  createLocalSigner,
  defaultLocalSignerTools,
  type LocalSignerTools,
} from "../../src/infrastructure/crypto/local-signer.ts"
import { nip44Decrypt, nip44Encrypt } from "../../src/infrastructure/crypto/nip44-codec.ts"
import type { Signer } from "../../src/domain/service/signer.ts"
import type { PublicKey } from "../../src/domain/value-object/public-key.ts"
import { secretKeyOf } from "../support/keys.ts"
import { isFailure, isOk, ok } from "../../src/domain/value-object/result.ts"
import { publicKeyFixture, sigFixture } from "../../testing.ts"
import { Nip04CryptoError } from "../../src/domain/exception/nip04-crypto-error.ts"
import { Nip44CryptoError } from "../../src/domain/exception/nip44-crypto-error.ts"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"

const pubkey = publicKeyFixture("a".repeat(64))
const secretKey = new Uint8Array(32).fill(1)
const TEST_SIG = sigFixture("c".repeat(128))

const baseTools: LocalSignerTools = {
  getPublicKey: () => pubkey,
  schnorrSign: () => TEST_SIG,
  getNip44ConversationKey: () => new Uint8Array(32),
  nip44Encrypt: (_ck, plaintext) => `n44:${plaintext}`,
  nip44Decrypt: (_ck, payload) => payload.replace(/^n44:/, ""),
  nip04Encrypt: (_sk, _pk, plaintext) => `n04:${plaintext}`,
  nip04Decrypt: (_sk, _pk, ciphertext) => ciphertext.replace(/^n04:/, ""),
}

Deno.test("createLocalSigner - derives the public key from the secret via tools.getPublicKey", async () => {
  const signer = createLocalSigner(secretKey, baseTools)
  assertEquals(await signer.getPublicKey(), ok(pubkey))
})

Deno.test("createLocalSigner - signEvent computes id, signs, and assembles the NostrEvent", async () => {
  const signer = createLocalSigner(secretKey, baseTools)
  const signed = await signer.signEvent({ kind: 1, content: "hi", tags: [], created_at: 1 })
  assert(signed.success)
  const event = signed.value
  assertEquals(event.content, "hi")
  assertEquals(event.pubkey, pubkey)
  assertEquals(event.sig, TEST_SIG)
  assertEquals(event.id.length, 64)
})

Deno.test("createLocalSigner - nip44Encrypt returns ok with the ciphertext", async () => {
  const signer = createLocalSigner(secretKey, baseTools)
  const result = await signer.nip44Encrypt(pubkey, "hello")
  assertEquals(isOk(result) && result.value, "n44:hello")
})

Deno.test("createLocalSigner - nip44 round-trips plaintext", async () => {
  const signer = createLocalSigner(secretKey, baseTools)
  const encrypted = await signer.nip44Encrypt(pubkey, "secret")
  assertEquals(isOk(encrypted), true)
  if (!isOk(encrypted)) return
  const decrypted = await signer.nip44Decrypt(pubkey, encrypted.value)
  assertEquals(isOk(decrypted) && decrypted.value, "secret")
})

Deno.test("createLocalSigner - nip44Encrypt maps a thrown Nip44CryptoError to a failure", async () => {
  const signer = createLocalSigner(secretKey, {
    ...baseTools,
    nip44Encrypt: () => {
      throw new Nip44CryptoError("bad key")
    },
  })
  const result = await signer.nip44Encrypt(pubkey, "hello")
  assertEquals(isFailure(result) && result.error.type, "encrypt-failed")
})

Deno.test("createLocalSigner - nip44Decrypt maps a thrown Nip44CryptoError to a failure", async () => {
  const signer = createLocalSigner(secretKey, {
    ...baseTools,
    nip44Decrypt: () => {
      throw new Nip44CryptoError("corrupt")
    },
  })
  const result = await signer.nip44Decrypt(pubkey, "n44:x")
  assertEquals(isFailure(result) && result.error.type, "decrypt-failed")
})

Deno.test("createLocalSigner - nip04 round-trips plaintext", async () => {
  const signer = createLocalSigner(secretKey, baseTools)
  const encrypted = await signer.nip04Encrypt(pubkey, "legacy")
  assertEquals(isOk(encrypted), true)
  if (!isOk(encrypted)) return
  const decrypted = await signer.nip04Decrypt(pubkey, encrypted.value)
  assertEquals(isOk(decrypted) && decrypted.value, "legacy")
})

Deno.test("createLocalSigner - nip04Encrypt maps a thrown Nip04CryptoError to a failure", async () => {
  const signer = createLocalSigner(secretKey, {
    ...baseTools,
    nip04Encrypt: () => {
      throw new Nip04CryptoError("NIP-04 encryption failed")
    },
  })
  const result = await signer.nip04Encrypt(pubkey, "hello")
  assertEquals(isFailure(result) && result.error.type, "encrypt-failed")
})

Deno.test("createLocalSigner - nip04Decrypt maps a thrown Nip04CryptoError to a failure", async () => {
  const signer = createLocalSigner(secretKey, {
    ...baseTools,
    nip04Decrypt: () => {
      throw new Nip04CryptoError("NIP-04 decryption failed")
    },
  })
  const result = await signer.nip04Decrypt(pubkey, "n04:x")
  assertEquals(isFailure(result) && result.error.type, "decrypt-failed")
})

Deno.test("createLocalSigner - a cipher tool's TypeError is a fault and rejects rather than becoming a failure", async () => {
  const signer = createLocalSigner(secretKey, {
    ...baseTools,
    nip44Encrypt: () => {
      throw new TypeError("bug in caller code")
    },
  })
  await assertRejects(() => signer.nip44Encrypt(pubkey, "hello"), TypeError, "bug in caller code")
})

Deno.test("createLocalSigner - a peer key that is not a curve point is an encrypt-failed outcome for both ciphers", async () => {
  const signer = createLocalSigner(new Uint8Array(32).fill(1))
  const offCurve = publicKeyFixture("5".padStart(64, "0"))
  const results = [await signer.nip04Encrypt(offCurve, "hi"), await signer.nip44Encrypt(offCurve, "hi")]
  assertEquals(results.map((result) => isFailure(result) && result.error.type), ["encrypt-failed", "encrypt-failed"])
})

Deno.test("createLocalSigner - omitting tools uses defaultLocalSignerTools", async () => {
  const signer = createLocalSigner(new Uint8Array(32).fill(1))
  const derived = await signer.getPublicKey()
  assertEquals(isOk(derived) && derived.value.length, 64)
})

Deno.test("createLocalSigner - signEvent surfaces a thrown schnorr failure as a thrown Error", async () => {
  const signer = createLocalSigner(secretKey, {
    ...baseTools,
    schnorrSign: () => {
      throw new Error("bad sig")
    },
  })
  await assertRejects(() => signer.signEvent({ kind: 1, content: "x", tags: [], created_at: 1 }), Error, "bad sig")
})

Deno.test("createLocalSigner - signEvent signs exactly the NIP-01 fields, dropping any extra key on the template", async () => {
  const template = { kind: 1, content: "hi", tags: [], created_at: 1700000000, id: "forged", seen_on: ["wss://x"] }
  const signed = await createLocalSigner(secretKey, baseTools).signEvent(template)
  assertEquals(isOk(signed) ? Object.keys(signed.value).sort() : null, [
    "content",
    "created_at",
    "id",
    "kind",
    "pubkey",
    "sig",
    "tags",
  ])
})

Deno.test("createLocalSigner - throws InvalidArgumentError for a secret key outside the secp256k1 scalar range or not 32 bytes", () => {
  for (const key of [new Uint8Array(32), new Uint8Array(31).fill(1), new Uint8Array(32).fill(0xff)]) {
    assertThrows(() => createLocalSigner(key, baseTools), InvalidArgumentError)
  }
})

const RAISED_CEILING = 1 << 20
const raisedTools: LocalSignerTools = {
  ...defaultLocalSignerTools,
  nip44Encrypt: (conversationKey, plaintext) => nip44Encrypt(conversationKey, plaintext, RAISED_CEILING),
  nip44Decrypt: (conversationKey, payload) => nip44Decrypt(conversationKey, payload, RAISED_CEILING),
}

const pubkeyOf = async (signer: Signer): Promise<PublicKey> => {
  const key = await signer.getPublicKey()
  if (!key.success) throw new Error(key.error.message)
  return key.value
}

Deno.test("createLocalSigner - a host raises the NIP-44 ceiling through its tools, and a 500000-byte plaintext round-trips (shared ADR-0102)", async () => {
  const alice = createLocalSigner(secretKeyOf(0x11), raisedTools)
  const bob = createLocalSigner(secretKeyOf(0x22), raisedTools)
  const plaintext = "z".repeat(500000)
  const payload = await alice.nip44Encrypt(await pubkeyOf(bob), plaintext)
  if (!payload.success) throw new Error(payload.error.message)
  assertEquals(await bob.nip44Decrypt(await pubkeyOf(alice), payload.value), ok(plaintext))
})

Deno.test("createLocalSigner - a signer at the default ceiling refuses the raised host's 500000-byte payload as decrypt-failed", async () => {
  const alice = createLocalSigner(secretKeyOf(0x11), raisedTools)
  const bob = createLocalSigner(secretKeyOf(0x22))
  const payload = await alice.nip44Encrypt(await pubkeyOf(bob), "z".repeat(500000))
  if (!payload.success) throw new Error(payload.error.message)
  const decrypted = await bob.nip44Decrypt(await pubkeyOf(alice), payload.value)
  assertEquals(decrypted.success ? null : decrypted.error.type, "decrypt-failed")
})

Deno.test("createLocalSigner - signEvent rejects with InvalidArgumentError for a template that is not a NIP-01 event", async () => {
  const signer = createLocalSigner(secretKey, baseTools)
  const template = { kind: 1, content: "hi", tags: [] }
  for (const override of [{ created_at: 1.5 }, { created_at: -5 }, { created_at: Number.NaN }]) {
    await assertRejects(() => signer.signEvent({ ...template, ...override }), InvalidArgumentError)
  }
  for (const kind of [1.5, -1, 70000]) {
    await assertRejects(() => signer.signEvent({ ...template, kind, created_at: 1 }), InvalidArgumentError)
  }
})

Deno.test("createLocalSigner - signEvent never asks its tools to sign a template that is not a NIP-01 event", async () => {
  let signed = 0
  const signer = createLocalSigner(secretKey, {
    ...baseTools,
    schnorrSign: () => {
      signed++
      return TEST_SIG
    },
  })
  await assertRejects(() => signer.signEvent({ kind: 70000, content: "", tags: [], created_at: 1 }))
  assertEquals(signed, 0)
})

const peerOf = (index: number): PublicKey => publicKeyFixture(index.toString(16).padStart(64, "0"))

const derivationCounter = (): { readonly tools: LocalSignerTools; readonly derived: Array<PublicKey> } => {
  const derived: Array<PublicKey> = []
  const tools: LocalSignerTools = {
    ...baseTools,
    getNip44ConversationKey: (_sk, peer) => {
      derived.push(peer)
      return new Uint8Array(32)
    },
  }
  return { tools, derived }
}

Deno.test("createLocalSigner - derives a peer's NIP-44 conversation key once across encrypts and decrypts", async () => {
  const { tools, derived } = derivationCounter()
  const signer = createLocalSigner(secretKey, tools)
  await signer.nip44Encrypt(peerOf(1), "a")
  await signer.nip44Decrypt(peerOf(1), "n44:a")
  await signer.nip44Encrypt(peerOf(1), "b")
  assertEquals(derived, [peerOf(1)])
})

Deno.test("createLocalSigner - keeps no conversation key from a NIP-44 decrypt that failed", async () => {
  const { tools, derived } = derivationCounter()
  const signer = createLocalSigner(secretKey, {
    ...tools,
    nip44Decrypt: () => {
      throw new Nip44CryptoError("invalid MAC")
    },
  })
  await signer.nip44Decrypt(peerOf(1), "junk")
  await signer.nip44Decrypt(peerOf(1), "junk")
  assertEquals(derived, [peerOf(1), peerOf(1)])
})

Deno.test("createLocalSigner - holds at most 128 conversation keys, deriving the least recently used peer's again", async () => {
  const { tools, derived } = derivationCounter()
  const signer = createLocalSigner(secretKey, tools)
  for (let index = 1; index <= 128; index++) await signer.nip44Encrypt(peerOf(index), "x")
  await signer.nip44Encrypt(peerOf(1), "x")
  await signer.nip44Encrypt(peerOf(129), "x")
  derived.length = 0
  await signer.nip44Encrypt(peerOf(1), "x")
  await signer.nip44Encrypt(peerOf(2), "x")
  assertEquals(derived, [peerOf(2)])
})
