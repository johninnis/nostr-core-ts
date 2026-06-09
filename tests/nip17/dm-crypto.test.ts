import { assertEquals, assertInstanceOf } from "@std/assert"
import { buildEventFixture, createMockSigner, resetEventFixtureCounter } from "../../testing.ts"
import { buildDmGiftWraps, parseRumor, unwrapGiftWrap } from "../../src/application/service/dm-crypto.ts"
import type { Signer } from "../../src/domain/service/signer.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"
import { parseEventId } from "../../src/domain/value-object/event-id.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"
import { parseSig } from "../../src/domain/value-object/sig.ts"
import { EncryptionError } from "../../src/domain/exception/encryption-error.ts"
import { GiftWrapUnwrapError } from "../../src/application/exception/gift-wrap-unwrap-error.ts"
import { SignerError } from "../../src/domain/exception/signer-error.ts"

const PUBKEY_A = parsePublicKey("a".repeat(64))
const PUBKEY_B = parsePublicKey("b".repeat(64))
const EPHEMERAL_PUBKEY = parsePublicKey("f".repeat(64))
const EPHEMERAL_SECRET = new Uint8Array(32).fill(7)

const mockSigner = (decryptFn: (pubkey: string, ciphertext: string) => Promise<string>): Signer =>
  createMockSigner({
    pubkey: PUBKEY_A,
    nip44Decrypt: async (pubkey, ciphertext) => {
      try {
        return ok(await decryptFn(pubkey, ciphertext))
      } catch (err) {
        return failure(new SignerError("decrypt-failed", err instanceof Error ? err.message : String(err)))
      }
    },
    nip44Encrypt: (_pubkey, plaintext) => ok(`enc:${plaintext}`),
    signEvent: (event) => ({
      ...event,
      id: parseEventId("d".repeat(64)),
      pubkey: PUBKEY_A,
      sig: parseSig("e".repeat(128)),
    }),
  })

const mockEphemeralSignerFactory = (_secretKey: Uint8Array): Signer =>
  createMockSigner({
    pubkey: EPHEMERAL_PUBKEY,
    nip44Encrypt: (_pubkey, plaintext) => ok(`enc:${plaintext}`),
    signEvent: (event) => ({
      ...event,
      id: parseEventId("d".repeat(64)),
      pubkey: EPHEMERAL_PUBKEY,
      sig: parseSig("e".repeat(128)),
    }),
  })

const mockGenerateSecretKey = (): Uint8Array => EPHEMERAL_SECRET

const cleanup = (): void => {
  resetEventFixtureCounter()
}

Deno.test({
  name: "unwrapGiftWrap returns seal-wrong-kind failure when seal kind is not 13",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const signer = mockSigner((_pubkey, _ciphertext) =>
      Promise.resolve(JSON.stringify({ kind: 99, pubkey: PUBKEY_B, content: "inner" }))
    )

    const event = buildEventFixture({ kind: 1059, content: "encrypted-seal" })
    const result = await unwrapGiftWrap(signer, event)

    assertEquals(result.success, false)
    if (result.success) throw new Error("expected failure")
    assertInstanceOf(result.error, GiftWrapUnwrapError)
    assertEquals(result.error.tag, "seal-wrong-kind")
    cleanup()
  },
})

Deno.test({
  name: "unwrapGiftWrap returns rumor-wrong-kind failure when rumour kind is not 14",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    let callCount = 0
    const signer = mockSigner((_pubkey, _ciphertext) => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve(JSON.stringify({ kind: 13, pubkey: PUBKEY_B, content: "encrypted-rumor" }))
      }
      return Promise.resolve(
        JSON.stringify({ kind: 1, pubkey: PUBKEY_B, created_at: 1700000000, tags: [], content: "hello" }),
      )
    })

    const event = buildEventFixture({ kind: 1059, content: "encrypted-seal" })
    const result = await unwrapGiftWrap(signer, event)

    assertEquals(result.success, false)
    if (result.success) throw new Error("expected failure")
    assertEquals(result.error.tag, "rumor-wrong-kind")
    cleanup()
  },
})

