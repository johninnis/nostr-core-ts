import { TaggedError } from "./tagged-error.ts"

export class SignerRejectedError extends TaggedError<"SignerRejectedError"> {
  constructor(message = "User rejected the request", cause?: unknown) {
    super("SignerRejectedError", message, cause)
  }
}

// Word-boundary matching so "cancellable" / "cancellation token expired" don't falsely match a
// cancellation-by-user signal. Covers the common English rejection vocabulary thrown by NIP-07
// extensions (Alby, nos2x, etc.) that don't surface a typed error.
const REJECTION_PATTERN = /\b(rejected|denied|cancel(?:led|ed)?)\b/i

/**
 * **Experimental heuristic.** Prefer `error instanceof SignerRejectedError` whenever you control
 * the throw site. This helper exists for NIP-07 extension boundaries that throw raw
 * `Error("user rejected request")` strings — there is no typed error to switch on. The match is
 * locale-sensitive (English-only patterns).
 */
export const isUserRejection = (error: unknown): boolean => {
  if (error instanceof SignerRejectedError) return true
  if (!(error instanceof Error)) return false
  return REJECTION_PATTERN.test(error.message)
}
