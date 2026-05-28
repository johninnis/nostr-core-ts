import type { JsonCryptoError } from "../../domain/exception/json-crypto-error.ts"
import { TaggedError } from "../../domain/exception/tagged-error.ts"

/** Discriminator for `GiftWrapUnwrapError.tag` — covers each structural and cryptographic failure point in the NIP-17 outer/inner unwrap sequence. */
export type GiftWrapUnwrapErrorTag =
  | "not-gift-wrap"
  | "seal-decrypt-failed"
  | "seal-malformed"
  | "seal-wrong-kind"
  | "rumor-decrypt-failed"
  | "rumor-malformed"
  | "rumor-wrong-kind"
  | "rumor-pubkey-mismatch"

/**
 * `unwrapGiftWrap` failure surface. The `*-decrypt-failed` tags carry the underlying
 * `JsonCryptoError` as `cause`; the structural tags (`*-malformed`, `*-wrong-kind`,
 * `*-pubkey-mismatch`, `not-gift-wrap`) carry no cause.
 */
export class GiftWrapUnwrapError extends TaggedError<GiftWrapUnwrapErrorTag, JsonCryptoError> {
  constructor(tag: GiftWrapUnwrapErrorTag, message: string, cause?: JsonCryptoError) {
    super(tag, message, cause)
  }
}
