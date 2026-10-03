import { assertEquals } from "@std/assert"
import { buildEventFixture, createStubSigner, eventIdFixture, publicKeyFixture, sigFixture } from "../../testing.ts"
import { buildDmGiftWraps, unwrapGiftWrap } from "../../src/application/service/dm-crypto.ts"
import { buildRumour, parseRumour } from "../../src/domain/service/rumour.ts"
import { buildPrivateMessage, buildPrivateReaction } from "../../src/domain/service/builder.ts"
import { computeEventId } from "../../src/domain/service/event-id.ts"
import type { EventToSign } from "../../src/domain/service/event-id.ts"
import { createLocalSigner } from "../../src/infrastructure/crypto/local-signer.ts"
import { secretKeyOf } from "../support/keys.ts"
import type { Signer } from "../../src/domain/service/signer.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"
import type { Result } from "../../src/domain/value-object/result.ts"
import { createJsonCipher } from "../../src/application/service/json-crypto.ts"
import type { NostrEvent, UnsignedEvent } from "../../src/domain/value-object/nostr-event.ts"
import type { PublicKey } from "../../src/domain/value-object/public-key.ts"
import type { JsonSerialisable } from "../../src/domain/value-object/json-serialisable.ts"

const PUBKEY_A = publicKeyFixture("a".repeat(64))
const PUBKEY_B = publicKeyFixture("b".repeat(64))
const EPHEMERAL_PUBKEY = publicKeyFixture("f".repeat(64))

const stubSigner = (decryptFn: (pubkey: string, ciphertext: string) => Promise<string>): Signer =>
  createStubSigner({
    pubkey: PUBKEY_A,
    nip44Decrypt: async (pubkey, ciphertext) => {
      try {
        return ok(await decryptFn(pubkey, ciphertext))
      } catch (err) {
        return failure({ type: "decrypt-failed", message: err instanceof Error ? err.message : String(err) })
      }
    },
    nip44Encrypt: (_pubkey, plaintext) => ok(`enc:${plaintext}`),
    signEvent: (event) =>
      ok({
        ...event,
        id: eventIdFixture("d".repeat(64)),
        pubkey: PUBKEY_A,
        sig: sigFixture("e".repeat(128)),
      }),
  })

const stubEphemeralSigner = (): Signer =>
  createStubSigner({
    pubkey: EPHEMERAL_PUBKEY,
    nip44Encrypt: (_pubkey, plaintext) => ok(`enc:${plaintext}`),
    signEvent: (event) =>
      ok({
        ...event,
        id: eventIdFixture("d".repeat(64)),
        pubkey: EPHEMERAL_PUBKEY,
        sig: sigFixture("e".repeat(128)),
      }),
  })

const recipient = createLocalSigner(secretKeyOf(0x11))
const sender = createLocalSigner(secretKeyOf(0x22))
const ephemeralSigner = (): Signer => createLocalSigner(secretKeyOf(0x33))
const FIXED_STAMP = { clock: () => 1800000000, randomUint32: () => 0 }

const keyOf = async (signer: Signer): Promise<PublicKey> => {
  const key = await signer.getPublicKey()
  if (!key.success) throw new Error("a local signer always has its key")
  return key.value
}

const RECIPIENT = await keyOf(recipient)
const SENDER = await keyOf(sender)

const signed = async (signer: Signer, event: UnsignedEvent): Promise<NostrEvent> => {
  const result = await signer.signEvent(event)
  if (!result.success) throw new Error(result.error.message)
  return result.value
}

const encryptedTo = async <T>(signer: Signer, value: T & JsonSerialisable<T>): Promise<string> => {
  const result = await createJsonCipher(signer).encrypt(RECIPIENT, value)
  if (!result.success) throw new Error(result.error.type)
  return result.value
}

const rawEncryptedTo = async (signer: Signer, plaintext: string): Promise<string> => {
  const result = await signer.nip44Encrypt(RECIPIENT, plaintext)
  if (!result.success) throw new Error(result.error.message)
  return result.value
}

