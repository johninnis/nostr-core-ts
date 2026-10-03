import type { GiftWrapUnwrapFailure } from "../failure/gift-wrap-unwrap-failure.ts"
import { parseNostrEvent } from "../../domain/service/event-utils.ts"
import { serialiseEvent } from "../../domain/service/event-json.ts"
import { isRecord } from "../../domain/service/guards.ts"
import { verifyEventSignature } from "../../domain/service/verify.ts"
import type { Rumour } from "../../domain/value-object/nostr-event.ts"
import { buildRumour, chatRoomMembers, parseRumour } from "../../domain/service/rumour.ts"
import { checkPubkeyMatches } from "../../domain/service/pubkey-match.ts"
import { createJsonCipher } from "./json-crypto.ts"
import type { PeerCipher } from "../../domain/service/peer-cipher.ts"
import type { Signer } from "../../domain/service/signer.ts"
import { KIND_EPHEMERAL_GIFT_WRAP, KIND_GIFT_WRAP, KIND_SEAL } from "../../domain/value-object/kinds.ts"
import type { NostrEvent, Tag } from "../../domain/value-object/nostr-event.ts"
import { parseDecimalInteger } from "../../domain/service/decimal.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import type { Result } from "../../domain/value-object/result.ts"
import { failure, isFailure, isOk, ok } from "../../domain/value-object/result.ts"
import type { RandomUint32Fn } from "../../domain/service/random.ts"
import { randomUint32 as defaultRandomUint32 } from "../../domain/service/random.ts"
import type { Clock } from "../../domain/service/timestamp.ts"
import { now } from "../../domain/service/timestamp.ts"
import { exceedsUtf8Bytes, textEncoder } from "../../domain/service/text-codec.ts"
import { NIP44_DEFAULT_MAX_PLAINTEXT_SIZE } from "../../domain/service/nip44-ceiling.ts"
import type { SignerFailure } from "../../domain/failure/signer-failure.ts"

const TWO_DAYS_SECONDS = 2 * 24 * 60 * 60
const UINT32_RANGE = 0x1_0000_0000

// Deliberate: a seal holds the rumour's NIP-44 payload in a second plaintext under one ceiling — see ADR-0035
/**
 * The largest serialised rumour, in UTF-8 bytes, `buildDmGiftWraps` wraps: 163840. The seal's content is the rumour's
 * NIP-44 payload, about four thirds of its padded length, and the seal is encrypted again under the same 262144-byte
 * default ceiling (`NIP44_DEFAULT_MAX_PLAINTEXT_SIZE`). A rumour of 163840 bytes pads to 163840 and gives a payload of
 * 218548 characters, which a seal holds; the next padded length, 196608, gives 262240, more than the ceiling alone.
 */
export const GIFT_WRAP_MAX_RUMOUR_SIZE = 163840

const oversizedRumour = (rumourJson: string): SignerFailure => ({
  type: "encrypt-failed",
  message: `Rumour serialises to ${textEncoder.encode(rumourJson).length} bytes; a gift wrap holds at most ` +
    `${GIFT_WRAP_MAX_RUMOUR_SIZE}, the largest rumour whose seal fits the NIP-44 default plaintext ceiling of ` +
    `${NIP44_DEFAULT_MAX_PLAINTEXT_SIZE} bytes`,
})

/**
 * Successful output of `unwrapGiftWrap` — the recovered rumour and the seal-signing pubkey (the actual sender, which
 * `giftWrapEvent.pubkey` deliberately hides).
 */
interface UnwrapResult {
  readonly rumour: Rumour
  readonly senderPubkey: PublicKey
}

const isSigned = (value: unknown): boolean =>
  isRecord(value) && value.sig !== undefined && value.sig !== null && value.sig !== ""

// Deliberate: NIP-17 asks for the wrap's expiration on the seal as well, so a seal may carry only that — see ADR-0031
const isExpirationTag = ([name, value]: Tag): boolean =>
  name === "expiration" && value !== undefined && parseDecimalInteger(value) !== null

