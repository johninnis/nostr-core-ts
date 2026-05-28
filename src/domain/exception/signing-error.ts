import { TaggedError } from "./tagged-error.ts"

/**
 * Thrown by host application code (NOT by this library) when an event-signing flow fails outside
 * the structured `SignerError` Result path: e.g. a bunker URL fails to parse before any signer
 * is constructed, or a NIP-07 extension is detected at runtime to be absent.
 *
 * `@innis/nostr-core` does not throw `SigningError` itself — every internal signing failure is
 * surfaced as a `Failure(SignerError)` from the `Signer` interface (see {@link SignerError}).
 * `SigningError` exists because downstream Innis packages (`@innis/nostr-nip07`,
 * `@innis/nostr-nip46`, the hubstr host, etc.) throw it at signer-construction boundaries where
 * `Result` isn't available — the construction itself, not a sign call. Keep this class even if
 * `src/` doesn't throw it: removing it breaks every consumer that imports it.
 */
export class SigningError extends TaggedError<"SigningError"> {
  constructor(message: string, cause?: unknown) {
    super("SigningError", message, cause)
  }
}