const wrapAround = (content: string, kind = 1059): Promise<NostrEvent> =>
  signed(ephemeralSigner(), { kind, created_at: 1700000000, tags: [["p", RECIPIENT]], content })

const wrapOf = async <T>(seal: T & JsonSerialisable<T>, kind = 1059): Promise<NostrEvent> =>
  wrapAround(await encryptedTo(ephemeralSigner(), seal), kind)

const sealOf = async <T>(rumour: T & JsonSerialisable<T>, fields: Partial<UnsignedEvent> = {}): Promise<NostrEvent> =>
  signed(sender, {
    kind: 13,
    created_at: 1700000000,
    tags: [],
    content: await encryptedTo(sender, rumour),
    ...fields,
  })

const rumourFields = (overrides: Partial<EventToSign> = {}): EventToSign => ({
  kind: 14,
  pubkey: SENDER,
  created_at: 1700000000,
  tags: [["p", RECIPIENT]],
  content: "hello",
  ...overrides,
})

const unwrapRumour = async <T>(rumour: T & JsonSerialisable<T>): ReturnType<typeof unwrapGiftWrap> =>
  unwrapGiftWrap(recipient, await wrapOf(await sealOf(rumour)))

const errorOf = <T, E>(result: Result<T, E>): E | null => result.success ? null : result.error

Deno.test("unwrapGiftWrap - returns the rumour and the seal's signer as the sender", async () => {
  const result = await unwrapRumour(buildRumour(rumourFields()))
  assertEquals(result.success && [result.value.senderPubkey, result.value.rumour.content], [SENDER, "hello"])
})

Deno.test("unwrapGiftWrap - accepts a NIP-17 kind-15 file-message rumour", async () => {
  const result = await unwrapRumour(buildRumour(rumourFields({ kind: 15 })))
  assertEquals(result.success ? result.value.rumour.kind : result.error, 15)
})

Deno.test("unwrapGiftWrap - accepts a rumour of any kind, leaving dispatch to the caller", async () => {
  const result = await unwrapRumour(buildRumour(rumourFields({ kind: 444 })))
  assertEquals(result.success ? result.value.rumour.kind : result.error, 444)
})

Deno.test("unwrapGiftWrap - accepts a NIP-59 kind-21059 ephemeral gift wrap", async () => {
  const result = await unwrapGiftWrap(recipient, await wrapOf(await sealOf(buildRumour(rumourFields())), 21059))
  assertEquals(result.success ? result.value.senderPubkey : result.error, SENDER)
})

Deno.test("unwrapGiftWrap - reports not-gift-wrap for an outer event that is not kind 1059 or 21059", async () => {
  const result = await unwrapGiftWrap(recipient, await wrapOf(await sealOf(rumourFields()), 4))
  assertEquals(errorOf(result), "not-gift-wrap")
})

Deno.test("unwrapGiftWrap - reports wrap-signature-invalid for a gift wrap whose signature does not verify", async () => {
  const wrap = await wrapOf(await sealOf(rumourFields()))
  const result = await unwrapGiftWrap(recipient, { ...wrap, sig: sigFixture("0".repeat(128)) })
  assertEquals(errorOf(result), "wrap-signature-invalid")
})

Deno.test("unwrapGiftWrap - reports seal-decrypt-failed when the recipient cannot decrypt the gift wrap", async () => {
  const cipher = createStubSigner({
    pubkey: RECIPIENT,
    nip44Decrypt: () => failure({ type: "decrypt-failed", message: "bad payload" }),
  })
  const result = await unwrapGiftWrap(cipher, await wrapOf(await sealOf(rumourFields())))
  assertEquals(errorOf(result), "seal-decrypt-failed")
})

Deno.test("unwrapGiftWrap - reports seal-malformed for a seal that is not a JSON object", async () => {
  const result = await unwrapGiftWrap(recipient, await wrapOf(42))
  assertEquals(errorOf(result), "seal-malformed")
})

