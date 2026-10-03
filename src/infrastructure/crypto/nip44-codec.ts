import { InvalidArgumentError } from "../../domain/exception/invalid-argument-error.ts"
import { Nip44CryptoError } from "../../domain/exception/nip44-crypto-error.ts"
import { NIP44_DEFAULT_MAX_PLAINTEXT_SIZE } from "../../domain/service/nip44-ceiling.ts"
import { exceedsUtf8Bytes } from "../../domain/service/text-codec.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import { refusedAs } from "./codec-refusal.ts"
import { assertConversationKey, assertPeerPubkey, assertSecretKey } from "./key-arguments.ts"
import { v2 as nip44v2 } from "./nip44-v2.ts"

const refusal = (cause: Error): Nip44CryptoError => new Nip44CryptoError(cause.message, { cause })

/** Smallest plaintext length the NIP-44 v2 padding scheme accepts, in bytes. */
export const NIP44_MIN_PLAINTEXT_SIZE: number = nip44v2.utils.minPlaintextSize
/**
 * Largest plaintext length the NIP-44 v2 padding scheme accepts, in bytes: the most a caller may raise the ceiling to.
 */
export const NIP44_MAX_PLAINTEXT_SIZE: number = nip44v2.utils.maxPlaintextSize
export { NIP44_DEFAULT_MAX_PLAINTEXT_SIZE }

const EXTENDED_PREFIX_THRESHOLD = 65536
const SHORT_PREFIX_BYTES = 2
const EXTENDED_PREFIX_BYTES = 6
const VERSION_NONCE_AND_MAC_BYTES = 1 + 32 + 32

const assertMaxPlaintextSize = (maxPlaintextSize: number): void => {
  if (
    !Number.isSafeInteger(maxPlaintextSize) || maxPlaintextSize < NIP44_MIN_PLAINTEXT_SIZE ||
    maxPlaintextSize > NIP44_MAX_PLAINTEXT_SIZE
  ) {
    throw new InvalidArgumentError(
      `Maximum plaintext length must be between 1 and ${NIP44_MAX_PLAINTEXT_SIZE} bytes, got ${maxPlaintextSize}`,
    )
  }
}

const payloadLengthFor = (maxPlaintextSize: number): number => {
  const prefixBytes = maxPlaintextSize >= EXTENDED_PREFIX_THRESHOLD ? EXTENDED_PREFIX_BYTES : SHORT_PREFIX_BYTES
  const decodedBytes = VERSION_NONCE_AND_MAC_BYTES + prefixBytes + nip44v2.utils.calcPaddedLen(maxPlaintextSize)
  return 4 * Math.ceil(decodedBytes / 3)
}

/**
 * Derive the symmetric NIP-44 v2 conversation key from a secret key and a peer's public key. Throws `Nip44CryptoError`
 * when the peer key is refused, such as a key that is not a curve point, and `InvalidArgumentError` when `secretKey` is
 * not 32 bytes holding a secp256k1 scalar or `peerPubkey` is not 64 lowercase hex characters.
 */
export const getNip44ConversationKey = (secretKey: Uint8Array, peerPubkey: PublicKey): Uint8Array => {
  assertSecretKey(secretKey)
  assertPeerPubkey(peerPubkey)
  return refusedAs(() => nip44v2.utils.getConversationKey(secretKey, peerPubkey), refusal)
}

// Deliberate: encryption refuses a plaintext its own ceiling would refuse to decrypt — see shared ADR-0102
/**
 * NIP-44 v2 encrypt over a pre-derived conversation key, with a fresh random 32-byte nonce for every call. Throws
 * `Nip44CryptoError` for a plaintext holding a lone surrogate (it has no UTF-8 encoding, shared ADR-0100), or under 1
 * byte or over `maxPlaintextSize` UTF-8 bytes (default {@link NIP44_DEFAULT_MAX_PLAINTEXT_SIZE}), and
 * `InvalidArgumentError` when `conversationKey` is not 32 bytes or `maxPlaintextSize` is not an integer from 1 to
 * {@link NIP44_MAX_PLAINTEXT_SIZE}.
 */
export const nip44Encrypt = (
  conversationKey: Uint8Array,
  plaintext: string,
  maxPlaintextSize: number = NIP44_DEFAULT_MAX_PLAINTEXT_SIZE,
): string => {
  assertConversationKey(conversationKey)
  assertMaxPlaintextSize(maxPlaintextSize)
  if (!plaintext.isWellFormed()) throw new Nip44CryptoError("Plaintext must be UTF-8: it holds a lone surrogate")
  if (plaintext.length === 0 || exceedsUtf8Bytes(plaintext, maxPlaintextSize)) {
    throw new Nip44CryptoError(`Plaintext length must be between 1 and ${maxPlaintextSize} bytes`)
  }
  return refusedAs(() => nip44v2.encrypt(plaintext, conversationKey), refusal)
}

// Deliberate: an oversized payload is refused by its length alone, before any character is read — see ADR-0035
/**
 * NIP-44 v2 decrypt over a pre-derived conversation key. A payload longer than the one a plaintext of
 * `maxPlaintextSize` bytes produces (default {@link NIP44_DEFAULT_MAX_PLAINTEXT_SIZE}, a payload of 349620 characters)
 * is refused by its length alone, before any character of it is read, and a plaintext over `maxPlaintextSize` bytes
 * once it is decrypted. Throws `Nip44CryptoError` for those, a bad MAC, malformed payload, padding that is not zero
 * bytes, version mismatch, or a plaintext that is not valid UTF-8, and `InvalidArgumentError` when `conversationKey` is
 * not 32 bytes or `maxPlaintextSize` is not an integer from 1 to {@link NIP44_MAX_PLAINTEXT_SIZE}. The plaintext is
 * read exactly as written, a leading byte order mark kept (shared ADR-0100).
 */
export const nip44Decrypt = (
  conversationKey: Uint8Array,
  payload: string,
  maxPlaintextSize: number = NIP44_DEFAULT_MAX_PLAINTEXT_SIZE,
): string => {
  assertConversationKey(conversationKey)
  assertMaxPlaintextSize(maxPlaintextSize)
  if (payload.length > payloadLengthFor(maxPlaintextSize)) {
    throw new Nip44CryptoError(`invalid payload length: ${payload.length}`)
  }
  const plaintext = refusedAs(() => nip44v2.decrypt(payload, conversationKey), refusal)
  if (exceedsUtf8Bytes(plaintext, maxPlaintextSize)) throw new Nip44CryptoError("Plaintext exceeds the maximum length")
  return plaintext
}
