/**
 * Returned (inside `Failure(...)`) by `verifyNutzapDleq` when a nutzap's proofs do not verify against its mint's
 * keysets by NUT-12's DLEQ (shared ADR-0121), naming the first check that failed: the nutzap has no proof, a proof names
 * a keyset not supplied, a keyset is in a unit other than the nutzap's, a keyset has no key for a proof's amount, or a
 * proof's DLEQ does not verify against that key, a proof missing a field the check needs included.
 */
export type NutzapDleqFailure =
  | "no-proof"
  | "unknown-keyset"
  | "unit-mismatch"
  | "no-mint-key"
  | "dleq-invalid"