Deno.test("unwrapGiftWrap - reports seal-malformed for a seal whose decrypted plaintext is not JSON", async () => {
  const result = await unwrapGiftWrap(recipient, await wrapAround(await rawEncryptedTo(ephemeralSigner(), "not json")))
  assertEquals(errorOf(result), "seal-malformed")
})

Deno.test("unwrapGiftWrap - reports seal-malformed for an unsigned seal", async () => {
  const { sig: _sig, ...unsignedSeal } = await sealOf(rumourFields())
  const result = await unwrapGiftWrap(recipient, await wrapOf(unsignedSeal))
  assertEquals(errorOf(result), "seal-malformed")
})

Deno.test("unwrapGiftWrap - reports seal-malformed for a seal with a fractional kind", async () => {
  const seal = await sealOf(rumourFields())
  const result = await unwrapGiftWrap(recipient, await wrapOf({ ...seal, kind: 13.5 }))
  assertEquals(errorOf(result), "seal-malformed")
})

Deno.test("unwrapGiftWrap - reports seal-malformed for a seal carrying tags", async () => {
  const seal = await sealOf(rumourFields(), { tags: [["p", RECIPIENT]] })
  const result = await unwrapGiftWrap(recipient, await wrapOf(seal))
  assertEquals(errorOf(result), "seal-malformed")
})

Deno.test("unwrapGiftWrap - reports seal-wrong-kind for a seal that is not kind 13", async () => {
  const result = await unwrapGiftWrap(recipient, await wrapOf(await sealOf(rumourFields(), { kind: 99 })))
  assertEquals(errorOf(result), "seal-wrong-kind")
})

Deno.test("unwrapGiftWrap - reports seal-signature-invalid for a seal whose signature does not verify", async () => {
  const seal = await sealOf(rumourFields())
  const result = await unwrapGiftWrap(recipient, await wrapOf({ ...seal, sig: "0".repeat(128) }))
  assertEquals(errorOf(result), "seal-signature-invalid")
})

Deno.test("unwrapGiftWrap - reports rumour-decrypt-failed for a seal the recipient cannot decrypt", async () => {
  const seal = await signed(sender, { kind: 13, created_at: 1700000000, tags: [], content: "not a payload" })
  const result = await unwrapGiftWrap(recipient, await wrapOf(seal))
  assertEquals(errorOf(result), "rumour-decrypt-failed")
})

Deno.test("unwrapGiftWrap - reports rumour-malformed for a rumour whose decrypted plaintext is not JSON", async () => {
  const content = await rawEncryptedTo(sender, "not json")
  const seal = await signed(sender, { kind: 13, created_at: 1700000000, tags: [], content })
  const result = await unwrapGiftWrap(recipient, await wrapOf(seal))
  assertEquals(errorOf(result), "rumour-malformed")
})

Deno.test("unwrapGiftWrap - reports rumour-signed for a rumour carrying a signature (NIP-59: the inner event MUST always be unsigned)", async () => {
  const result = await unwrapRumour(await signed(sender, rumourFields()))
  assertEquals(errorOf(result), "rumour-signed")
})

Deno.test("unwrapGiftWrap - reports rumour-id-mismatch when the rumour id does not match its fields", async () => {
  const result = await unwrapRumour({ ...rumourFields(), id: "0".repeat(64) })
  assertEquals(errorOf(result), "rumour-id-mismatch")
})

Deno.test("unwrapGiftWrap - reports rumour-malformed for a rumour with no id (NIP-17: Fields id and created_at are required)", async () => {
  const result = await unwrapRumour(rumourFields())
  assertEquals(errorOf(result), "rumour-malformed")
})

Deno.test("unwrapGiftWrap - reports rumour-pubkey-mismatch when the rumour's author is not the seal's signer", async () => {
  const result = await unwrapRumour(buildRumour(rumourFields({ pubkey: PUBKEY_B })))
  assertEquals(errorOf(result), "rumour-pubkey-mismatch")
})

