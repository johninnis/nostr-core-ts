/**
 * Returned (inside `Failure(...)`) by `verifyNutzap` when a parsed NIP-61 nutzap does not verify against its recipient's
 * nutzap info (shared ADR-0128), naming the first check that failed: the info is not by the nutzap's one recipient, it
 * does not list the nutzap's mint as written, the nutzap has no proof that states an amount, a proof is not locked to
 * the info's P2PK key alone, or two proofs name one secret (shared ADR-0131).
 */
export type NutzapVerificationFailure =
  | "recipient-mismatch"
  | "mint-not-listed"
  | "no-proof"
  | "proof-not-locked-to-recipient"
  | "proof-repeated"
