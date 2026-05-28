import { TaggedError } from "./tagged-error.ts"

/**
 * Discriminator for `Nip98ValidationError.tag` — each tag identifies a single, switchable sub-reason
 * for failing an incoming NIP-98 auth check. Prefer matching on these tags over parsing `.message`.
 */
export type Nip98ErrorTag =
  // Authorization-header parsing (only emitted by `parseAuthHeader` and `validateAuthHeader`):
  | "header-too-long"
  | "header-bad-prefix"
  | "header-bad-base64"
  | "header-bad-json"
  | "header-bad-event"
  // Event-shape and freshness:
  | "kind"
  | "timestamp"
  // Expiration tag (NIP-98 optional `expiration` tag):
  | "expiration-multiple"
  | "expiration-malformed"
  | "expired"
  // `u` tag (request URL binding):
  | "u-missing"
  | "u-multiple"
  | "u-malformed"
  | "u-mismatch"
  // `method` tag (HTTP method binding):
  | "method-missing"
  | "method-multiple"
  | "method-mismatch"
  // `payload` tag (request body hash binding):
  | "payload-multiple"
  | "payload-unexpected"
  | "payload-missing"
  | "payload-mismatch"
  // Cryptographic and replay checks:
  | "signature"
  | "replay"

/** Returned (inside `Failure(...)`) by `createNip98Validator` / `parseAuthHeader` when an incoming NIP-98 auth event fails any check. */
export class Nip98ValidationError extends TaggedError<Nip98ErrorTag> {
  constructor(tag: Nip98ErrorTag, message: string, cause?: unknown) {
    super(tag, message, cause)
  }
}