Deno.test("buildDmGiftWraps wraps a reaction to the sender's own message once to each member (shared ADR-0074)", async () => {
  const room = { sender: PUBKEY_A, receivers: [PUBKEY_B] }
  const result = await buildDmGiftWraps({
    signer: stubSigner((_pubkey, _ciphertext) => Promise.resolve("decrypted")),
    createEphemeralSigner: stubEphemeralSigner,
    ...FIXED_STAMP,
    rumour: buildPrivateReaction(room, buildPrivateMessage(room, "hello")),
  })
  assertEquals(result.success && result.value.map((wrap) => wrap.targetPubkey), [PUBKEY_A, PUBKEY_B])
})

Deno.test({
  name: "buildDmGiftWraps returns 2 gift wraps, to the sender and the recipient in room order",
  fn: async () => {
    const signer = stubSigner((_pubkey, _ciphertext) => Promise.resolve("decrypted"))
    const result = await buildDmGiftWraps({
      signer,
      createEphemeralSigner: stubEphemeralSigner,
      ...FIXED_STAMP,
      rumour: buildRumour({
        kind: 14,
        pubkey: PUBKEY_A,
        created_at: 1700000000,
        tags: [["p", PUBKEY_B]],
        content: "hello there",
      }),
    })

    assertEquals(result.success, true)
    if (!result.success) throw result.error
    const wraps = result.value
    assertEquals(wraps.length, 2)
    assertEquals(wraps[0]?.targetPubkey, PUBKEY_A)
    assertEquals(wraps[1]?.targetPubkey, PUBKEY_B)
  },
})

Deno.test("parseRumour - returns rumour-malformed for input that is not an object", () => {
  assertEquals(parseRumour("nope"), failure("rumour-malformed"))
  assertEquals(parseRumour([1, 2, 3]), failure("rumour-malformed"))
  assertEquals(parseRumour(null), failure("rumour-malformed"))
})

Deno.test("parseRumour - returns rumour-malformed when pubkey is not a valid public key", () => {
  assertEquals(
    parseRumour({ kind: 14, pubkey: "tooshort", created_at: 1, tags: [], content: "hi" }),
    failure("rumour-malformed"),
  )
})

Deno.test("parseRumour - returns rumour-malformed when tags is not a matrix of strings", () => {
  assertEquals(
    parseRumour({ kind: 14, pubkey: PUBKEY_B, created_at: 1, tags: [[1, 2]], content: "hi" }),
    failure("rumour-malformed"),
  )
})

Deno.test("parseRumour - returns rumour-malformed when a required field is missing", () => {
  assertEquals(parseRumour({ kind: 14, pubkey: PUBKEY_B, tags: [], content: "hi" }), failure("rumour-malformed"))
})

Deno.test("parseRumour - returns rumour-malformed when created_at is not a finite integer", () => {
  assertEquals(
    parseRumour({ kind: 14, pubkey: PUBKEY_B, created_at: NaN, tags: [], content: "hi" }),
    failure("rumour-malformed"),
  )
  assertEquals(
    parseRumour({ kind: 14, pubkey: PUBKEY_B, created_at: -1, tags: [], content: "hi" }),
    failure("rumour-malformed"),
  )
  assertEquals(
    parseRumour({ kind: 14, pubkey: PUBKEY_B, created_at: 1.5, tags: [], content: "hi" }),
    failure("rumour-malformed"),
  )
})

Deno.test("parseRumour - returns rumour-malformed when kind is not a finite non-negative integer", () => {
  assertEquals(
    parseRumour({ kind: -1, pubkey: PUBKEY_B, created_at: 1, tags: [], content: "hi" }),
    failure("rumour-malformed"),
  )
  assertEquals(
    parseRumour({ kind: NaN, pubkey: PUBKEY_B, created_at: 1, tags: [], content: "hi" }),
    failure("rumour-malformed"),
  )
})

