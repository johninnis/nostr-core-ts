import { assertEquals } from "@std/assert"
import { buildDmGiftWraps } from "../../src/application/service/dm-crypto.ts"
import { createJsonCipher } from "../../src/application/service/json-crypto.ts"
import { parseNostrEvent } from "../../src/domain/service/event-utils.ts"
import { isRecord } from "../../src/domain/service/guards.ts"
import { buildRumour } from "../../src/domain/service/rumour.ts"
import type { Signer } from "../../src/domain/service/signer.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import type { PublicKey } from "../../src/domain/value-object/public-key.ts"
import { createLocalSigner } from "../../src/infrastructure/crypto/local-signer.ts"
import { ok } from "../../src/domain/value-object/result.ts"
import { secretKeyOf } from "../support/keys.ts"

const recipient = createLocalSigner(secretKeyOf(0x11))
const sender = createLocalSigner(secretKeyOf(0x22))
const ephemeralSigner = (): Signer => createLocalSigner(secretKeyOf(0x33))

const keyOf = async (signer: Signer): Promise<PublicKey> => {
  const key = await signer.getPublicKey()
  if (!key.success) throw new Error("a local signer always has its key")
  return key.value
}

const RECIPIENT = await keyOf(recipient)
const SENDER = await keyOf(sender)

const RUMOUR = buildRumour({
  kind: 14,
  pubkey: SENDER,
  created_at: 1700000000,
  tags: [["p", RECIPIENT]],
  content: "hi",
})

const sealedRumourFor = async (wraps: ReadonlyArray<{ event: NostrEvent }>): Promise<Record<string, unknown>> => {
  const wrap = wraps.find((candidate) => candidate.event.tags[0]?.[1] === RECIPIENT)
  if (!wrap) throw new Error("expected a wrap for the recipient")
  const decryptedSeal = await createJsonCipher(recipient).decrypt(wrap.event.pubkey, wrap.event.content)
  const seal = decryptedSeal.success ? parseNostrEvent(decryptedSeal.value) : null
  if (!seal) throw new Error("expected a seal")
  const rumour = await createJsonCipher(recipient).decrypt(seal.pubkey, seal.content)
  if (!rumour.success || !isRecord(rumour.value)) throw new Error("expected a rumour object")
  return rumour.value
}

Deno.test("buildDmGiftWraps - seals a signed event without its sig (NIP-59: the inner event MUST always be unsigned)", async () => {
  const signed = await sender.signEvent(RUMOUR)
  if (!signed.success) throw new Error(signed.error.message)
  const wraps = await buildDmGiftWraps({ signer: sender, createEphemeralSigner: ephemeralSigner, rumour: signed.value })
  if (!wraps.success) throw new Error(wraps.error.type)
  assertEquals("sig" in await sealedRumourFor(wraps.value), false)
})

Deno.test("buildDmGiftWraps - seals exactly the rumour fields, dropping any other field", async () => {
  const rumour = { ...RUMOUR, secretNote: "leaked" }
  const wraps = await buildDmGiftWraps({ signer: sender, createEphemeralSigner: ephemeralSigner, rumour })
  if (!wraps.success) throw new Error(wraps.error.type)
  assertEquals(Object.keys(await sealedRumourFor(wraps.value)).toSorted(), [
    "content",
    "created_at",
    "id",
    "kind",
    "pubkey",
    "tags",
  ])
})

Deno.test("buildDmGiftWraps - wraps only the seal's seven NIP-01 fields, whatever else its signer returns", async () => {
  const addingSigner: Signer = {
    ...sender,
    signEvent: async (template) => {
      const signed = await sender.signEvent(template)
      return signed.success ? ok({ ...signed.value, relays: ["wss://relay.example"] }) : signed
    },
  }
  const wraps = await buildDmGiftWraps({ signer: addingSigner, createEphemeralSigner: ephemeralSigner, rumour: RUMOUR })
  if (!wraps.success) throw new Error(wraps.error.type)
  const wrap = wraps.value.find((candidate) => candidate.targetPubkey === RECIPIENT)
  if (!wrap) throw new Error("expected a wrap for the recipient")
  const seal = await recipient.nip44Decrypt(wrap.event.pubkey, wrap.event.content)
  if (!seal.success) throw new Error(seal.error.message)
  assertEquals(Object.keys(JSON.parse(seal.value)), ["id", "pubkey", "created_at", "kind", "tags", "content", "sig"])
})
