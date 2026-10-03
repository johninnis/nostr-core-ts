import { NostrError } from "./nostr-error.ts"

/**
 * Thrown by the NIP-44 v2 codec on any encrypt/decrypt failure: bad MAC, malformed payload, wrong nonce length, version
 * mismatch. Covers both directions; the same fault surface (the vendored codec throwing a plain `Error`) gets the same
 * error type either way.
 */
export class Nip44CryptoError extends NostrError {
  override readonly name: string = "Nip44CryptoError"
}
