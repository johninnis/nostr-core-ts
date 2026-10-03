/**
 * Returned (inside `Failure(...)`) by `createNip98Validator` when a decoded NIP-98 auth event fails a check; each
 * literal names the check that failed. A header that cannot be decoded is an `AuthHeaderDecodeFailure` instead.
 */
export type Nip98ValidationFailure =
  | "kind"
  | "timestamp"
  | "expired"
  | "u-missing"
  | "u-disagreeing"
  | "u-malformed"
  | "u-mismatch"
  | "method-missing"
  | "method-disagreeing"
  | "method-mismatch"
  | "payload-disagreeing"
  | "payload-unexpected"
  | "payload-missing"
  | "payload-mismatch"
  | "signature"
  | "replay"