// Deliberate: any rumour kind; the signatures and the seal-to-rumour author check guard it — see ADR-0031
/**
 * Unwrap a NIP-59 kind-1059 gift wrap, or kind-21059 ephemeral gift wrap, into its rumour and the sender's pubkey,
 * decrypting with `cipher`. The gift wrap and the seal must carry valid signatures, the seal's only tags may be NIP-40
 * `expiration` tags each naming a decimal Unix timestamp (any other tag makes it `seal-malformed`), and the rumour must
 * be unsigned (NIP-59: "The inner event MUST always be unsigned") and authored by the seal's signer. The
 * rumour may be of any kind — a NIP-17 message (14), file message (15), reaction (7) or anything else wrapped — so
 * callers dispatch on `rumour.kind`. Each failure mode gets its own `GiftWrapUnwrapFailure` literal: a layer that
 * cannot be decrypted is `seal-decrypt-failed` or `rumour-decrypt-failed`, and one that decrypts to text that is not
 * JSON is `seal-malformed` or `rumour-malformed`.
 */
export const unwrapGiftWrap = async (
  cipher: PeerCipher,
  giftWrapEvent: NostrEvent,
): Promise<Result<UnwrapResult, GiftWrapUnwrapFailure>> => {
  if (giftWrapEvent.kind !== KIND_GIFT_WRAP && giftWrapEvent.kind !== KIND_EPHEMERAL_GIFT_WRAP) {
    return failure("not-gift-wrap")
  }
  if (!verifyEventSignature(giftWrapEvent)) return failure("wrap-signature-invalid")

  const sealResult = await createJsonCipher(cipher).decrypt(giftWrapEvent.pubkey, giftWrapEvent.content)
  if (!sealResult.success) {
    return failure(sealResult.error.type === "json-parse-failed" ? "seal-malformed" : "seal-decrypt-failed")
  }
  const seal = parseNostrEvent(sealResult.value)
  if (!seal || !seal.tags.every(isExpirationTag)) return failure("seal-malformed")
  if (seal.kind !== KIND_SEAL) return failure("seal-wrong-kind")
  if (!verifyEventSignature(seal)) return failure("seal-signature-invalid")

  const rumourResult = await createJsonCipher(cipher).decrypt(seal.pubkey, seal.content)
  if (!rumourResult.success) {
    return failure(rumourResult.error.type === "json-parse-failed" ? "rumour-malformed" : "rumour-decrypt-failed")
  }
  if (isSigned(rumourResult.value)) return failure("rumour-signed")
  const rumourRead = parseRumour(rumourResult.value)
  if (!rumourRead.success) return rumourRead
  if (rumourRead.value.pubkey !== seal.pubkey) return failure("rumour-pubkey-mismatch")

  return ok({ rumour: rumourRead.value, senderPubkey: seal.pubkey })
}

/**
 * One entry of `buildDmGiftWraps`'s output — a signed kind-1059 gift wrap and the chat room member it's addressed to (a
 * receiver or the sender, who gets a wrap too).
 */
interface GiftWrapTarget {
  readonly event: NostrEvent
  readonly targetPubkey: PublicKey
}

/**
 * Input for `buildDmGiftWraps` — the sender's signer, a source of throwaway signers for the per-wrap keys NIP-59
 * requires, and the rumour to wrap, which names its chat room (its `pubkey` is the sender, its `p` tags the receivers).
 */
export interface BuildDmGiftWrapsInput {
  readonly signer: Signer
  /**
   * Returns a fresh signer over a new random key for each wrap, e.g. `() => createLocalSigner(generateSecretKey())`.
   */
  readonly createEphemeralSigner: () => Signer
  /**
   * The NIP-59 rumour to wrap (build it with `buildRumour`) — a kind-14 message, a kind-7 reaction, or any other
   * private payload. Only its rumour fields are sealed, its `id` computed anew from them by `buildRumour`, so a signed
   * event passed here is sealed without its `sig` (NIP-59: "The inner event MUST always be unsigned") and no other
   * field it carries is encrypted. Every member of its chat room ({@link chatRoomMembers}: its `pubkey` and its `p`
   * tags) receives a wrap.
   */
  readonly rumour: Rumour
  /** Clock used for the (jittered) seal/gift-wrap timestamps. Defaults to {@link now}. */
  readonly clock?: Clock
  /**
   * RNG used to compute the seal/gift-wrap timestamp jitter (NIP-59). Defaults to the web-crypto-backed `randomUint32`.
   */
  readonly randomUint32?: RandomUint32Fn
}

