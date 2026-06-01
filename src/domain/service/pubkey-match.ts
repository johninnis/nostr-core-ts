import type { PublicKey } from "../value-object/public-key.ts"
import { PubkeyMismatchError } from "../exception/pubkey-mismatch-error.ts"

/** Guards that a signer returned the identity the caller expected. No-ops when `expected` is `null` — there is nothing to check until the user pubkey is known. When `expected` is set and differs from `actual`, fires the optional `onMismatch` hook (host apps react to the account switch, e.g. force logout) and then throws {@link PubkeyMismatchError}. Centralises the check every `Signer` adapter would otherwise duplicate. */
export const assertPubkeyMatches = (
  expected: PublicKey | null,
  actual: PublicKey,
  onMismatch?: (expected: PublicKey, actual: PublicKey) => void,
): void => {
  if (expected === null || expected === actual) return
  onMismatch?.(expected, actual)
  throw new PubkeyMismatchError(expected, actual)
}
