import { EncryptionError } from "../../domain/exception/encryption-error.ts"
import { GiftWrapUnwrapError } from "../exception/gift-wrap-unwrap-error.ts"
import type { EventToSign } from "../../domain/service/event-id.ts"
import { decryptJson, encryptJson } from "../../domain/service/json-crypto.ts"
import type { Signer } from "../../domain/service/signer.ts"
import { isRecord } from "../../domain/value-object/guards.ts"
import { KIND_GIFT_WRAP, KIND_PRIVATE_MESSAGE, KIND_SEAL } from "../../domain/value-object/kinds.ts"
import type { NostrEvent, UnsignedEvent } from "../../domain/value-object/nostr-event.ts"
import { isValidTag } from "../../domain/value-object/nostr-event.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import { isValidPublicKey } from "../../domain/value-object/public-key.ts"
import type { Result } from "../../domain/value-object/result.ts"
import { failure, ok } from "../../domain/value-object/result.ts"
import type { RandomUint32Fn } from "../../domain/service/random.ts"
import { randomUint32 as defaultRandomUint32 } from "../../domain/service/random.ts"
import type { Clock } from "../../domain/value-object/timestamp.ts"
import { now } from "../../domain/value-object/timestamp.ts"

const TWO_DAYS_SECONDS = 2 * 24 * 60 * 60
const UINT32_RANGE = 0x1_0000_0000

const randomSecondsInWindow = (randomUint32: RandomUint32Fn, windowSeconds: number): number =>
  Math.floor(randomUint32() / UINT32_RANGE * windowSeconds)

const jitteredPastTimestamp = (clock: Clock, randomUint32: RandomUint32Fn): number =>
  clock() - randomSecondsInWindow(randomUint32, TWO_DAYS_SECONDS)

// A NIP-17 rumor is an unsigned event with a known author pubkey — structurally identical to an
// `EventToSign`. Alias rather than duplicate the shape.
type Rumor = EventToSign

interface UnwrapResult {
  readonly rumor: Rumor
  readonly senderPubkey: PublicKey
}

interface Seal {
  readonly kind: number
  readonly pubkey: PublicKey
  readonly content: string
}

const parseSeal = (value: unknown): Seal | null => {
  if (!isRecord(value)) return null
  if (typeof value.kind !== "number" || !Number.isInteger(value.kind) || value.kind < 0) return null
  if (!isValidPublicKey(value.pubkey)) return null
  if (typeof value.content !== "string") return null
  return { kind: value.kind, pubkey: value.pubkey, content: value.content }
}

/** Validate `value` as a NIP-17 rumor (an unsigned event with a known author pubkey); returns `null` if any field is invalid. */
export const parseRumor = (value: unknown): Rumor | null => {
  const seal = parseSeal(value)
  if (!seal || !isRecord(value)) return null
  if (typeof value.created_at !== "number" || !Number.isInteger(value.created_at) || value.created_at < 0) return null
  if (!Array.isArray(value.tags) || !value.tags.every(isValidTag)) return null
  return { ...seal, created_at: value.created_at, tags: value.tags }
}

/**
 * Unwrap a NIP-17 kind-1059 gift wrap into its rumor and the sender's pubkey. Each failure mode
 * gets its own tag so UI callers can surface diagnostics; bulk-feed callers that just want the
 * hot null path do `result.success ? result.value : null`.
 */
export const unwrapGiftWrap = async (
  signer: Signer,
  giftWrapEvent: NostrEvent,
): Promise<Result<UnwrapResult, GiftWrapUnwrapError>> => {
  if (giftWrapEvent.kind !== KIND_GIFT_WRAP) {
    return failure(
      new GiftWrapUnwrapError("not-gift-wrap", `Event kind ${giftWrapEvent.kind} is not a gift wrap (1059)`),
    )
  }

  const sealResult = await decryptJson(signer, giftWrapEvent.pubkey, giftWrapEvent.content)
  if (!sealResult.success) {
    return failure(
      new GiftWrapUnwrapError("seal-decrypt-failed", `Seal decrypt failed: ${sealResult.error.tag}`, sealResult.error),
    )
  }
  const seal = parseSeal(sealResult.value)
  if (!seal) {
    return failure(new GiftWrapUnwrapError("seal-malformed", "Seal payload is not a valid event shape"))
  }
  if (seal.kind !== KIND_SEAL) {
    return failure(
      new GiftWrapUnwrapError("seal-wrong-kind", `Seal kind ${seal.kind} is not the expected seal kind (13)`),
    )
  }

  const rumorResult = await decryptJson(signer, seal.pubkey, seal.content)
  if (!rumorResult.success) {
    return failure(
      new GiftWrapUnwrapError(
        "rumor-decrypt-failed",
        `Rumor decrypt failed: ${rumorResult.error.tag}`,
        rumorResult.error,
      ),
    )
  }
  const rumor = parseRumor(rumorResult.value)
  if (!rumor) {
    return failure(new GiftWrapUnwrapError("rumor-malformed", "Rumor payload is not a valid rumor shape"))
  }
  if (rumor.kind !== KIND_PRIVATE_MESSAGE) {
    return failure(
      new GiftWrapUnwrapError(
        "rumor-wrong-kind",
        `Rumor kind ${rumor.kind} is not the expected private-message kind (14)`,
      ),
    )
  }
  if (rumor.pubkey !== seal.pubkey) {
    return failure(
      new GiftWrapUnwrapError("rumor-pubkey-mismatch", "Rumor pubkey does not match the seal's signing pubkey"),
    )
  }

  return ok({ rumor, senderPubkey: seal.pubkey })
}

