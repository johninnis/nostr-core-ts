import { constantTimeEqual } from "./constant-time-equal.ts"
import { KIND_HTTP_AUTH } from "../value-object/kinds.ts"
import { soleTagValue } from "./tags.ts"
import { verifyEventSignature } from "./verify.ts"
import { sha256Hex } from "./sha256.ts"
import type { NostrEvent } from "../value-object/nostr-event.ts"
import type { PublicKey } from "../value-object/public-key.ts"
import type { Result } from "../value-object/result.ts"
import { failure, ok } from "../value-object/result.ts"
import type { Nip98ValidationFailure } from "../failure/nip98-validation-failure.ts"
import { isEventExpired } from "./expiration.ts"
import type { HttpUrl } from "../value-object/http-url.ts"
import { parseHttpUrl } from "../value-object/http-url.ts"

/**
 * Input to `Nip98Validator.validate` — the already-parsed event plus the request context (URL, method, optional
 * precomputed body hash). The `u` tag must name `url`, the server's own request URL, exactly once read as an `HttpUrl`:
 * only the scheme's and host's case, a default port, credentials and a fragment are ignored, and the path and query
 * compare as written. A `u` tag that is not an absolute `http` or `https` URL is `u-malformed`. The `method` tag must
 * equal `method` exactly, since RFC 9110 method tokens are case-sensitive. `bodyHash` is the SHA-256 of the body as
 * lowercase hex, which the `payload` tag must equal exactly; the hash of the empty body is no body, as an absent
 * `bodyHash` is, so it neither demands nor admits a `payload` tag (shared ADR-0024).
 */
export interface ValidateEventRequest {
  readonly event: NostrEvent
  readonly url: HttpUrl
  readonly method: string
  readonly bodyHash?: string | undefined
}

const EMPTY_BODY_HASH = sha256Hex("")

/**
 * Check a NIP-98 auth event against the request it claims to authorise, as of `at` (Unix seconds): kind, timestamp
 * within `toleranceSeconds`, expiry, `u`/`method`/`payload` binding and signature. Replay is not checked here — it
 * needs a store, which `createNip98Validator` takes as a port.
 */
export const checkNip98Event = (
  request: ValidateEventRequest,
  toleranceSeconds: number,
  at: number,
): Result<PublicKey, Nip98ValidationFailure> => {
  const { event, url, method } = request
  const bodyHash = request.bodyHash === EMPTY_BODY_HASH ? undefined : request.bodyHash
  if (event.kind !== KIND_HTTP_AUTH) {
    return failure("kind")
  }

  if (Math.abs(at - event.created_at) > toleranceSeconds) {
    return failure("timestamp")
  }

  if (isEventExpired(event, at)) {
    return failure("expired")
  }

  const uTag = soleTagValue(event.tags, "u")
  if (uTag.value === null) return failure(uTag.state === "absent" ? "u-missing" : "u-disagreeing")
  const eventUrl = parseHttpUrl(uTag.value)
  if (eventUrl === null) return failure("u-malformed")
  if (eventUrl !== url) {
    return failure("u-mismatch")
  }

  const methodTag = soleTagValue(event.tags, "method")
  if (methodTag.value === null) return failure(methodTag.state === "absent" ? "method-missing" : "method-disagreeing")
  if (methodTag.value !== method) {
    return failure("method-mismatch")
  }

  const payloadTag = soleTagValue(event.tags, "payload")
  if (payloadTag.state === "disagreeing") {
    return failure("payload-disagreeing")
  }
  // Deliberate: a payload tag is valid only for a non-empty body — see ADR-0011
  if (bodyHash === undefined && payloadTag.value !== null) {
    return failure("payload-unexpected")
  }
  if (bodyHash !== undefined) {
    if (payloadTag.value === null) return failure("payload-missing")
    if (!constantTimeEqual(payloadTag.value, bodyHash)) {
      return failure("payload-mismatch")
    }
  }

  if (!verifyEventSignature(event)) return failure("signature")

  return ok(event.pubkey)
}