Deno.test("parseRumour - returns a Rumour for well-formed input", () => {
  const parsed = parseRumour(buildRumour({
    kind: 14,
    pubkey: PUBKEY_B,
    created_at: 1700000000,
    tags: [["p", PUBKEY_A]],
    content: "hello",
  }))
  if (!parsed.success) throw new Error(parsed.error)
  assertEquals([parsed.value.kind, parsed.value.pubkey, parsed.value.content], [14, PUBKEY_B, "hello"])
})

Deno.test({
  name: "buildDmGiftWraps returns the signer's own SignerFailure when its nip44Encrypt fails",
  fn: async () => {
    const signer = createStubSigner({
      pubkey: PUBKEY_A,
      nip44Encrypt: () => failure({ type: "encrypt-failed", message: "underlying signer refused" }),
    })
    const result = await buildDmGiftWraps({
      signer,
      createEphemeralSigner: () => signer,
      ...FIXED_STAMP,
      rumour: buildRumour({
        kind: 14,
        pubkey: PUBKEY_A,
        created_at: 1700000000,
        tags: [["p", PUBKEY_B]],
        content: "hi",
      }),
    })
    assertEquals(result.success, false)
    if (!result.success) assertEquals(result.error.type, "encrypt-failed")
  },
})

Deno.test("buildDmGiftWraps returns the rejection when the signer declines to sign the seal", async () => {
  const declined = { type: "rejected" as const, message: "user rejected" }
  const signer = createStubSigner({
    pubkey: PUBKEY_A,
    nip44Encrypt: (_pubkey, plaintext) => ok(`enc:${plaintext}`),
    signEvent: () => failure(declined),
  })
  const result = await buildDmGiftWraps({
    signer,
    createEphemeralSigner: stubEphemeralSigner,
    ...FIXED_STAMP,
    rumour: buildRumour({ kind: 14, pubkey: PUBKEY_A, created_at: 1700000000, tags: [["p", PUBKEY_B]], content: "hi" }),
  })
  assertEquals(result, failure(declined))
})

Deno.test("buildDmGiftWraps - returns pubkey-mismatch when the rumour's author is not the signer's key (NIP-17: the seal and rumour pubkeys must match)", async () => {
  const result = await buildDmGiftWraps({
    signer: recipient,
    createEphemeralSigner: ephemeralSigner,
    rumour: buildRumour(rumourFields({ pubkey: SENDER })),
    ...FIXED_STAMP,
  })
  assertEquals(result.success ? null : result.error.type, "pubkey-mismatch")
})

Deno.test("buildDmGiftWraps - encrypts nothing when the rumour's author is not the signer's key", async () => {
  let encrypted = 0
  const signer = createStubSigner({
    pubkey: PUBKEY_B,
    nip44Encrypt: (_pubkey, plaintext) => {
      encrypted += 1
      return ok(`enc:${plaintext}`)
    },
  })
  await buildDmGiftWraps({
    signer,
    createEphemeralSigner: stubEphemeralSigner,
    ...FIXED_STAMP,
    rumour: buildRumour({ kind: 14, pubkey: PUBKEY_A, created_at: 1700000000, tags: [["p", PUBKEY_B]], content: "hi" }),
  })
  assertEquals(encrypted, 0)
})

Deno.test("buildDmGiftWraps - returns the signer's failure when it cannot give its key", async () => {
  const noSigner = { type: "no-signer" as const, message: "no extension" }
  const signer: Signer = {
    ...createStubSigner({ pubkey: PUBKEY_A }),
    getPublicKey: () => Promise.resolve(failure(noSigner)),
  }
  const result = await buildDmGiftWraps({
    signer,
    createEphemeralSigner: stubEphemeralSigner,
    ...FIXED_STAMP,
    rumour: buildRumour({ kind: 14, pubkey: PUBKEY_A, created_at: 1700000000, tags: [["p", PUBKEY_B]], content: "hi" }),
  })
  assertEquals(result, failure(noSigner))
})

const RUMOUR_FIELDS: EventToSign = {
  kind: 14,
  pubkey: PUBKEY_B,
  created_at: 1700000000,
  tags: [["p", PUBKEY_A]],
  content: "hello",
}

