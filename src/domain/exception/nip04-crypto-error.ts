import { NostrError } from "./nostr-error.ts"

/**
 * Thrown by the NIP-04 codec: by `nip04Decrypt`, always with the message `NIP-04 decryption failed` and no `cause`, for
 * any payload or sender key it cannot decrypt with; by `nip04Encrypt` when the peer key is not a secp256k1 point, the
 * plaintext holds a lone surrogate, which has no UTF-8 encoding, or the plaintext is over 65567 UTF-8 bytes, more than
 * the longest payload `nip04Decrypt` reads could carry. One class for both directions, as for NIP-44.
 */
export class Nip04CryptoError extends NostrError {
  override readonly name: string = "Nip04CryptoError"
}
