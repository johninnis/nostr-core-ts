import { assertEquals } from "@std/assert"
import { unwrapGiftWrap } from "../../src/application/service/dm-crypto.ts"
import { createJsonCipher } from "../../src/application/service/json-crypto.ts"
import { buildRumour } from "../../src/domain/service/rumour.ts"
import type { Signer } from "../../src/domain/service/signer.ts"
import type { NostrEvent, Tag, UnsignedEvent } from "../../src/domain/value-object/nostr-event.ts"
import type { JsonSerialisable } from "../../src/domain/value-object/json-serialisable.ts"
import type { PublicKey } from "../../src/domain/value-object/public-key.ts"
import type { Result } from "../../src/domain/value-object/result.ts"
import { createLocalSigner } from "../../src/infrastructure/crypto/local-signer.ts"
import { secretKeyOf } from "../support/keys.ts"

const recipient = createLocalSigner(secretKeyOf(0x11))
const sender = createLocalSigner(secretKeyOf(0x22))
const ephemeralSigner = createLocalSigner(secretKeyOf(0x33))

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

const RUMOUR = buildRumour({
  kind: 14,
  pubkey: SENDER,
  created_at: 1700000000,
  tags: [["p", RECIPIENT]],
  content: "hi",
})

const sealWithTags = async (tags: ReadonlyArray<Tag>): Promise<NostrEvent> =>
  signed(sender, { kind: 13, created_at: 1700000000, tags, content: await encryptedTo(sender, RUMOUR) })

const wrapOf = async (seal: NostrEvent): Promise<NostrEvent> =>
  signed(ephemeralSigner, {
    kind: 1059,
    created_at: 1700000000,
    tags: [["p", RECIPIENT]],
    content: await encryptedTo(ephemeralSigner, seal),
  })

const errorOf = <T, E>(result: Result<T, E>): E | null => result.success ? null : result.error

Deno.test("unwrapGiftWrap - opens a seal whose only tag is an expiration (NIP-17: SHOULD be included on the kind:13 seal)", async () => {
  const seal = await sealWithTags([["expiration", "1800000000"]])
  const result = await unwrapGiftWrap(recipient, await wrapOf(seal))
  assertEquals(errorOf(result), null)
})

Deno.test("unwrapGiftWrap - opens a seal whose tags are all expirations", async () => {
  const seal = await sealWithTags([["expiration", "1800000000"], ["expiration", "1800000001"]])
  const result = await unwrapGiftWrap(recipient, await wrapOf(seal))
  assertEquals(errorOf(result), null)
})

Deno.test("unwrapGiftWrap - reports seal-malformed for a seal with an expiration beside another tag", async () => {
  const seal = await sealWithTags([["expiration", "1800000000"], ["p", RECIPIENT]])
  const result = await unwrapGiftWrap(recipient, await wrapOf(seal))
  assertEquals(errorOf(result), "seal-malformed")
})

Deno.test("unwrapGiftWrap - reports seal-malformed for a seal whose expiration is not a decimal timestamp", async () => {
  const seal = await sealWithTags([["expiration", "soon"]])
  const result = await unwrapGiftWrap(recipient, await wrapOf(seal))
  assertEquals(errorOf(result), "seal-malformed")
})

Deno.test("unwrapGiftWrap - reports seal-malformed for a seal whose expiration has a leading zero", async () => {
  const seal = await sealWithTags([["expiration", "01800000000"]])
  const result = await unwrapGiftWrap(recipient, await wrapOf(seal))
  assertEquals(errorOf(result), "seal-malformed")
})

Deno.test("unwrapGiftWrap - reports seal-malformed for a seal whose expiration tag has no value", async () => {
  const seal = await sealWithTags([["expiration"]])
  const result = await unwrapGiftWrap(recipient, await wrapOf(seal))
  assertEquals(errorOf(result), "seal-malformed")
})