Deno.test("buildRumour - attaches the computed NIP-01 id", () => {
  const rumour = buildRumour(RUMOUR_FIELDS)
  assertEquals(rumour.id, computeEventId(RUMOUR_FIELDS))
  assertEquals(rumour.content, "hello")
})

Deno.test("buildRumour - drops fields outside the rumour shape", () => {
  const signed = buildEventFixture({ kind: 14, content: "hello" })
  const rumour = buildRumour(signed)
  assertEquals("sig" in rumour, false)
  assertEquals(rumour.id, computeEventId(signed))
})

Deno.test("parseRumour - keeps an id that matches the computed id", () => {
  const id = computeEventId(RUMOUR_FIELDS)
  assertEquals(parseRumour({ ...RUMOUR_FIELDS, id }), ok({ ...RUMOUR_FIELDS, id }))
})

Deno.test("parseRumour - returns rumour-malformed when the payload has no id (NIP-17: Fields id and created_at are required)", () => {
  assertEquals(parseRumour(RUMOUR_FIELDS), failure("rumour-malformed"))
})

Deno.test("parseRumour - returns rumour-id-mismatch for an id that is not an event id at all", () => {
  const errors = [123, "ABC", null].map((id) => {
    const parsed = parseRumour({ ...RUMOUR_FIELDS, id })
    return parsed.success ? null : parsed.error
  })
  assertEquals(errors, ["rumour-id-mismatch", "rumour-id-mismatch", "rumour-id-mismatch"])
})

Deno.test("parseRumour - returns rumour-id-mismatch when the id does not match the computed id", () => {
  assertEquals(parseRumour({ ...RUMOUR_FIELDS, id: "0".repeat(64) }), failure("rumour-id-mismatch"))
})

Deno.test("buildDmGiftWraps then unwrapGiftWrap preserves the rumour id", async () => {
  const alice = sender
  const bob = recipient
  const bobKey = await bob.getPublicKey()
  const aliceKey = await alice.getPublicKey()
  if (!bobKey.success || !aliceKey.success) throw new Error("a local signer always has its key")
  const bobPubkey = bobKey.value
  const rumour = buildRumour({
    kind: 14,
    pubkey: aliceKey.value,
    created_at: 1700000000,
    tags: [["p", bobPubkey]],
    content: "round trip",
  })
  const wraps = await buildDmGiftWraps({
    signer: alice,
    createEphemeralSigner: ephemeralSigner,
    rumour,
    ...FIXED_STAMP,
  })
  if (!wraps.success) throw wraps.error
  const forBob = wraps.value.find((wrap) => wrap.targetPubkey === bobPubkey)
  if (!forBob) throw new Error("expected a wrap for bob")
  const unwrapped = await unwrapGiftWrap(bob, forBob.event)
  if (!unwrapped.success) throw unwrapped.error
  assertEquals(unwrapped.value.rumour, rumour)
})

Deno.test("buildDmGiftWraps - stamps the gift wraps from the injected clock and RNG", async () => {
  const result = await buildDmGiftWraps({
    signer: stubSigner(() => Promise.resolve("unused")),
    createEphemeralSigner: stubEphemeralSigner,
    rumour: buildRumour({ kind: 14, pubkey: PUBKEY_A, created_at: 1700000000, tags: [["p", PUBKEY_B]], content: "hi" }),
    clock: () => 1800000000,
    randomUint32: () => 0,
  })
  assertEquals(result.success && result.value.map((wrap) => wrap.event.created_at), [1800000000, 1800000000])
})

Deno.test("parseRumour - returns rumour-malformed for non-string content rather than coercing it (NIP-59 rumour is an unsigned NIP-01 event)", () => {
  assertEquals(
    parseRumour({ kind: 14, pubkey: PUBKEY_B, created_at: 1, tags: [], content: 42 }),
    failure("rumour-malformed"),
  )
  assertEquals(
    parseRumour({ kind: 14, pubkey: PUBKEY_B, created_at: 1, tags: [], content: { text: "hi" } }),
    failure("rumour-malformed"),
  )
})
