/**
 * Returned (inside `Failure(...)`) by `verifyZapReceipt` when a parsed NIP-57 zap receipt is not to be believed: it was
 * not signed by the recipient's lnurl provider, its zap request names a different lnurl, or the receipt's or the zap
 * request's signature does not verify.
 */
export type ZapReceiptVerificationFailure =
  | "provider-pubkey-mismatch"
  | "lnurl-mismatch"
  | "receipt-signature-invalid"
  | "zap-request-signature-invalid"
