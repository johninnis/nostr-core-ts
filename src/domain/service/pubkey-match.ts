import type { SignerFailure } from "../failure/signer-failure.ts"
import type { PublicKey } from "../value-object/public-key.ts"

/**
 * Checks that a signer produced the identity the caller expected. Returns `null` when `expected` is `null` — there is
 * nothing to check until the user pubkey is known — or when the keys match, and otherwise a `pubkey-mismatch`
 * {@link SignerFailure}; a caller with a hook to run on an account switch runs it when the failure is returned.
 * Centralises the check every `Signer` adapter would otherwise duplicate.
 */
export const checkPubkeyMatches = (expected: PublicKey | null, actual: PublicKey): SignerFailure | null => {
  if (expected === null || expected === actual) return null
  return { type: "pubkey-mismatch", message: `Signer pubkey ${actual} does not match expected pubkey ${expected}` }
}
