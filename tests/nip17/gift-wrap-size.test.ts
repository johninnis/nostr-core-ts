import { assertEquals, assertStringIncludes } from "@std/assert"
import { createStubSigner } from "../../testing.ts"
import { buildDmGiftWraps, GIFT_WRAP_MAX_RUMOUR_SIZE, unwrapGiftWrap } from "../../src/application/service/dm-crypto.ts"
import { buildRumour } from "../../src/domain/service/rumour.ts"
import { NIP44_DEFAULT_MAX_PLAINTEXT_SIZE } from "../../src/domain/service/nip44-ceiling.ts"
import { NIP44_DEFAULT_MAX_PLAINTEXT_SIZE as PUBLIC_NIP44_DEFAULT_MAX_PLAINTEXT_SIZE } from "../../mod.ts"
import type { EventToSign } from "../../src/domain/service/event-id.ts"
import { createLocalSigner } from "../../src/infrastructure/crypto/local-signer.ts"
import type { Signer } from "../../src/domain/service/signer.ts"
import type { PublicKey } from "../../src/domain/value-object/public-key.ts"
import { ok } from "../../src/domain/value-object/result.ts"
import { secretKeyOf } from "../support/keys.ts"

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

const rumourFields = (overrides: Partial<EventToSign> = {}): EventToSign => ({
  kind: 14,
  pubkey: SENDER,
  created_at: 1700000000,
  tags: [["p", RECIPIENT]],
  content: "hello",
  ...overrides,
})

const rumourOfSize = (bytes: number): ReturnType<typeof buildRumour> => {
  const overhead = JSON.stringify(buildRumour(rumourFields({ content: "" }))).length
  return buildRumour(rumourFields({ content: "x".repeat(bytes - overhead) }))
}

Deno.test("GIFT_WRAP_MAX_RUMOUR_SIZE - is the largest padded length whose seal fits NIP-44's default ceiling", () => {
  assertEquals(GIFT_WRAP_MAX_RUMOUR_SIZE, 163840)
})

Deno.test("buildDmGiftWraps - a rumour serialising to exactly the gift wrap maximum is wrapped and unwrapped", async () => {
  const rumour = rumourOfSize(GIFT_WRAP_MAX_RUMOUR_SIZE)
  assertEquals(JSON.stringify(rumour).length, GIFT_WRAP_MAX_RUMOUR_SIZE)
  const wraps = await buildDmGiftWraps({
    signer: sender,
    createEphemeralSigner: ephemeralSigner,
    rumour,
    ...FIXED_STAMP,
  })
  if (!wraps.success) throw new Error(JSON.stringify(wraps.error))
  const toRecipient = wraps.value.find((wrap) => wrap.targetPubkey === RECIPIENT)
  if (!toRecipient) throw new Error("no wrap to the recipient")
  const opened = await unwrapGiftWrap(recipient, toRecipient.event)
  assertEquals(opened.success && opened.value.rumour.content.length, rumour.content.length)
})

Deno.test("buildDmGiftWraps - a rumour one byte over the gift wrap maximum is encrypt-failed naming the limit", async () => {
  const result = await buildDmGiftWraps({
    signer: sender,
    createEphemeralSigner: ephemeralSigner,
    rumour: rumourOfSize(GIFT_WRAP_MAX_RUMOUR_SIZE + 1),
    ...FIXED_STAMP,
  })
  const refusal = result.success ? null : result.error
  assertEquals(refusal?.type, "encrypt-failed")
  assertEquals(
    refusal?.message,
    "Rumour serialises to 163841 bytes; a gift wrap holds at most 163840, the largest rumour whose seal fits the NIP-44 default plaintext ceiling of 262144 bytes",
  )
})

Deno.test("buildDmGiftWraps - the refusal names the ceiling the NIP-44 codec applies by default", async () => {
  const result = await buildDmGiftWraps({
    signer: sender,
    createEphemeralSigner: ephemeralSigner,
    rumour: rumourOfSize(GIFT_WRAP_MAX_RUMOUR_SIZE + 1),
    ...FIXED_STAMP,
  })
  const refusal = result.success ? null : result.error
  assertStringIncludes(refusal?.message ?? "", `plaintext ceiling of ${PUBLIC_NIP44_DEFAULT_MAX_PLAINTEXT_SIZE} bytes`)
})

Deno.test("NIP44_DEFAULT_MAX_PLAINTEXT_SIZE - the public export is the domain's one definition", () => {
  assertEquals(PUBLIC_NIP44_DEFAULT_MAX_PLAINTEXT_SIZE, NIP44_DEFAULT_MAX_PLAINTEXT_SIZE)
})

Deno.test("buildDmGiftWraps - a rumour over the gift wrap maximum in UTF-8 bytes is refused before anything is encrypted", async () => {
  let encrypted = 0
  const signer = createStubSigner({
    pubkey: SENDER,
    nip44Encrypt: (_pubkey, plaintext) => {
      encrypted += 1
      return ok(`enc:${plaintext}`)
    },
  })
  const overhead = JSON.stringify(buildRumour(rumourFields({ content: "" }))).length
  const rumour = buildRumour(
    rumourFields({ content: "\u20ac".repeat(Math.floor((GIFT_WRAP_MAX_RUMOUR_SIZE - overhead) / 3) + 1) }),
  )
  const result = await buildDmGiftWraps({ signer, createEphemeralSigner: () => signer, rumour, ...FIXED_STAMP })
  assertEquals([result.success, encrypted], [false, 0])
})