interface GiftWrapTarget {
  readonly event: NostrEvent
  readonly targetPubkey: PublicKey
}

interface CreateGiftWrapInput {
  readonly signer: Signer
  readonly ephemeralSignerFactory: (secretKey: Uint8Array) => Signer
  readonly generateSecretKey: () => Uint8Array
  readonly rumor: Rumor
  readonly targetPubkey: PublicKey
  readonly clock: Clock
  readonly randomUint32: RandomUint32Fn
}

const buildGiftWrapFor = async (
  input: CreateGiftWrapInput,
): Promise<Result<GiftWrapTarget, EncryptionError>> => {
  const { signer, ephemeralSignerFactory, generateSecretKey, rumor, targetPubkey, clock, randomUint32 } = input
  const sealedRumor = await encryptJson(signer, targetPubkey, rumor)
  if (!sealedRumor.success) return failure(new EncryptionError("buildDmGiftWraps", sealedRumor.error))

  const sealTemplate: UnsignedEvent = {
    kind: KIND_SEAL,
    created_at: jitteredPastTimestamp(clock, randomUint32),
    tags: [],
    content: sealedRumor.value,
  }

  const signedSeal = await signer.signEvent(sealTemplate)
  const ephemeralSigner = ephemeralSignerFactory(generateSecretKey())

  const wrappedSeal = await encryptJson(ephemeralSigner, targetPubkey, signedSeal)
  if (!wrappedSeal.success) return failure(new EncryptionError("buildDmGiftWraps", wrappedSeal.error))

  const giftWrap = await ephemeralSigner.signEvent({
    kind: KIND_GIFT_WRAP,
    created_at: jitteredPastTimestamp(clock, randomUint32),
    tags: [["p", targetPubkey]],
    content: wrappedSeal.value,
  })

  return ok({ event: giftWrap, targetPubkey })
}

export interface BuildDmGiftWrapsInput {
  readonly signer: Signer
  readonly ephemeralSignerFactory: (secretKey: Uint8Array) => Signer
  readonly generateSecretKey: () => Uint8Array
  readonly content: string
  readonly recipientPubkey: PublicKey
  readonly myPubkey: PublicKey
  /** Clock used for the rumor's `created_at` and the (jittered) seal/gift-wrap timestamps. Defaults to {@link now}. */
  readonly clock?: Clock
  /** RNG used to compute the seal/gift-wrap timestamp jitter (NIP-17 §5). Defaults to the web-crypto-backed `randomUint32`. */
  readonly randomUint32?: RandomUint32Fn
}

/**
 * Build the pair of NIP-17 gift wraps (one for the recipient, one for the sender) for a kind-14 DM.
 *
 * **Error contract — two paths, matching the Signer split.** Encryption failures (the user-facing
 * signer's `nip44Encrypt` or the ephemeral signer's encrypt of the seal) are returned as
 * `Failure(EncryptionError)`. Signing failures **throw** (`signer.signEvent` follows the Signer
 * contract: it throws `SigningError` / `SignerRejectedError` / `PubkeyMismatchError`). The two
 * cases are different things; we don't smear a signing rejection into an "encryption" failure tag.
 * Callers should `await` inside a try/catch if they need to distinguish "user denied signing" from
 * "encryption math broke".
 *
 * The two wraps are produced concurrently via `Promise.all`. The first rejection becomes the
 * thrown error; the second wrap's settlement is awaited by the runtime via the `Promise.all`
 * spec contract, so its rejection (if any) cannot escape as an unhandled rejection.
 */
export const buildDmGiftWraps = async (
  input: BuildDmGiftWrapsInput,
): Promise<Result<ReadonlyArray<GiftWrapTarget>, EncryptionError>> => {
  const { signer, ephemeralSignerFactory, generateSecretKey, content, recipientPubkey, myPubkey } = input
  const clock = input.clock ?? now
  const randomUint32 = input.randomUint32 ?? defaultRandomUint32
  const rumor: Rumor = {
    kind: KIND_PRIVATE_MESSAGE,
    pubkey: myPubkey,
    created_at: clock(),
    tags: [["p", recipientPubkey]],
    content,
  }

  const wrap = (targetPubkey: PublicKey): Promise<Result<GiftWrapTarget, EncryptionError>> =>
    buildGiftWrapFor({ signer, ephemeralSignerFactory, generateSecretKey, rumor, targetPubkey, clock, randomUint32 })

  const [recipient, sender] = await Promise.all([wrap(recipientPubkey), wrap(myPubkey)])
  if (!recipient.success) return recipient
  if (!sender.success) return sender
  return ok([recipient.value, sender.value])
}

export type { GiftWrapTarget, Rumor, UnwrapResult }