Deno.test({
  name: "unwrapGiftWrap returns success with rumour and sender when seal is kind 13 and rumour is kind 14",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    let callCount = 0
    const signer = mockSigner((_pubkey, _ciphertext) => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve(JSON.stringify({ kind: 13, pubkey: PUBKEY_B, content: "encrypted-rumor" }))
      }
      return Promise.resolve(
        JSON.stringify({
          kind: 14,
          pubkey: PUBKEY_B,
          created_at: 1700000000,
          tags: [["p", PUBKEY_A]],
          content: "hello",
        }),
      )
    })

    const event = buildEventFixture({ kind: 1059, content: "encrypted-seal" })
    const result = await unwrapGiftWrap(signer, event)

    assertEquals(result.success, true)
    if (!result.success) throw result.error
    assertEquals(result.value.senderPubkey, PUBKEY_B)
    assertEquals(result.value.rumor.kind, 14)
    assertEquals(result.value.rumor.content, "hello")
    cleanup()
  },
})

Deno.test({
  name: "unwrapGiftWrap returns not-gift-wrap failure when outer event is not kind 1059",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const signer = mockSigner(() =>
      Promise.resolve(JSON.stringify({ kind: 13, pubkey: PUBKEY_B, content: "encrypted-rumor" }))
    )

    const event = buildEventFixture({ kind: 4, content: "encrypted-seal" })
    const result = await unwrapGiftWrap(signer, event)

    assertEquals(result.success, false)
    if (result.success) throw new Error("expected failure")
    assertEquals(result.error.tag, "not-gift-wrap")
    cleanup()
  },
})

Deno.test({
  name: "unwrapGiftWrap returns rumor-pubkey-mismatch failure when rumour pubkey does not match seal pubkey",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    let callCount = 0
    const signer = mockSigner((_pubkey, _ciphertext) => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve(JSON.stringify({ kind: 13, pubkey: PUBKEY_B, content: "encrypted-rumor" }))
      }
      return Promise.resolve(
        JSON.stringify({ kind: 14, pubkey: "f".repeat(64), created_at: 1700000000, tags: [], content: "spoofed" }),
      )
    })

    const event = buildEventFixture({ kind: 1059, content: "encrypted-seal" })
    const result = await unwrapGiftWrap(signer, event)

    assertEquals(result.success, false)
    if (result.success) throw new Error("expected failure")
    assertEquals(result.error.tag, "rumor-pubkey-mismatch")
    cleanup()
  },
})

Deno.test({
  name: "unwrapGiftWrap returns seal-decrypt-failed when nip44 decrypt fails on the outer wrap",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const signer = createMockSigner({
      pubkey: PUBKEY_A,
      nip44Decrypt: () => failure(new SignerError("decrypt-failed", "bad payload")),
    })
    const event = buildEventFixture({ kind: 1059, content: "encrypted-seal" })
    const result = await unwrapGiftWrap(signer, event)
    assertEquals(result.success, false)
    if (result.success) throw new Error("expected failure")
    assertEquals(result.error.tag, "seal-decrypt-failed")
    cleanup()
  },
})

Deno.test({
  name: "buildDmGiftWraps returns 2 gift wraps for recipient and sender",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const signer = mockSigner((_pubkey, _ciphertext) => Promise.resolve("decrypted"))
    const result = await buildDmGiftWraps({
      signer,
      ephemeralSignerFactory: mockEphemeralSignerFactory,
      generateSecretKey: mockGenerateSecretKey,
      rumor: { kind: 14, pubkey: PUBKEY_A, created_at: 1700000000, tags: [["p", PUBKEY_B]], content: "hello there" },
      recipientPubkey: PUBKEY_B,
    })

    assertEquals(result.success, true)
    if (!result.success) throw result.error
    const wraps = result.value
    assertEquals(wraps.length, 2)
    assertEquals(wraps[0]?.targetPubkey, PUBKEY_B)
    assertEquals(wraps[1]?.targetPubkey, PUBKEY_A)
    cleanup()
  },
})

