import type { JsonDecryptFailure } from "./json-decrypt-failure.ts"

/**
 * Returned (inside `Failure(...)`) by `decryptPrivateEntries`: `signature-invalid` when the list event's signature does
 * not verify, so its content is never decrypted (NIP-44: "Before decryption, the event's pubkey and signature MUST be
 * validated"), `json-shape-mismatch` when its content decrypts to JSON that is not an array, or the
 * {@link JsonDecryptFailure} of decrypting its content. Discriminate on `type`.
 */
export type PrivateEntriesFailure = { readonly type: "signature-invalid" | "json-shape-mismatch" } | JsonDecryptFailure
