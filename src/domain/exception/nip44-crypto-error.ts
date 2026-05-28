import { TaggedError } from "./tagged-error.ts"

/**
 * Thrown by the NIP-44 v2 codec on any encrypt/decrypt failure: bad MAC, malformed payload,
 * wrong nonce length, version mismatch. Covers both directions; the same fault surface (the
 * vendored codec throwing a plain `Error`) gets the same tagged error type either way.
 */
export class Nip44CryptoError extends TaggedError<"Nip44CryptoError"> {
  constructor(message: string, cause?: unknown) {
    super("Nip44CryptoError", message, cause)
  }
}