Deno.test("parseRumor - returns null for input that is not an object", () => {
  assertEquals(parseRumor("nope"), null)
  assertEquals(parseRumor([1, 2, 3]), null)
  assertEquals(parseRumor(null), null)
})

Deno.test("parseRumor - returns null when pubkey is not a valid public key", () => {
  assertEquals(
    parseRumor({ kind: 14, pubkey: "tooshort", created_at: 1, tags: [], content: "hi" }),
    null,
  )
})

Deno.test("parseRumor - returns null when tags is not a matrix of strings", () => {
  assertEquals(
    parseRumor({ kind: 14, pubkey: PUBKEY_B, created_at: 1, tags: [[1, 2]], content: "hi" }),
    null,
  )
})

Deno.test("parseRumor - returns null when a required field is missing", () => {
  assertEquals(parseRumor({ kind: 14, pubkey: PUBKEY_B, tags: [], content: "hi" }), null)
})

Deno.test("parseRumor - returns null when created_at is not a finite integer", () => {
  assertEquals(parseRumor({ kind: 14, pubkey: PUBKEY_B, created_at: NaN, tags: [], content: "hi" }), null)
  assertEquals(parseRumor({ kind: 14, pubkey: PUBKEY_B, created_at: -1, tags: [], content: "hi" }), null)
  assertEquals(parseRumor({ kind: 14, pubkey: PUBKEY_B, created_at: 1.5, tags: [], content: "hi" }), null)
})

Deno.test("parseRumor - returns null when kind is not a finite non-negative integer", () => {
  assertEquals(parseRumor({ kind: -1, pubkey: PUBKEY_B, created_at: 1, tags: [], content: "hi" }), null)
  assertEquals(parseRumor({ kind: NaN, pubkey: PUBKEY_B, created_at: 1, tags: [], content: "hi" }), null)
})

Deno.test("parseRumor - returns a Rumor for well-formed input", () => {
  const rumor = parseRumor({
    kind: 14,
    pubkey: PUBKEY_B,
    created_at: 1700000000,
    tags: [["p", PUBKEY_A]],
    content: "hello",
  })
  assertEquals(rumor?.kind, 14)
  assertEquals(rumor?.pubkey, PUBKEY_B)
  assertEquals(rumor?.content, "hello")
})

Deno.test({
  name: "unwrapGiftWrap returns seal-malformed when the seal is not a JSON object",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const signer = mockSigner(() => Promise.resolve("42"))
    const event = buildEventFixture({ kind: 1059, content: "encrypted-seal" })
    const result = await unwrapGiftWrap(signer, event)
    assertEquals(result.success, false)
    if (result.success) throw new Error("expected failure")
    assertEquals(result.error.tag, "seal-malformed")
    cleanup()
  },
})

Deno.test({
  name: "buildDmGiftWraps returns EncryptionError when the signer's nip44Encrypt fails",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const signer = createMockSigner({
      pubkey: PUBKEY_A,
      nip44Encrypt: () => failure(new SignerError("encrypt-failed", "underlying signer refused")),
    })
    const result = await buildDmGiftWraps({
      signer,
      ephemeralSignerFactory: () => signer,
      generateSecretKey: () => new Uint8Array(32),
      rumor: { kind: 14, pubkey: PUBKEY_A, created_at: 1700000000, tags: [["p", PUBKEY_B]], content: "hi" },
      recipientPubkey: PUBKEY_B,
    })
    assertEquals(result.success, false)
    if (!result.success) assertEquals(result.error instanceof EncryptionError, true)
    cleanup()
  },
})
