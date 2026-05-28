import { TaggedError } from "./tagged-error.ts"

/** Discriminator for `JsonCryptoError.tag` — JSON serialise failed, JSON parse failed, ciphertext was empty, or the underlying signer's `nip44*` call returned `Failure`. */
export type JsonCryptoErrorTag =
  | "json-stringify-failed"
  | "json-parse-failed"
  | "empty-ciphertext"
  | "signer-failed"

/**
 * Thrown by `encryptJson` / `decryptJson` when JSON serialisation or the underlying signer fails.
 * `cause` carries the underlying error — a `SignerError` for `signer-failed`, a `SyntaxError` for
 * `json-stringify-failed`, etc. — so callers can introspect without parsing `message`.
 */
export class JsonCryptoError extends TaggedError<JsonCryptoErrorTag> {
  constructor(tag: JsonCryptoErrorTag, message: string, cause?: unknown) {
    super(tag, message, cause)
  }
}
