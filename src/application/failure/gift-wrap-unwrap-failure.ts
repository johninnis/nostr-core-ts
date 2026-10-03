import type { RumourParseFailure } from "../../domain/failure/rumour-parse-failure.ts"

/**
 * Returned (inside `Failure(...)`) by `unwrapGiftWrap`; each literal names the structural or cryptographic step of the
 * NIP-59 outer/inner unwrap that failed.
 */
export type GiftWrapUnwrapFailure =
  | "not-gift-wrap"
  | "wrap-signature-invalid"
  | "seal-decrypt-failed"
  | "seal-malformed"
  | "seal-wrong-kind"
  | "seal-signature-invalid"
  | "rumour-decrypt-failed"
  | "rumour-signed"
  | RumourParseFailure
  | "rumour-pubkey-mismatch"
