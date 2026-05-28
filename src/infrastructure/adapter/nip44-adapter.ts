import { Nip44CryptoError } from "../../domain/exception/nip44-crypto-error.ts"
import { errorMessage } from "../../domain/service/error-utils.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import { v2 as nip44v2 } from "../crypto/nip44-v2.ts"

/**
 * Boundary between the vendored NIP-44 v2 implementation (`src/infrastructure/crypto/nip44-v2.ts`,
 * byte-faithful to upstream, throws plain `Error`) and the rest of the codebase, which speaks the
 * `Nip44CryptoError` tagged-error vocabulary. Every exit point here remaps an upstream throw into
 * a domain-typed throw — that is the only protocol work this file does; the cryptography itself
 * is not duplicated, modified, or wrapped beyond the error remap.
 */

const remap = <T>(fn: () => T): T => {
  try {
    return fn()
  } catch (error) {
    throw new Nip44CryptoError(errorMessage(error), error)
  }
}

/** Smallest plaintext length the NIP-44 v2 padding scheme accepts, in bytes. */
export const NIP44_MIN_PLAINTEXT_SIZE: number = nip44v2.utils.minPlaintextSize
/** Largest plaintext length the NIP-44 v2 padding scheme accepts, in bytes. */
export const NIP44_MAX_PLAINTEXT_SIZE: number = nip44v2.utils.maxPlaintextSize

/** Derive the symmetric NIP-44 v2 conversation key from a secret key and a peer's public key. */
export const getNip44ConversationKey = (secretKey: Uint8Array, peerPubkey: PublicKey): Uint8Array =>
  remap(() => nip44v2.utils.getConversationKey(secretKey, peerPubkey))

/** NIP-44 v2 encrypt over a pre-derived conversation key. Pass `nonce` for deterministic KAT tests; omitted, a fresh 32-byte nonce is generated. */
export const nip44Encrypt = (conversationKey: Uint8Array, plaintext: string, nonce?: Uint8Array): string =>
  remap(() => nip44v2.encrypt(plaintext, conversationKey, nonce))

/** NIP-44 v2 decrypt over a pre-derived conversation key. Throws `Nip44CryptoError` on bad MAC, malformed payload, or version mismatch. */
export const nip44Decrypt = (conversationKey: Uint8Array, payload: string): string =>
  remap(() => nip44v2.decrypt(payload, conversationKey))