const jitteredPastTimestamp = (input: BuildDmGiftWrapsInput): number => {
  const random = input.randomUint32 ?? defaultRandomUint32
  return (input.clock ?? now)() - Math.floor(random() / UINT32_RANGE * TWO_DAYS_SECONDS)
}

const buildGiftWrapFor = async (
  input: BuildDmGiftWrapsInput,
  rumour: Rumour,
  targetPubkey: PublicKey,
): Promise<Result<GiftWrapTarget, SignerFailure>> => {
  const sealedRumour = await createJsonCipher(input.signer).encrypt(targetPubkey, rumour)
  if (!sealedRumour.success) return sealedRumour

  const signedSeal = await input.signer.signEvent({
    kind: KIND_SEAL,
    created_at: jitteredPastTimestamp(input),
    tags: [],
    content: sealedRumour.value,
  })
  if (!signedSeal.success) return signedSeal
  const ephemeralSigner = input.createEphemeralSigner()

  const wrappedSeal = await ephemeralSigner.nip44Encrypt(targetPubkey, serialiseEvent(signedSeal.value))
  if (!wrappedSeal.success) return wrappedSeal

  const giftWrap = await ephemeralSigner.signEvent({
    kind: KIND_GIFT_WRAP,
    created_at: jitteredPastTimestamp(input),
    tags: [["p", targetPubkey]],
    content: wrappedSeal.value,
  })
  if (!giftWrap.success) return giftWrap

  return ok({ event: giftWrap.value, targetPubkey })
}

// Deliberate: no receivers input — the rumour's own room is the one source of who is wrapped to — see ADR-0030
/**
 * Build the NIP-17 gift wraps for any rumour: one to each member of the chat room the rumour names, its author and
 * every `p`-tagged pubkey (NIP-17: "The set of `pubkey` + `p` tags defines a chat room" and messages are "gift-wrapped
 * (`kind:1059`) to each receiver and the sender individually"), each member once, in {@link chatRoomMembers} order. The
 * room is read from the rumour, so what it addresses is what is wrapped. The signer must hold the rumour's author key,
 * since the seal it signs must name the rumour's author (NIP-17: "Clients MUST verify if pubkey of the `kind:13` is the
 * same pubkey as that of the `unsignedMessageRumor`"); a signer holding another key is `pubkey-mismatch`, and nothing
 * is encrypted. Every failure is a `SignerFailure`: when the signer cannot give its key, or refuses to encrypt or sign
 * a seal or wrap, it is the signer's own, so a decline keeps its `rejected` type. A rumour serialising to more than
 * {@link GIFT_WRAP_MAX_RUMOUR_SIZE} UTF-8 bytes is `encrypt-failed` whose message names that limit, and nothing is
 * encrypted: its seal would exceed the NIP-44 default ceiling, whatever ceiling the signer applies. The wraps are built
 * concurrently.
 */
export const buildDmGiftWraps = async (
  input: BuildDmGiftWrapsInput,
): Promise<Result<ReadonlyArray<GiftWrapTarget>, SignerFailure>> => {
  const signerKey = await input.signer.getPublicKey()
  if (!signerKey.success) return signerKey
  const mismatch = checkPubkeyMatches(input.rumour.pubkey, signerKey.value)
  if (mismatch) return failure(mismatch)
  const rumour = buildRumour(input.rumour)
  const rumourJson = JSON.stringify(rumour)
  if (exceedsUtf8Bytes(rumourJson, GIFT_WRAP_MAX_RUMOUR_SIZE)) {
    return failure(oversizedRumour(rumourJson))
  }
  const wraps = await Promise.all(chatRoomMembers(rumour).map((target) => buildGiftWrapFor(input, rumour, target)))
  return wraps.find(isFailure) ?? ok(wraps.filter(isOk).map((wrap) => wrap.value))
}

export type { GiftWrapTarget, UnwrapResult }
