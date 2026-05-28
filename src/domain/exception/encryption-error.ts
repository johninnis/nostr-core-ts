import type { JsonCryptoError } from "./json-crypto-error.ts"
import { TaggedError } from "./tagged-error.ts"

/**
 * Wraps a `JsonCryptoError` surfaced by any service that composes `encryptJson` /
 * `decryptJson` while assembling an event payload. `context` is a short caller label
 * (e.g. `"buildDmGiftWraps"`, `"buildReplaceableListEvent"`) folded into the message so
 * grepping logs by service site is straightforward; the underlying `JsonCryptoError` is
 * preserved as `cause` so callers can introspect (`.cause.tag`) without parsing the
 * human-readable `message`.
 *
 * Lives in the domain layer because the wrapped failure (`JsonCryptoError`) does too, and
 * because both call sites — `buildReplaceableListEvent` (domain) and `buildDmGiftWraps`
 * (application) — share this one wrapper. (Earlier drafts had two separate classes —
 * `ReplaceableListEncryptionError` in domain and `EncryptionError` in application — for the
 * same shape with different context labels. Collapsed; don't reintroduce.)
 */
export class EncryptionError extends TaggedError<"EncryptionError", JsonCryptoError> {
  constructor(context: string, cause: JsonCryptoError) {
    super("EncryptionError", `${context}: ${cause.tag}: ${cause.message}`, cause)
  }
}
